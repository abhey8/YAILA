import ChatHistory from '../models/ChatHistory.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { formatChunksForPrompt, sampleChunksForPrompt } from '../lib/documentContext.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { generateText } from '../services/aiService.js';
import { chatWithDocument } from '../services/chatService.js';
import { predictConfusion } from '../services/confusionService.js';

export const summarizeDocument = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (document.summary && !req.query.regenerate) {
        res.json({ summary: document.summary });
        return;
    }

    const chunks = await chunkRepository.listByDocument(document._id);
    const sampledChunks = sampleChunksForPrompt(chunks, 14);
    const summarySource = sampledChunks.length
        ? formatChunksForPrompt(sampledChunks)
        : (document.textContent || '').slice(0, 22000);
    const summary = await generateText(`You are creating a study summary for a student.
Document title: ${document.title}

Use only the document content below. Write a structured, meaningful summary with these exact sections:
1. Overview
2. Main Topics
3. Key Ideas and Definitions
4. Important Methods, Proofs, or Examples
5. What to Revise First

Requirements:
- Use concise headings and bullet points.
- Be specific to the uploaded document.
- Mention important terms from the document, not generic filler.
- If the document is lecture notes, summarize the lecture flow and teaching points.

Document content:
${summarySource}`);
    document.summary = summary;
    await document.save();

    res.json({ summary });
});

export const explainText = asyncHandler(async (req, res) => {
    const { text, mode, documentId } = req.body;
    let context = '';

    if (documentId) {
        const document = await documentRepository.findOwnedDocument(documentId, req.user._id);
        if (document) {
            const concepts = await conceptRepository.listByDocument(documentId);
            context = concepts.map((concept) => `${concept.name}: ${concept.description}`).join('\n');
        }
    }

    const complexity = mode === 'deep' ? 'Provide a technical explanation with detail.' : 'Explain simply for a student.';
    const explanation = await generateText(`${complexity}\n\nQuestion or concept: ${text}\n\nRelevant concept map context:\n${context}`);
    res.json({ explanation });
});

export const chatDocument = asyncHandler(async (req, res) => {
    const { message, history } = req.body;
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const result = await chatWithDocument({
        document,
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

export const getConfusionSignals = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const confusion = await predictConfusion(req.user._id, document._id);
    res.json(confusion);
});
