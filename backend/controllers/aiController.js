import ChatHistory from '../models/ChatHistory.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { generateText } from '../services/aiService.js';
import { chatWithDocuments } from '../services/chatService.js';
import { predictConfusion } from '../services/confusionService.js';
import { retrieveRelevantChunks, resolveQueryableDocuments } from '../services/retrievalService.js';
import { scheduleDocumentSummary } from '../services/summaryService.js';

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
