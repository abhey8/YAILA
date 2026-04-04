import ChatHistory from '../models/ChatHistory.js';
import { env } from '../config/env.js';
import { recordLearningInteraction } from './analyticsService.js';
import { generateText } from './aiService.js';
import { evaluateMathExpression, normalizePowerSyntax } from './mathEngineService.js';
import { retrieveRelevantChunks } from './retrievalService.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { updateConceptMastery } from './masteryService.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';



const NOT_FOUND_MESSAGE = 'Information not found in uploaded materials.';
const GENERAL_FALLBACK_THRESHOLD = 0.23;


async function maybeUpdateRollingSummary({ chatSession }) {
    // Disabled: message schema does not support a third role type for persisted summaries.
    // Keeping this as a no-op avoids intermittent ChatHistory validation failures.
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
const isLikelyDocIntent = (message = '') => /(document|pdf|book|chapter|section|uploaded|material|notes|from this|according to|summarize|summary|flashcard|quiz|proof|equivalence|logic|quantifier|normal form|xor|biconditional|conditional|de morgan|forall|exists|⊕|∀|∃|¬|∧|∨|→|↔)/i.test(message || '');
const isOverviewIntent = (message = '') => /(what (math|main|major|core)? topics|what does (this|the) (book|document|pdf|chapter) cover|which topics|topics covered|table of contents|contents|syllabus|chapter overview|give me the topics|what are the topics|overview of the book|summari[sz]e( this| the (book|document|pdf|chapter))?)/i.test(normalizeText(message));

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

const buildTutorPrompt = ({
    documentTitles,
    message,
    chunks,
    history,
    replyStyle,
    isOverviewQuery,
    summaryContext,
    conceptContext
}) => {
    const excerptContext = chunks.length
        ? chunks.map((chunk, index) => (
            `Source ${index + 1}\nDocument: ${chunk.documentTitle}\nSection: ${chunk.sectionTitle || 'Untitled Section'}\nExcerpt:\n${chunk.content}`
        )).join('\n\n')
        : 'No excerpt retrieval was strong enough for this question.';

    const memory = history
        .slice(-6)
        .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
        .join('\n');

    return `You are a study assistant answering strictly from uploaded materials.
Available uploaded materials:
${documentTitles.map((title) => `- ${title}`).join('\n')}

Rules:
- Use only the uploaded materials, including retrieved excerpts, document summaries, and extracted concept lists.
- If the answer is not supported by those materials, reply with exactly: "${NOT_FOUND_MESSAGE}"
- Do not answer from general knowledge.
- Keep the answer concise and study-focused.
- Do NOT include a "Sources:" line in the response body.
- Provide clean final answer text only.
- For evaluative questions (e.g., candidate quality from a resume), infer only from provided excerpts and explicitly mention limits/assumptions.
- Treat retrieved excerpts as definition/law/evidence units and synthesize a direct final answer.
- For symbolic logic, map operators while reasoning: ⊕ (xor), ∀ (for all), ∃ (there exists), ¬ (not), ∧ (and), ∨ (or), → (implies), ↔ (iff).
- ${buildStyleInstruction(replyStyle)}
- Match the user's tone. If the question sounds formal or evaluative, be professional. If it sounds casual, be conversational.
${isOverviewQuery ? '- This is a broad overview question. Use the document-level overview and concept list to cover the breadth of the material, not just one excerpt.' : ''}

Conversation memory:
${memory || 'None'}

Document-level overview:
${summaryContext || 'No saved document summary yet.'}

Relevant concepts:
${conceptContext || 'No concept list available.'}

Retrieved excerpts:
${excerptContext}

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

const buildDebugMeta = ({ intent, usedRetrieval, fallbackUsed }) => ({
    intent,
    used_retrieval: Boolean(usedRetrieval),
    fallback_used: Boolean(fallbackUsed)
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
        .slice(0, 2);
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

    await chatSession.save();
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
    const documentTitles = documents.map((document) => document.title || document.originalName);
    const hasDocumentContext = documentIds.length > 0;
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

    const replyStyle = detectReplyStyle(message);
    let intent = 'document';
    if (isPureGreetingIntent(message)) {
        intent = 'social';
    } else if (isExplicitGeneralIntent(message) && !isLikelyDocIntent(message)) {
        intent = 'general';
    } else if (isCapabilityIntent(message)) {
        intent = 'general';
    } else if (!hasDocumentContext && isLikelyGeneralIntent(message) && !isLikelyDocIntent(message)) {
        intent = 'general';
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

    if (intent === 'general') {
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

    const rawChunks = await retrieveRelevantChunks({
        userId,
        documentIds,
        query: message
    });
    const chunks = rawChunks.filter((chunk) => !isLowValueChunk(chunk));
    const isOverviewQuery = isOverviewIntent(message);

    const hasProcessingDocs = documents.some(doc => ['queued', 'extracting', 'processing', 'embedding_partial'].includes(doc.ingestionStatus));
    
    // Check if documents are actually processed and have content
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

    if (hasProcessingDocs && chunks.length < 2) {
        return {
            status: "DOCUMENT_STILL_PROCESSING",
            reply: "The document is still being analyzed in the background. Please wait a moment while I finish extracting the relevant sections.",
            retrievedChunks: [],
            citations: [],
            concepts: [],
            debug: buildDebugMeta({ intent, usedRetrieval: true, fallbackUsed: true })
        };
    }

    const { buildOptimisedContext, pruneRetrievedChunks } = await import('./tokenOptimisationService.js');
    const { generateCacheKey, getCachedResponse, setCachedResponse } = await import('./aiCacheService.js');
    const { aiQueueService } = await import('./aiQueueService.js');

    const concepts = await conceptRepository.listByDocuments(documentIds);
    const chunkMatchedConcepts = concepts
        .filter((concept) => chunks.some((chunk) => concept.chunkRefs.some((chunkId) => chunkId.toString() === chunk._id.toString())))
        .slice(0, 5);
    const { summaryContext, conceptContext } = buildOverviewContext(documents, concepts, message);
    const canAnswerFromOverviewContext = isOverviewQuery && Boolean(summaryContext || conceptContext);
    const bestRelevance = chunks.reduce((best, chunk) => Math.max(best, Number(chunk.rerankScore || chunk.semanticScore || chunk.lexicalScore || 0)), 0);
    const shouldFallbackToGeneralKnowledge = !isLikelyDocIntent(message)
        && !isDocumentEvaluationIntent(message)
        && (isCapabilityIntent(message) || isDefinitionStyleIntent(message) || isLikelyGeneralIntent(message))
        && !canAnswerFromOverviewContext
        && bestRelevance < GENERAL_FALLBACK_THRESHOLD;

    if (shouldFallbackToGeneralKnowledge) {
        try {
            const generalReply = await generateText(buildGeneralPrompt({ message, replyStyle }), { maxTokens: 260 });
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
                debug: buildDebugMeta({ intent: 'general-fallback', usedRetrieval: true, fallbackUsed: true })
            };
        } catch (error) {
            logger.warn('[Chat] General fallback generation failed after low-relevance retrieval', {
                error: error.message
            });
        }
    }

    if (!chunks.length && !isDocumentEvaluationIntent(message) && !canAnswerFromOverviewContext) {
        await persistChatExchange({
            documentIds,
            userId,
            message,
            reply: NOT_FOUND_MESSAGE
        });
        return {
            reply: NOT_FOUND_MESSAGE,
            retrievedChunks: [],
            citations: [],
            concepts: [],
            debug: buildDebugMeta({ intent, usedRetrieval: true, fallbackUsed: false })
        };
    }

    const matchedConcepts = [...new Map(
        [
            ...chunkMatchedConcepts,
            ...concepts
                .map((concept) => ({ concept, score: scoreConceptMatch(concept, message) }))
                .filter(({ score }) => score >= 2.5)
                .sort((left, right) => right.score - left.score)
                .map(({ concept }) => concept)
                .slice(0, isOverviewQuery ? 8 : 4)
        ].map((concept) => [concept._id.toString(), concept])
    ).values()].slice(0, isOverviewQuery ? 10 : 5);

    // [OPTIMISATION] Context Saftey Guard 
    const prunedChunks = pruneRetrievedChunks(chunks);
    const citations = uniqueCitations(prunedChunks);

    // [OPTIMISATION] Token compression
    const compressedHistory = buildOptimisedContext(history);
    const prompt = buildTutorPrompt({
        documentTitles,
        message,
        chunks: prunedChunks,
        history: history.slice(-6),
        replyStyle,
        isOverviewQuery,
        summaryContext,
        conceptContext
    });
    
    // [OPTIMISATION] Response Caching
    const cacheKey = generateCacheKey(message, compressedHistory);
    let reply = await getCachedResponse(cacheKey);

    if (!reply) {
        try {
            // [OPTIMISATION] Queue & Rate limiter
            reply = await aiQueueService.enqueue(
                () => generateText(prompt, { maxTokens: isOverviewQuery ? Math.min(560, Math.max(env.chatMaxOutputTokens, 500)) : env.chatMaxOutputTokens }),
                18000
            );
            reply = stripModelSourcesLine(reply);
        } catch (error) {
            throw new AppError('Document chat generation failed', error.statusCode || 502, 'DOCUMENT_CHAT_FAILED', {
                stage: 'document-chat',
                reason: error.message,
                providerStatus: error.statusCode || null
            });
        }

        // Store cache in background
        setCachedResponse(cacheKey, reply).catch((error) => {
            logger.warn('[Chat] Cache write skipped', { error: error.message });
        });
    }

    await persistChatExchange({
        documentIds,
        userId,
        message,
        reply,
        retrievedChunks: chunks,
        matchedConcepts,
        citations
    });

    if (matchedConcepts.length) {
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
        concepts: matchedConcepts,
        debug: buildDebugMeta({ intent, usedRetrieval: true, fallbackUsed: false })
    };
};
