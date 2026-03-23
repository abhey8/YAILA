import ChatHistory from '../models/ChatHistory.js';
import { recordLearningInteraction } from './analyticsService.js';
import { generateText } from './aiService.js';
import { retrieveRelevantChunks } from './retrievalService.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { updateConceptMastery } from './masteryService.js';
import { logger } from '../lib/logger.js';

const NOT_FOUND_MESSAGE = 'Information not found in uploaded materials.';

const normalizeText = (value = '') => value.toLowerCase().replace(/\s+/g, ' ').trim();

const isGreetingIntent = (message = '') => /^(hi|hello|hey|yo|hola|namaste|good (morning|afternoon|evening))\b/i.test(normalizeText(message));
const isQuestionGenerationIntent = (message = '') => /(give|generate|create|make).*(question|questions|qs|quiz|mcq)|question.*from.*book|practice.*question|couple\s+qs/i.test(normalizeText(message));

const parseRequestedQuestionCount = (message = '') => {
    const text = normalizeText(message);
    if (/\bcouple\b|\btwo\b/.test(text)) return 2;
    const match = text.match(/\b(\d{1,2})\b/);
    if (!match) return 3;
    return Math.min(10, Math.max(2, Number(match[1])));
};

const extractChunkKeywords = (text = '') => {
    const tokens = text.toLowerCase().match(/[a-z]{4,}/g) || [];
    const stop = new Set(['this', 'that', 'with', 'from', 'into', 'there', 'their', 'about', 'which', 'where', 'while', 'would', 'could', 'should', 'have', 'been', 'also', 'they', 'them', 'were', 'what', 'when']);
    const freq = new Map();
    tokens.forEach((token) => {
        if (!stop.has(token)) {
            freq.set(token, (freq.get(token) || 0) + 1);
        }
    });
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([token]) => token);
};

const buildFallbackQuestionsFromChunks = (message, chunks = []) => {
    const top = chunks.slice(0, 4);
    if (!top.length) {
        return NOT_FOUND_MESSAGE;
    }

    const requested = parseRequestedQuestionCount(message);
    const allKeywords = extractChunkKeywords(top.map((c) => c.content || '').join(' '));
    const sectionPool = top.map((chunk) => chunk.sectionTitle || 'this section');
    const questions = [];

    for (let index = 0; index < requested; index += 1) {
        const section = sectionPool[index % sectionPool.length];
        const keyword = allKeywords[index % Math.max(allKeywords.length, 1)] || 'core concept';
        questions.push(`${index + 1}. Explain "${keyword}" as presented in ${section}.`);
    }

    return `I could not reach the AI model right now, but based on your uploaded document, here are ${requested} focused practice questions:\n${questions.join('\n')}`;
};

const buildFallbackReplyFromChunks = (question, chunks = []) => {
    const topChunks = chunks.slice(0, 2);
    if (!topChunks.length) {
        return NOT_FOUND_MESSAGE;
    }

    if (isGreetingIntent(question)) {
        const title = topChunks[0].documentTitle || 'your document';
        const section = topChunks[0].sectionTitle || 'the current section';
        const keywords = extractChunkKeywords(topChunks.map((c) => c.content).join(' ')).slice(0, 4);
        return `Ready to study ${title}. We can start with ${section}. Suggested focus topics: ${keywords.join(', ')}. Ask for summary, flashcards, or quiz questions.`;
    }

    if (isQuestionGenerationIntent(question)) {
        return buildFallbackQuestionsFromChunks(question, topChunks);
    }

    const excerpts = topChunks
        .map((chunk, index) => {
            const content = (chunk.content || '').replace(/\s+/g, ' ').trim();
            const snippet = content.slice(0, 320);
            return `${index + 1}. ${snippet}${content.length > 320 ? '...' : ''}`;
        })
        .join('\n');

    return `I could not reach the AI model right now, so here are the most relevant excerpts from your uploaded materials for "${question}":\n${excerpts}`;
};

const buildPrompt = ({ documentTitles, message, chunks, history }) => {
    const context = chunks.map((chunk, index) => (
        `Source ${index + 1}\nDocument: ${chunk.documentTitle}\nSection: ${chunk.sectionTitle || 'Untitled Section'}\nExcerpt:\n${chunk.content}`
    )).join('\n\n');

    const memory = history
        .slice(-6)
        .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
        .join('\n');

    return `You are a study assistant answering strictly from uploaded materials.
Available uploaded materials:
${documentTitles.map((title) => `- ${title}`).join('\n')}

Rules:
- Use only the retrieved document excerpts.
- If the answer is not supported by the excerpts, reply with exactly: "${NOT_FOUND_MESSAGE}"
- Do not answer from general knowledge.
- Keep the answer concise and study-focused.
- Do NOT include a "Sources:" line in the response body.
- Provide clean final answer text only.

Conversation memory:
${memory || 'None'}

Retrieved excerpts:
${context}

Student question:
${message}`;
};

const stripModelSourcesLine = (text = '') => text
    .split('\n')
    .filter((line) => !/^sources?\s*:/i.test(line.trim()))
    .join('\n')
    .trim();

const toCitation = (chunk) => ({
    document: chunk.document,
    chunk: chunk._id,
    documentTitle: chunk.documentTitle || 'Uploaded Document',
    sectionTitle: chunk.sectionTitle || 'Untitled Section',
    chunkIndex: chunk.chunkIndex || 0
});

const uniqueCitations = (chunks) => {
    const seen = new Set();
    return chunks
        .map(toCitation)
        .filter((citation) => {
            const key = `${citation.document?.toString?.() || citation.documentTitle}:${citation.sectionTitle}:${citation.chunkIndex}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        })
        .slice(0, 4);
};

export const chatWithDocuments = async ({
    documents,
    userId,
    message,
    history = []
}) => {
    const documentIds = documents.map((document) => document._id);
    const documentTitles = documents.map((document) => document.title || document.originalName);

    const chunks = await retrieveRelevantChunks({
        userId,
        documentIds,
        query: message
    });

    const hasProcessingDocs = documents.some(doc => ['queued', 'extracting', 'processing', 'embedding_partial'].includes(doc.ingestionStatus));
    
    // Check if documents are actually processed and have content
    const totalChunkCount = documents.reduce((sum, doc) => sum + (doc.chunkCount || 0), 0);
    if (totalChunkCount === 0 && !hasProcessingDocs) {
        return {
            reply: "I couldn't find any readable text in the uploaded document(s). This usually happens with scanned PDFs or images. Please try uploading a text-based PDF or providing more materials.",
            retrievedChunks: [],
            citations: [],
            concepts: []
        };
    }

    if (hasProcessingDocs && chunks.length < 2) {
        return {
            status: "DOCUMENT_STILL_PROCESSING",
            reply: "The document is still being analyzed in the background. Please wait a moment while I finish extracting the relevant sections.",
            retrievedChunks: [],
            citations: [],
            concepts: []
        };
    }

    if (!chunks.length || (chunks[0]?.rerankScore ?? 0) < 0.03) {
        return {
            reply: NOT_FOUND_MESSAGE,
            retrievedChunks: [],
            citations: [],
            concepts: []
        };
    }

    const { buildOptimisedContext, pruneRetrievedChunks } = await import('./tokenOptimisationService.js');
    const { routeAIRequest } = await import('./aiRouterService.js');
    const { generateCacheKey, getCachedResponse, setCachedResponse } = await import('./aiCacheService.js');
    const { aiQueueService } = await import('./aiQueueService.js');

    const concepts = await conceptRepository.listByDocuments(documentIds);
    const matchedConcepts = concepts
        .filter((concept) => chunks.some((chunk) => concept.chunkRefs.some((chunkId) => chunkId.toString() === chunk._id.toString())))
        .slice(0, 5);

    // [OPTIMISATION] Context Saftey Guard 
    const prunedChunks = pruneRetrievedChunks(chunks);
    const citations = uniqueCitations(prunedChunks);

    // [OPTIMISATION] Token compression
    const compressedHistory = buildOptimisedContext(history);
    const prompt = buildPrompt({ documentTitles, message, chunks: prunedChunks, history: history.slice(-6) }); // Still using strict array history for raw prompt
    
    // [OPTIMISATION] Response Caching
    const cacheKey = generateCacheKey(message, compressedHistory);
    let reply = await getCachedResponse(cacheKey);

    if (!reply) {
        // [OPTIMISATION] Model Routing 
        const selectedModel = routeAIRequest(message, history);

        try {
            // [OPTIMISATION] Queue & Rate limiter
            reply = await aiQueueService.enqueue(
                () => generateText(prompt, { model: selectedModel }),
                45000
            );
            reply = stripModelSourcesLine(reply);
        } catch (error) {
            if (
                error.statusCode === 402
                || error.statusCode === 429
                || error.statusCode === 504
                || /quota|rate limit|timeout|credits|payment/i.test(error.message || '')
            ) {
                return {
                    reply: buildFallbackReplyFromChunks(message, prunedChunks),
                    retrievedChunks: prunedChunks.map((chunk) => ({
                        id: chunk._id,
                        content: chunk.content,
                        score: chunk.rerankScore,
                        documentId: chunk.document,
                        documentTitle: chunk.documentTitle,
                        sectionTitle: chunk.sectionTitle || 'Untitled Section',
                        chunkIndex: chunk.chunkIndex
                    })),
                    citations,
                    concepts: matchedConcepts
                };
            }
            throw error;
        }

        // Store cache in background
        setCachedResponse(cacheKey, reply).catch((error) => {
            logger.warn('[Chat] Cache write skipped', { error: error.message });
        });
    }

    let chatSession = documentIds.length === 1
        ? await ChatHistory.findOne({ document: documentIds[0], user: userId })
        : await ChatHistory.findOne({ document: null, user: userId, sourceDocuments: { $all: documentIds } });

    if (chatSession && documentIds.length > 1 && (chatSession.sourceDocuments?.length || 0) !== documentIds.length) {
        chatSession = null;
    }
    if (!chatSession) {
        chatSession = new ChatHistory({
            document: documentIds.length === 1 ? documentIds[0] : null,
            user: userId,
            sourceDocuments: documentIds,
            messages: []
        });
    }

    const retrievedChunkIds = chunks.map((chunk) => chunk._id);
    const conceptIds = matchedConcepts.map((concept) => concept._id);

    chatSession.messages.push({
        role: 'user',
        content: message,
        retrievedChunkIds,
        conceptIds,
        citations
    });
    chatSession.messages.push({
        role: 'ai',
        content: reply,
        retrievedChunkIds,
        conceptIds,
        citations
    });
    await chatSession.save();

    if (matchedConcepts.length) {
        await recordLearningInteraction({
            userId,
            documentId: documentIds[0],
            conceptIds,
            timeSpentSeconds: 90,
            chatQuestions: 1
        });

        await updateConceptMastery({
            userId,
            documentId: documentIds[0],
            conceptIds,
            sourceType: 'chat',
            score: 0.65
        });
    }

    return {
        reply,
        retrievedChunks: chunks.map((chunk) => ({
            id: chunk._id,
            content: chunk.content,
            score: chunk.rerankScore,
            documentId: chunk.document,
            documentTitle: chunk.documentTitle,
            sectionTitle: chunk.sectionTitle || 'Untitled Section',
            chunkIndex: chunk.chunkIndex
        })),
        citations,
        concepts: matchedConcepts
    };
};
