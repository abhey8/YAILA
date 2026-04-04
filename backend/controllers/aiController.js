import ChatHistory from '../models/ChatHistory.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { normalizeWhitespace } from '../lib/text.js';
import { filterStudyWorthChunks, filterStudyWorthConcepts } from '../lib/studyContent.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { generateText } from '../services/aiService.js';
import { chatWithDocuments } from '../services/chatService.js';
import { predictConfusion } from '../services/confusionService.js';
import { retrieveRelevantChunks, resolveQueryableDocuments } from '../services/retrievalService.js';
import { scheduleDocumentSummary } from '../services/summaryService.js';

const toPlainRecord = (value) => (typeof value?.toObject === 'function' ? value.toObject() : value);

const normalizeMatchText = (value = '') => normalizeWhitespace(`${value}`).toLowerCase();

const lexicalScore = (query = '', content = '') => {
    const normalizedQuery = normalizeMatchText(query);
    const normalizedContent = normalizeMatchText(content);
    const queryTerms = normalizedQuery.split(/[^a-z0-9]+/).filter((token) => token.length > 2);

    if (!queryTerms.length || !normalizedContent) {
        return 0;
    }

    const matches = queryTerms.filter((token) => normalizedContent.includes(token)).length;
    const phraseBoost = normalizedQuery && normalizedContent.includes(normalizedQuery) ? 0.25 : 0;
    const sectionBoost = /\b(theorem|proof|definition|lemma|example|induction|algorithm)\b/.test(normalizedContent) ? 0.08 : 0;
    return Math.min(1, (matches / queryTerms.length) + phraseBoost + sectionBoost);
};

const mergeUniqueChunks = (chunks = []) => {
    const merged = new Map();

    chunks
        .map(toPlainRecord)
        .forEach((chunk) => {
            if (!chunk) return;
            const key = chunk?._id?.toString?.() || `${chunk.document}-${chunk.chunkIndex}`;
            const existing = merged.get(key);
            if (!existing || (chunk.semanticScore || 0) > (existing.semanticScore || 0)) {
                merged.set(key, chunk);
            }
        });

    return [...merged.values()];
};

const cleanTutorText = (text = '') => text
    .replace(/\r/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\t+/g, '  ')
    .replace(/[ ]{3,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .join('\n')
    .trim();

const formatExcerpt = (chunk, index) => `Excerpt ${index + 1} (${chunk.sectionTitle || 'Section'}, pages ${chunk.pageStart || 1}-${chunk.pageEnd || chunk.pageStart || 1}): ${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 320)}`;
const isBroadOverviewQuery = (text = '') => /(study plan|roadmap|overview|what topics|what does this book cover|whole book|whole document|summari[sz]e)/i.test(normalizeMatchText(text));
const isFrontMatterChunk = (chunk = {}) => /table of contents|preface|copyright|about the author|acknowledg|dedication|use of the book|support on the world wide web|prerequisites|exercises? for section/i
    .test(normalizeMatchText(`${chunk.sectionTitle || ''} ${chunk.summary || ''} ${chunk.content || ''}`));
const findStrongTopicChunks = (chunks = [], evidenceTerms = []) => {
    const terms = [...new Set(
        evidenceTerms
            .flatMap((value) => normalizeMatchText(value).split(/[^a-z0-9]+/))
            .filter((token) => token.length > 3)
    )];
    if (!terms.length) {
        return chunks;
    }

    const strongMatches = chunks.filter((chunk) => {
        const haystack = normalizeMatchText(`${chunk.sectionTitle || ''} ${chunk.summary || ''} ${chunk.content || ''}`);
        return terms.every((term) => haystack.includes(term));
    });

    return strongMatches.length ? strongMatches : chunks;
};

const looksNoisyLabel = (value = '') => {
    const normalized = normalizeWhitespace(value);
    const tokens = normalized.split(/\s+/).filter(Boolean);
    return !normalized
        || normalized.length <= 5
        || tokens.some((token) => token.length === 1)
        || (tokens.length >= 2 && tokens[0].length <= 2 && tokens[1].length >= 6)
        || (normalized.match(/\b[a-z0-9]\b/gi) || []).length >= 3
        || /[^\w\s(),:;-]{2,}/.test(normalized);
};

const formatSectionReference = (chunk) => {
    const title = normalizeWhitespace(chunk.sectionTitle || '');
    const pageLabel = `pages ${chunk.pageStart || 1}-${chunk.pageEnd || chunk.pageStart || 1}`;
    if (!title || looksNoisyLabel(title)) {
        return pageLabel;
    }
    return `${title} (${pageLabel})`;
};

const isLowQualityTutorReply = (text = '') => {
    const normalized = normalizeWhitespace(text);
    if (!normalized || normalized.length < 120) {
        return true;
    }

    const excerptLeak = /excerpt\s+\d+/i.test(normalized);
    const promptLeak = /please use excerpt|now, let'?s start|first question|describe it in detail/i.test(normalized);
    const artifactTokens = (normalized.match(/\button\b/gi) || []).length;
    const controlLikeNoise = /[^\w\s(),.:;'"!?-]{3,}/.test(text);
    return excerptLeak || promptLeak || artifactTokens > 0 || controlLikeNoise;
};

const buildTopicExplanationFallback = ({ topic = '', concepts = [], chunks = [] }) => {
    const conceptQualityScore = (concept = {}) => {
        const name = normalizeWhitespace(concept.name || '');
        const description = normalizeWhitespace(concept.description || '');
        let score = concept.matchScore || 0;
        if (Array.isArray(concept.chunkRefs) && concept.chunkRefs.length > 0) {
            score += 0.35;
        }
        if (/^relation between|^branch of|^mathematics\b|^definition of/i.test(name)) {
            score -= 0.45;
        }
        if (description.length >= 40) {
            score += 0.1;
        }
        return score;
    };

    const rankedFallbackConcepts = [...concepts]
        .sort((left, right) => conceptQualityScore(right) - conceptQualityScore(left));
    const leadConcept = rankedFallbackConcepts[0];
    const supportingConcepts = rankedFallbackConcepts
        .slice(1, 4)
        .map((concept) => concept.name)
        .filter((name) => name && !/^relation between|^branch of|^definition of/i.test(normalizeWhitespace(name)));
    const sectionReferences = [...new Set(chunks.slice(0, 4).map(formatSectionReference))];
    const leadDescription = normalizeWhitespace(leadConcept?.description || '')
        || `${topic} is a key topic discussed in this document.`;

    return [
        'What it is:',
        leadDescription,
        '',
        'Why it matters:',
        supportingConcepts.length
            ? `${topic} is connected in this document to ${supportingConcepts.join(', ')}.`
            : `${topic} matters because it appears as an important idea in the document’s study path.`,
        '',
        'Where to study it in this document:',
        ...(sectionReferences.length
            ? sectionReferences.map((reference) => `- ${reference}`)
            : ['- Review the sections most directly associated with this topic in the document.']),
        '',
        'How to study it:',
        '- Start with the definition or basic statement of the topic.',
        '- Then work through one supporting example, construction, or proof idea from the listed pages.',
        '- After that, connect it to the nearby concepts shown in the roadmap or graph before moving on.'
    ].join('\n').trim();
};

export const summarizeDocument = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (document.ingestionStatus !== 'completed') {
        throw new AppError('Document processing is not complete yet', 409, 'DOCUMENT_NOT_READY');
    }

    const regenerate = `${req.query.regenerate || ''}` === 'true';

    if (document.summary && document.summaryStatus === 'ready' && !regenerate) {
        res.json({
            status: 'ready',
            summary: document.summary,
            updatedAt: document.summaryUpdatedAt
        });
        return;
    }

    if (regenerate || document.summaryStatus !== 'generating') {
        scheduleDocumentSummary(document._id, { force: regenerate });
    }

    res.status(202).json({
        status: 'generating',
        summary: document.summary || '',
        updatedAt: document.summaryUpdatedAt,
        error: document.summaryError || null
    });
});

export const explainText = asyncHandler(async (req, res) => {
    const { text, mode, documentId } = req.body;
    let context = '';
    let relatedChunks = [];
    let documentSummary = '';
    let matchedConcepts = [];

    if (documentId) {
        const document = await documentRepository.findOwnedDocument(documentId, req.user._id);
        if (document) {
            documentSummary = `${document.summary || ''}`.trim();
            const concepts = filterStudyWorthConcepts(await conceptRepository.listByDocument(documentId));
            const rankedConcepts = concepts
                .map((concept) => ({
                    ...toPlainRecord(concept),
                    matchScore: lexicalScore(text, `${concept.name || ''} ${concept.description || ''} ${(concept.keywords || []).join(' ')}`)
                }))
                .filter((concept) => concept.matchScore >= 0.18 || normalizeMatchText(text).includes(normalizeMatchText(concept.name || '')))
                .sort((left, right) => right.matchScore - left.matchScore)
                .slice(0, 6);
            matchedConcepts = rankedConcepts;
            const anchoredConcepts = rankedConcepts
                .filter((concept) => Array.isArray(concept.chunkRefs) && concept.chunkRefs.length > 0)
                .slice(0, 4);
            const anchorChunkIds = [...new Set(
                anchoredConcepts.flatMap((concept) => concept.chunkRefs.map((chunkId) => chunkId.toString()))
            )].slice(0, 24);

            const [retrievedChunksRaw, lexicalChunksRaw, anchorChunksRaw] = await Promise.all([
                retrieveRelevantChunks({
                    userId: req.user._id,
                    documentId,
                    query: text,
                    topK: 8,
                    policy: {
                        finalContextSize: 6,
                        maxPerSection: 2
                    }
                }),
                chunkRepository.lexicalSearchByDocuments([documentId], req.user._id, text, 8),
                anchorChunkIds.length ? chunkRepository.listByIds(anchorChunkIds) : Promise.resolve([])
            ]);
            const anchorIndexes = anchorChunksRaw.map((chunk) => chunk.chunkIndex).filter(Number.isFinite);
            const adjacentAnchorChunksRaw = anchorIndexes.length
                ? await chunkRepository.listAdjacentByDocument(documentId, anchorIndexes, 1)
                : [];

            const evidenceTerms = [
                text,
                ...rankedConcepts.slice(0, 4).map((concept) => concept.name || '')
            ];
            const retrievedChunks = findStrongTopicChunks(
                mergeUniqueChunks([
                    ...retrievedChunksRaw,
                    ...lexicalChunksRaw,
                    ...anchorChunksRaw,
                    ...adjacentAnchorChunksRaw
                ])
                .filter((chunk) => !isFrontMatterChunk(chunk)),
                evidenceTerms
            );
            const fallbackRetrievedChunks = retrievedChunks.length ? retrievedChunks : mergeUniqueChunks(retrievedChunksRaw);

            relatedChunks = mergeUniqueChunks(fallbackRetrievedChunks)
                .map((chunk) => ({
                    ...chunk,
                    matchScore: lexicalScore(text, `${chunk.sectionTitle || ''} ${chunk.summary || ''} ${chunk.content || ''}`),
                    conceptScore: Math.max(0, ...rankedConcepts.map((concept) => lexicalScore(concept.name || '', `${chunk.sectionTitle || ''} ${chunk.summary || ''} ${chunk.content || ''}`))),
                    anchorBoost: anchorChunkIds.includes(chunk?._id?.toString?.()) ? 0.2 : 0
                }))
                .sort((left, right) => {
                    const leftScore = left.matchScore + (left.conceptScore * 0.7) + (left.semanticScore || 0) + left.anchorBoost;
                    const rightScore = right.matchScore + (right.conceptScore * 0.7) + (right.semanticScore || 0) + right.anchorBoost;
                    return rightScore - leftScore;
                })
                .slice(0, 8);

            context = rankedConcepts
                .map((concept) => `${concept.name}: ${(concept.description || '').replace(/\s+/g, ' ').trim().slice(0, 200)}`)
                .join('\n');
        }
    }

    const complexity = mode === 'deep'
        ? 'Explain this in depth with these short sections: What it is, Why it matters, How it appears in this document, and Example or proof idea.'
        : 'Explain this simply for a student with a focus on the main idea and why it matters.';
    const contextExcerpt = relatedChunks
        .slice(0, 8)
        .map((chunk, index) => formatExcerpt(chunk, index))
        .join('\n');
    const overviewContext = isBroadOverviewQuery(text)
        ? (documentSummary ? documentSummary.replace(/\s+/g, ' ').trim().slice(0, 700) : 'No saved document summary available.')
        : 'Skip broad document context and focus on the matched topic excerpts.';
    let explanation = await generateText(`You are a careful tutor helping a student understand a topic from an uploaded document.

Document-grounding rules:
- Use the relevant excerpts below for document-specific claims.
- Ignore front matter, table of contents, copyright pages, acknowledgements, dedications, and exercise headings unless they are directly relevant.
- The source text may contain PDF extraction spacing artifacts such as "pro v e", "In tuition", or "Con ten ts". Mentally normalize those into natural words and never repeat the broken spacing in your answer.
- If the relevant excerpts are partial, say so briefly and still explain the topic clearly.
- Use plain text only. Do not use markdown symbols like # or **.

${complexity}

Question or concept: ${text}

Document summary:
${overviewContext}

Relevant concept map context:
${context || 'No closely matched concept entries were found.'}

Relevant document excerpts:
${contextExcerpt || 'No closely matched excerpts were found.'}`, { maxTokens: 620 });

    explanation = cleanTutorText(explanation);
    if (isLowQualityTutorReply(explanation)) {
        explanation = buildTopicExplanationFallback({
            topic: text,
            concepts: matchedConcepts,
            chunks: relatedChunks
        });
    }

    res.json({ explanation });
});

export const retrieveContext = asyncHandler(async (req, res) => {
    const { query, documentIds = [], topK } = req.body;
    if (!`${query || ''}`.trim()) {
        throw new AppError('Query is required', 400, 'MISSING_QUERY');
    }

    const documents = await resolveQueryableDocuments({
        userId: req.user._id,
        documentIds
    });

    if (!documents.length) {
        throw new AppError('No documents available for retrieval', 404, 'DOCUMENTS_NOT_FOUND');
    }

    const chunks = await retrieveRelevantChunks({
        userId: req.user._id,
        documentIds: documents.map((document) => document._id),
        query,
        topK
    });

    res.json({
        query,
        documents: documents.map((document) => ({
            id: document._id,
            title: document.title || document.originalName
        })),
        chunks: chunks.map((chunk) => ({
            id: chunk._id,
            document: chunk.document,
            documentTitle: chunk.documentTitle || 'Uploaded Document',
            sectionTitle: chunk.sectionTitle || 'Untitled Section',
            pageStart: chunk.pageStart || 1,
            pageEnd: chunk.pageEnd || chunk.pageStart || 1,
            chunkIndex: chunk.chunkIndex || 0,
            semanticScore: chunk.semanticScore || 0,
            summary: chunk.summary || '',
            keywords: chunk.keywords || [],
            content: chunk.content
        }))
    });
});

export const chatDocument = asyncHandler(async (req, res) => {
    const { message, history } = req.body;
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const result = await chatWithDocuments({
        documents: [document],
        userId: req.user._id,
        message,
        history
    });

    res.json(result);
});

export const chatDocumentCollection = asyncHandler(async (req, res) => {
    const { message, history, documentIds = [] } = req.body;
    const documents = await documentRepository.listOwnedDocumentsByIds(req.user._id, documentIds);
    if (!documents.length) {
        throw new AppError('No documents available for this query', 404, 'DOCUMENTS_NOT_FOUND');
    }

    const fullDocuments = await Promise.all(
        documents.map((document) => documentRepository.findOwnedDocument(document._id, req.user._id))
    );

    const result = await chatWithDocuments({
        documents: fullDocuments.filter(Boolean),
        userId: req.user._id,
        message,
        history
    });

    res.json(result);
});

export const getChatHistory = asyncHandler(async (req, res) => {
    const history = await ChatHistory.findOne({ document: req.params.id, user: req.user._id });
    res.json(history ? history.messages : []);
});

export const getCollectionChatHistory = asyncHandler(async (req, res) => {
    const documentIds = (req.query.documentIds || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    if (!documentIds.length) {
        res.json([]);
        return;
    }

    const history = await ChatHistory.findOne({
        document: null,
        user: req.user._id,
        sourceDocuments: { $all: documentIds }
    });

    const messages = history?.sourceDocuments?.length === documentIds.length ? history.messages : [];
    res.json(messages);
});

export const getConfusionSignals = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const confusion = await predictConfusion(req.user._id, document._id);
    res.json(confusion);
});
