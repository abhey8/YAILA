import ChatHistory from '../models/ChatHistory.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { generateText } from '../services/aiService.js';
import { chatWithDocuments } from '../services/chatService.js';
import { predictConfusion } from '../services/confusionService.js';

const extractKeywords = (text = '') => {
    const words = (text.toLowerCase().match(/[a-z]{4,}/g) || [])
        .filter((word) => !['this', 'that', 'with', 'from', 'were', 'have', 'been', 'into', 'your', 'about', 'there', 'their', 'which', 'these', 'those', 'using', 'used', 'also'].includes(word));
    const freq = new Map();
    words.forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word]) => word);
};

const fallbackStructuredSummary = (document, chunks = []) => {
    const topChunks = chunks.slice(0, 14);
    const sectionTitles = [...new Set(topChunks.map((c) => c.sectionTitle).filter(Boolean))].slice(0, 8);
    const combined = topChunks.map((c) => c.content).join('\n');
    const keywords = extractKeywords(combined);
    const importantPoints = topChunks.slice(0, 6).map((chunk) => `- ${chunk.summary || chunk.content.slice(0, 160)}${(chunk.summary || chunk.content).length > 160 ? '...' : ''}`);

    return [
        '1. Overview',
        `- ${document.title || document.originalName} covers foundational topics across ${Math.max(sectionTitles.length, 1)} major sections.`,
        '',
        '2. Main Topics',
        ...(sectionTitles.length ? sectionTitles.map((title) => `- ${title}`) : ['- Core concepts extracted from the uploaded material']),
        '',
        '3. Key Ideas and Definitions',
        ...(keywords.length ? keywords.slice(0, 8).map((kw) => `- ${kw}`) : ['- Key terms are still being identified from extracted content']),
        '',
        '4. Important Methods, Proofs, or Examples',
        ...(importantPoints.length ? importantPoints : ['- No detailed methods were extracted in fallback mode']),
        '',
        '5. What to Revise First',
        ...(sectionTitles.length ? sectionTitles.slice(0, 3).map((title) => `- Revise ${title}`) : ['- Start with the opening sections and core definitions'])
    ].join('\n');
};

const fallbackTopicExplanation = ({ topic, contextText = '', chunks = [] }) => {
    const relatedChunks = chunks.slice(0, 3);
    const contextLines = contextText
        .split('\n')
        .filter(Boolean)
        .slice(0, 4);

    const keyPoints = relatedChunks.map((chunk) => {
        const text = (chunk.content || '').replace(/\s+/g, ' ').trim();
        return `- ${text.slice(0, 180)}${text.length > 180 ? '...' : ''}`;
    });

    return [
        `Topic: ${topic}`,
        '',
        'Core idea:',
        ...(contextLines.length ? contextLines.map((line) => `- ${line}`) : ['- This topic appears across the uploaded material sections below.']),
        '',
        'From your document:',
        ...(keyPoints.length ? keyPoints : ['- No detailed excerpt was available for this topic yet.']),
        '',
        'Dive deeper:',
        `- Ask: "Give me 3 practice questions on ${topic} from this document."`,
        `- Ask: "Explain ${topic} with an example from this document."`
    ].join('\n');
};

const isSummaryTooShort = (text = '') => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean).length;
    const bullets = (text.match(/^[-*]\s+/gm) || []).length;
    return words < 120 || lines < 8 || bullets < 6;
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

    const chunks = await chunkRepository.listByDocument(document._id);
    
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
            summary = fallbackStructuredSummary(document, chunks);
        }
    } catch (error) {
        summary = fallbackStructuredSummary(document, chunks);
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
    let explanation = '';
    try {
        explanation = await generateText(`${complexity}\n\nQuestion or concept: ${text}\n\nRelevant concept map context:\n${context}`);
    } catch (error) {
        explanation = fallbackTopicExplanation({ topic: text, contextText: context, chunks: relatedChunks });
    }
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
