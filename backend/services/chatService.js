import ChatHistory from '../models/ChatHistory.js';
import { env } from '../config/env.js';
import { recordLearningInteraction } from './analyticsService.js';
import { generateText } from './aiService.js';
import { evaluateMathExpression, normalizePowerSyntax } from './mathEngineService.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { updateConceptMastery } from './masteryService.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { tutorOrchestrator } from './tutorOrchestratorService.js';
import {
    allowsGeneralFallback,
    detectChatIntent,
    isTaskIntent,
    shouldReturnNotFound,
    shouldUseOverviewContext
} from './chatIntentService.js';
import { buildRollingSummary, mergeConversationHistory } from './chatMemoryService.js';
import { buildOptimisedContext } from './tokenOptimisationService.js';
import { generateCacheKey, getCachedResponse, setCachedResponse } from './aiCacheService.js';

const NOT_FOUND_MESSAGE = 'Information not found in uploaded materials.';

async function maybeUpdateRollingSummary({ chatSession }) {
    if (!chatSession) {
        return chatSession;
    }

    chatSession.rollingSummary = buildRollingSummary({
        existingSummary: chatSession.rollingSummary,
        messages: chatSession.messages || []
    });
    chatSession.rollingSummaryUpdatedAt = new Date();
    return chatSession;
}
const LOW_VALUE_PATTERNS = [
    /this page intentionally left blank/i,
    /\bto martha\b/i,
    /\babout the author\b/i,
    /\bcopyright\b/i,
    /\ball rights reserved\b/i
];

const normalizeText = (value = '') => value.toLowerCase().replace(/\s+/g, ' ').trim();
const tokenizeWords = (value = '') => normalizeText(value).match(/[a-z]+|[\u0900-\u097f]+/gi) || [];
const HINGLISH_MARKERS = new Set([
    'kaise', 'kya', 'kyu', 'kyun', 'kaun', 'kaunsi', 'batao', 'samjha', 'samjhao',
    'mujhe', 'mera', 'meri', 'mere', 'aap', 'ap', 'tum', 'hai', 'ho', 'haan',
    'nahi', 'nhi', 'thik', 'theek', 'kar', 'kr'
]);

const isPureGreetingIntent = (message = '') => /^(hi|hello|hey|yo|hola|namaste|good (morning|afternoon|evening))[\s!,.?]*$/i.test(normalizeText(message));
const isDocumentEvaluationIntent = (message = '') => /(resume|cv|candidate|fit|qualified|qualification|strength|weakness|interview|hire|hiring|suitable)/i.test(normalizeText(message));
const isCapabilityIntent = (message = '') => /(what can you do|can you help|are you smart|who are you|what are you|tell me about yourself|how can you help)/i.test(normalizeText(message));
const isDefinitionStyleIntent = (message = '') => /^(what is|who is|define|meaning of|explain|tell me about)\b/i.test(normalizeText(message));
const isLikelyGeneralIntent = (message = '') => /(how are you|who are you|tell me a joke|weather|news|time|date)/i.test(message) || isCapabilityIntent(message) || /\b\d+\s*[\+\-\*\/]\s*\d+\b/.test(message) || /\b\d+\s*(to the power|power)\s*\d+\b/i.test(message) || /\b\d+\s*\*\*\s*\d+\b/.test(message);
const isExplicitGeneralIntent = (message = '') => /(general question|not from (the )?(document|pdf|book)|off[- ]?topic|just chat|casual chat|without document|in general)\b/i.test(normalizeText(message));

const detectReplyStyle = (message = '') => {
    if (/[\u0900-\u097f]/.test(message)) {
        return 'hindi';
    }

    const tokens = tokenizeWords(message);
    if (!tokens.length) {
        return 'english';
    }

    const hinglishHits = tokens.filter((token) => HINGLISH_MARKERS.has(token)).length;
    const englishLikeTokens = tokens.filter((token) => /^[a-z]+$/i.test(token) && !HINGLISH_MARKERS.has(token)).length;

    if (hinglishHits >= 2) {
        return 'hinglish';
    }

    if (hinglishHits >= 1 && tokens.length <= 6 && englishLikeTokens <= 3) {
        return 'hinglish';
    }

    return 'english';
};

const detectNumericExpression = (message = '') => {
    const normalized = normalizePowerSyntax(message);
    const compact = normalized.replace(/\s+/g, '');
    if (!compact || compact.length > 60) {
        return null;
    }
    if (/[a-z]/i.test(compact)) {
        return null;
    }
    if (!(/[+\-*/()]/.test(compact) || compact.includes('**'))) {
        return null;
    }
    return /^[\d+\-*/().*]+$/.test(compact) ? normalized : null;
};

const buildStyleInstruction = (replyStyle) => {
    if (replyStyle === 'hindi') {
        return 'The user is writing in Hindi. Reply in Hindi.';
    }
    if (replyStyle === 'hinglish') {
        return 'The user is writing in Hinglish. Reply in natural Hinglish (Roman Hindi + English mix).';
    }
    return 'The user is writing mainly in English. Reply in English.';
};

const buildGeneralPrompt = ({ message, replyStyle }) => `You are a helpful AI assistant.
Respond naturally and concisely.
${buildStyleInstruction(replyStyle)}
Match the user's tone. If the question sounds formal or evaluative, be professional. If it sounds casual, be conversational.
If the question is about a general concept, fact, or definition, answer directly in a clear way.

User message:
${message}`;

const isLowValueChunk = (chunk) => {
    const content = (chunk?.content || '').replace(/\s+/g, ' ').trim();
    // Keep concise but meaningful chunks (common in resumes), only drop extremely short noise.
    if (content.length < 25) return true;
    if (content.length < 80) {
        return LOW_VALUE_PATTERNS.some((pattern) => pattern.test(content));
    }
    return LOW_VALUE_PATTERNS.some((pattern) => pattern.test(content));
};

const scoreConceptMatch = (concept, message) => {
    const normalizedMessage = normalizeText(message);
    const name = normalizeText(concept?.name || '');
    const description = normalizeText(concept?.description || '');
    const keywords = Array.isArray(concept?.keywords) ? concept.keywords.map((keyword) => normalizeText(keyword)) : [];
    let score = 0;

    if (name && normalizedMessage.includes(name)) {
        score += 6;
    }

    keywords.forEach((keyword) => {
        if (keyword && normalizedMessage.includes(keyword)) {
            score += 2;
        }
    });

    tokenizeWords(message).forEach((token) => {
        if (token.length < 4) {
            return;
        }
        if (name.includes(token)) {
            score += 1.5;
        }
        if (description.includes(token)) {
            score += 0.5;
        }
    });

    score += Number(concept?.importance || 0);
    return score;
};

const buildOverviewContext = (documents = [], concepts = [], message = '') => {
    const summaryContext = documents
        .filter((document) => `${document?.summary || ''}`.trim())
        .map((document) => `- ${document.title || document.originalName}: ${`${document.summary || ''}`.replace(/\s+/g, ' ').trim().slice(0, 500)}`)
        .join('\n');

    const conceptContext = [...concepts]
        .map((concept) => ({ concept, score: scoreConceptMatch(concept, message) }))
        .sort((left, right) => right.score - left.score || (right.concept.importance || 0) - (left.concept.importance || 0))
        .map(({ concept }) => concept)
        .slice(0, 12)
        .map((concept) => `- ${concept.name}: ${`${concept.description || ''}`.replace(/\s+/g, ' ').trim().slice(0, 180)}`)
        .join('\n');

    return {
        summaryContext,
        conceptContext
    };
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

const buildDebugMeta = ({ intent, usedRetrieval, fallbackUsed }) => ({
    intent,
    used_retrieval: Boolean(usedRetrieval),
    fallback_used: Boolean(fallbackUsed)
});

const findChatSession = async ({ documentIds, userId }) => {
    const ids = documentIds.map((documentId) => `${documentId}`);
    let chatSession = ids.length === 1
        ? await ChatHistory.findOne({ document: ids[0], user: userId })
        : await ChatHistory.findOne({ document: null, user: userId, sourceDocuments: { $all: ids } });

    if (chatSession && ids.length > 1 && (chatSession.sourceDocuments?.length || 0) !== ids.length) {
        chatSession = null;
    }

    return chatSession;
};

const buildDocumentCacheFingerprint = (documents = []) => documents
    .map((document) => ({
        id: `${document._id}`,
        ingestionStatus: document.ingestionStatus || '',
        chunkCount: Number(document.chunkCount || 0),
        summaryUpdatedAt: document.summaryUpdatedAt ? new Date(document.summaryUpdatedAt).toISOString() : '',
        updatedAt: document.updatedAt ? new Date(document.updatedAt).toISOString() : ''
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

const uniqueCitations = (chunks, max = 2) => {
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
        .slice(0, max);
};

const persistChatExchange = async ({
    documentIds,
    userId,
    message,
    reply,
    retrievedChunks = [],
    matchedConcepts = [],
    citations = []
}) => {
    let chatSession = await findChatSession({ documentIds, userId });
    if (!chatSession) {
        chatSession = new ChatHistory({
            document: documentIds.length === 1 ? documentIds[0] : null,
            user: userId,
            sourceDocuments: documentIds,
            messages: []
        });
    }

    const retrievedChunkIds = retrievedChunks.map((chunk) => chunk._id).filter(Boolean);
    const conceptIds = matchedConcepts.map((concept) => concept._id).filter(Boolean);

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

    await maybeUpdateRollingSummary({ chatSession });
    await chatSession.save();
};

export const chatWithDocuments = async ({
    documents,
    userId,
    message,
    history = []
}) => {
    const documentIds = documents.map((document) => document._id);
    const hasDocumentContext = documentIds.length > 0;
    const existingChatSession = await findChatSession({ documentIds, userId });
    const mergedHistory = mergeConversationHistory({
        persistedMessages: (existingChatSession?.messages || []).slice(-8).map((item) => ({
            role: item.role,
            content: item.content
        })),
        requestHistory: history
    });
    const numericExpression = detectNumericExpression(message);
    if (numericExpression) {
        return {
            reply: evaluateMathExpression(numericExpression),
            retrievedChunks: [],
            citations: [],
            concepts: [],
            debug: buildDebugMeta({ intent: 'numeric', usedRetrieval: false, fallbackUsed: false })
        };
    }

    const intentInfo = detectChatIntent({
        message,
        hasDocumentContext
    });
    const replyStyle = detectReplyStyle(message);
    let intent = intentInfo.intentClass;
    if (isDocumentEvaluationIntent(message)) {
        intent = 'factual_doc_qa';
    }

    if (intent === 'social') {
        const reply = replyStyle === 'hinglish' || replyStyle === 'hindi'
            ? `Main theek hoon. Main tumhari uploaded material ke basis par summary, chat, flashcards, quiz, aur general questions mein help kar sakta hoon.`
            : `I'm doing well. I can help with your uploaded material, summaries, flashcards, quizzes, and general questions.`;
        await persistChatExchange({
            documentIds,
            userId,
            message,
            reply
        });
        return {
            reply,
            retrievedChunks: [],
            citations: [],
            concepts: [],
            debug: buildDebugMeta({ intent, usedRetrieval: false, fallbackUsed: false })
        };
    }

    const shouldUseGeneralChat = intent === 'generic_chat'
        || intent === 'general'
        || (!hasDocumentContext && allowsGeneralFallback(intent))
        || (allowsGeneralFallback(intent) && !intentInfo.hasDocSignal && (isCapabilityIntent(message) || isExplicitGeneralIntent(message) || isLikelyGeneralIntent(message)));

    if (shouldUseGeneralChat) {
        try {
            const generalReply = await generateText(buildGeneralPrompt({ message, replyStyle }), { maxTokens: 220 });
            const reply = stripModelSourcesLine(generalReply);
            await persistChatExchange({
                documentIds,
                userId,
                message,
                reply
            });
            return {
                reply,
                retrievedChunks: [],
                citations: [],
                concepts: [],
                debug: buildDebugMeta({ intent, usedRetrieval: false, fallbackUsed: false })
            };
        } catch (error) {
            throw new AppError('General chat generation failed', 502, 'GENERAL_CHAT_FAILED', {
                stage: 'general-chat',
                reason: error.message
            });
        }
    }

    const hasProcessingDocs = documents.some(doc => ['queued', 'extracting', 'processing', 'embedding_partial'].includes(doc.ingestionStatus));
    const totalChunkCount = documents.reduce((sum, doc) => sum + (doc.chunkCount || 0), 0);
    if (totalChunkCount === 0 && !hasProcessingDocs) {
        return {
            reply: "I couldn't find any readable text in the uploaded document(s). This usually happens with scanned PDFs or images. Please try uploading a text-based PDF or providing more materials.",
            retrievedChunks: [],
            citations: [],
            concepts: [],
            debug: buildDebugMeta({ intent, usedRetrieval: true, fallbackUsed: true })
        };
    }

    if (hasProcessingDocs && totalChunkCount < 2) {
        return {
            status: "DOCUMENT_STILL_PROCESSING",
            reply: "The document is still being analyzed in the background. Please wait a moment while I finish extracting the relevant sections.",
            retrievedChunks: [],
            citations: [],
            concepts: [],
            debug: buildDebugMeta({ intent, usedRetrieval: true, fallbackUsed: true })
        };
    }

    const concepts = await conceptRepository.listByDocuments(documentIds);
    const overviewContext = buildOverviewContext(documents, concepts, intentInfo.normalizedMessage);
    const compressedHistory = buildOptimisedContext(mergedHistory);
    const primaryModel = env.aiPrimaryProvider === 'groq' ? env.groqChatModel : env.geminiChatModel;
    const cacheKey = generateCacheKey({
        version: 'chat-v3',
        prompt: intentInfo.normalizedMessage,
        userId: `${userId}`,
        documentIds: documentIds.map((documentId) => `${documentId}`).sort(),
        provider: env.aiPrimaryProvider,
        fallbackProvider: env.aiFallbackProvider,
        model: primaryModel,
        intentClass: intent,
        questionStyle: intentInfo.questionStyle,
        requestedQuestionCount: intentInfo.requestedQuestionCount,
        replyStyle,
        documents: buildDocumentCacheFingerprint(documents),
        rollingSummary: existingChatSession?.rollingSummary || '',
        history: compressedHistory
    });

    const cachedPayload = await getCachedResponse(cacheKey);
    let orchestrationResult = typeof cachedPayload === 'string'
        ? { reply: cachedPayload, retrievedChunks: [], citations: [] }
        : cachedPayload;

    if (!orchestrationResult) {
        try {
            orchestrationResult = await tutorOrchestrator.run({
                userId,
                documents,
                message,
                history: mergedHistory,
                rollingSummary: existingChatSession?.rollingSummary || '',
                overviewContext: shouldUseOverviewContext(intent) ? overviewContext : null,
                intentClass: intent,
                taskHints: {
                    normalizedMessage: intentInfo.normalizedMessage,
                    requestedQuestionCount: intentInfo.requestedQuestionCount,
                    questionStyle: intentInfo.questionStyle,
                    wantsAnswerKey: intentInfo.wantsAnswerKey,
                    replyStyle
                },
                isLowValueChunk
            });
        } catch (error) {
            throw new AppError('Document chat generation failed', error.statusCode || 502, 'DOCUMENT_CHAT_FAILED', {
                stage: 'document-chat',
                reason: error.message,
                providerStatus: error.statusCode || null
            });
        }

        setCachedResponse(cacheKey, orchestrationResult).catch((error) => {
            logger.warn('[Chat] Cache write skipped', { error: error.message });
        });
    }

    const reply = stripModelSourcesLine(orchestrationResult?.reply || '');
    const retrievedChunks = (orchestrationResult?.retrievedChunks || []).map((chunk) => ({
        _id: chunk.id || chunk._id,
        document: chunk.documentId || chunk.document,
        documentTitle: chunk.documentTitle,
        sectionTitle: chunk.sectionTitle || 'Untitled Section',
        chunkIndex: chunk.chunkIndex || 0,
        content: chunk.content || '',
        rerankScore: chunk.score || 0
    }));
    const citations = (orchestrationResult?.citations?.length
        ? orchestrationResult.citations
        : uniqueCitations(retrievedChunks, isTaskIntent(intent) ? 4 : 2));
    const matchedConcepts = [...new Map(
        concepts
            .map((concept) => ({ concept, score: scoreConceptMatch(concept, intentInfo.normalizedMessage) }))
            .filter(({ score }) => score >= (isTaskIntent(intent) ? 1.6 : 2.2))
            .sort((left, right) => right.score - left.score)
            .map(({ concept }) => [concept._id.toString(), concept])
    ).values()].slice(0, shouldUseOverviewContext(intent) ? 8 : 5);

    await persistChatExchange({
        documentIds,
        userId,
        message,
        reply,
        retrievedChunks,
        matchedConcepts,
        citations
    });

    if (matchedConcepts.length && retrievedChunks.length) {
        const conceptIds = matchedConcepts.map((concept) => concept._id);

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
        retrievedChunks: retrievedChunks.map((chunk) => ({
            id: chunk._id,
            content: chunk.content,
            score: chunk.rerankScore,
            documentId: chunk.document,
            documentTitle: chunk.documentTitle,
            sectionTitle: chunk.sectionTitle || 'Untitled Section',
            chunkIndex: chunk.chunkIndex
        })),
        citations,
        concepts: matchedConcepts,
        debug: buildDebugMeta({
            intent,
            usedRetrieval: retrievedChunks.length > 0,
            fallbackUsed: shouldReturnNotFound(intent) && !retrievedChunks.length
        })
    };
};
