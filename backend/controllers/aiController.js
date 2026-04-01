import ChatHistory from '../models/ChatHistory.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { generateText } from '../services/aiService.js';
import { chatWithDocuments } from '../services/chatService.js';
import { predictConfusion } from '../services/confusionService.js';
import { filterStudyWorthChunks } from '../lib/studyContent.js';

const isSummaryTooShort = (text = '') => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean).length;
    const bullets = (text.match(/^[-*]\s+/gm) || []).length;
    return words < 120 || lines < 8 || bullets < 6;
};

const cleanSummaryFormatting = (text = '') => text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\*\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const buildStructuredSummaryFallback = (document, chunks) => {
    const safeChunks = filterStudyWorthChunks(chunks).slice(0, 24);
    const sectionTitles = [...new Set(
        safeChunks
            .map((chunk) => `${chunk.sectionTitle || ''}`.trim())
            .filter((title) => title && title.toLowerCase() !== 'untitled section')
    )].slice(0, 6);
    const keywords = [...new Set(
        safeChunks.flatMap((chunk) => Array.isArray(chunk.keywords) ? chunk.keywords : [])
    )].slice(0, 10);
    const methodChunks = safeChunks
        .filter((chunk) => /(proof|theorem|example|method|algorithm|rule|law)/i.test(`${chunk.sectionTitle || ''} ${chunk.summary || chunk.content || ''}`))
        .slice(0, 4);
    const overviewChunks = safeChunks.slice(0, 3);
    const reviseChunks = safeChunks
        .slice(0, 5)
        .sort((left, right) => (right.tokenCount || 0) - (left.tokenCount || 0))
        .slice(0, 3);

    const lines = [
        'Overview:',
        ...overviewChunks.map((chunk) => `- ${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 220)}`),
        '',
        'Main Topics:',
        ...(sectionTitles.length ? sectionTitles.map((title) => `- ${title}`) : ['- Key sections are still being identified from the document content.']),
        '',
        'Key Ideas and Definitions:',
        ...(keywords.length ? keywords.map((keyword) => `- ${keyword}`) : overviewChunks.map((chunk) => `- ${(chunk.summary || '').slice(0, 120)}`)),
        '',
        'Important Methods, Proofs, or Examples:',
        ...(methodChunks.length ? methodChunks.map((chunk) => `- ${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 220)}`) : ['- No explicit method/proof/example section was confidently extracted from the current chunks.']),
        '',
        'What to Revise First:',
        ...(reviseChunks.length ? reviseChunks.map((chunk) => `- Review ${chunk.sectionTitle || 'this section'}: ${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 180)}`) : [`- Start with the most central ideas in ${document.title}.`])
    ];

    return lines.join('\n').trim();
};

export const summarizeDocument = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (document.summary && !req.query.regenerate) {
        res.json({ summary: document.summary });
        return;
    }

    const chunks = filterStudyWorthChunks(await chunkRepository.listByDocument(document._id));
    if (!chunks.length) {
        throw new AppError('Summary source content is not available yet', 400, 'SUMMARY_SOURCE_EMPTY');
    }
    
    // [OPTIMISATION] Hierarchical Summary
    // We combine the pre-generated chunk summaries from offline processing
    // instead of loading raw chunks, saving massive amount of tokens and hitting Pro dynamically.
    const chunkSummaries = chunks
        .slice(0, 40)
        .map((c) => `- ${c.sectionTitle || 'Section'}: ${(c.summary || c.content || '').replace(/\s+/g, ' ').trim().slice(0, 260)}`)
        .join('\n');
    const summarySource = chunkSummaries || (document.textContent || '').slice(0, 15000);

    let summary = '';
    try {
        summary = await generateText(`You are an expert tutor creating a comprehensive study guide summary for a student.
Document title: ${document.title}

Below are the pre-computed section summaries of the document. Read through the hierarchical flow and produce a final, high-quality overall summary.

Write a structured, meaningful summary with these exact sections:
1. Overview
2. Main Topics
3. Key Ideas and Definitions
4. Important Methods, Proofs, or Examples
5. What to Revise First

Requirements:
- Use concise headings and bullet points.
- Be specific to the provided section summaries.
- Mention important terms from the document, not generic filler.
- Keep the output detailed and study-ready (not just 1-2 lines).
- For each section, provide at least 2-3 meaningful bullet points.
- Include concrete terms, methods, and examples where available.

Section Summaries:
${summarySource}`, { maxTokens: 700 });

        if (isSummaryTooShort(summary)) {
            summary = await generateText(`Improve the summary quality below.
Make it detailed, specific, and readable for revision.
Keep sections exactly:
1. Overview
2. Main Topics
3. Key Ideas and Definitions
4. Important Methods, Proofs, or Examples
5. What to Revise First

Current summary:
${summary}

Reference section summaries:
${summarySource}`, { maxTokens: 760 });
        }
    } catch (error) {
        summary = buildStructuredSummaryFallback(document, chunks);
    }

    summary = cleanSummaryFormatting(summary);

    if (isSummaryTooShort(summary)) {
        summary = buildStructuredSummaryFallback(document, chunks);
    }

    document.summary = summary;
    await document.save();

    res.json({ summary });
});

export const explainText = asyncHandler(async (req, res) => {
    const { text, mode, documentId } = req.body;
    let context = '';
    let relatedChunks = [];

    if (documentId) {
        const document = await documentRepository.findOwnedDocument(documentId, req.user._id);
        if (document) {
            const concepts = await conceptRepository.listByDocument(documentId);
            context = concepts.map((concept) => `${concept.name}: ${concept.description}`).join('\n');
            relatedChunks = await chunkRepository.listByDocument(documentId);
        }
    }

    const complexity = mode === 'deep' ? 'Provide a technical explanation with detail.' : 'Explain simply for a student.';
    const contextExcerpt = relatedChunks
        .slice(0, 8)
        .map((chunk, index) => `Excerpt ${index + 1} (${chunk.sectionTitle || 'Section'}): ${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 260)}`)
        .join('\n');
    const explanation = await generateText(`${complexity}

Question or concept: ${text}

Relevant concept map context:
${context}

Relevant document excerpts:
${contextExcerpt}`, { maxTokens: 520 });

    res.json({ explanation });
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
