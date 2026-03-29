import ChatHistory from '../models/ChatHistory.js';
import { env } from '../config/env.js';
import { recordLearningInteraction } from './analyticsService.js';
import { generateText } from './aiService.js';
import { evaluateMathExpression, normalizePowerSyntax } from './mathEngineService.js';
import { retrieveRelevantChunks } from './retrievalService.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { updateConceptMastery } from './masteryService.js';
import { logger } from '../lib/logger.js';



const NOT_FOUND_MESSAGE = 'Information not found in uploaded materials.';
const DOC_RELEVANCE_THRESHOLD = 0.08;


async function maybeUpdateRollingSummary({ chatSession }) {

    if (!chatSession?.messages || chatSession.messages.length < 6) {
        return;
    }

    const lastSummaryIndex = [...chatSession.messages]
        .reverse()
        .findIndex(m => m.role === 'system_summary');

    if (lastSummaryIndex !== -1 && lastSummaryIndex < 6) {
        return;
    }

    const recentText = chatSession.messages
        .slice(-6)
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

    const prompt = `
Summarize the key learning discussion below in 2 concise lines.
Focus on concepts, doubts and progress.

${recentText}
`;

    try {
        const summary = await generateText(prompt, { maxTokens: 120 });

        chatSession.messages.push({
            role: 'system_summary',
            content: summary.trim()
        });

    } catch (e) {}
}
const LOW_VALUE_PATTERNS = [
    /this page intentionally left blank/i,
    /\bto martha\b/i,
    /\babout the author\b/i,
    /\bcopyright\b/i,
    /\ball rights reserved\b/i
];

const normalizeText = (value = '') => value.toLowerCase().replace(/\s+/g, ' ').trim();

const isGreetingIntent = (message = '') => /^(hi|hello|hey|yo|hola|namaste|good (morning|afternoon|evening))\b/i.test(normalizeText(message));
const isQuestionGenerationIntent = (message = '') => /(give|generate|create|make).*(question|questions|qs|quiz|mcq)|question.*from.*book|practice.*question|couple\s+qs/i.test(normalizeText(message));
const isDocumentEvaluationIntent = (message = '') => /(resume|cv|candidate|fit|qualified|qualification|strength|weakness|interview|hire|hiring|suitable)/i.test(normalizeText(message));
const isHinglishIntent = (message = '') => /(kaise|kya|kyu|kyun|kaun|kaunsi|batao|samjha|samjhao|mujhe|mera|aap|ap|tum|hai|ho|haan|nahi|nhi|thik|theek|kr|kar|se)\b/i.test(normalizeText(message));
const isLikelyGeneralIntent = (message = '') =>/(how are you|who are you|tell me a joke|weather|news|time|date)/i.test(message)||/\b\d+\s*[\+\-\*\/]\s*\d+\b/.test(message)||/\b\d+\s*(to the power|power)\s*\d+\b/i.test(message)||/\b\d+\s*\*\*\s*\d+\b/.test(message);
const isLikelyDocIntent = (message = '') => /(document|pdf|book|chapter|section|uploaded|material|notes|from this|according to|summarize|summary|flashcard|quiz|proof|equivalence|logic|quantifier|normal form|xor|biconditional|conditional|de morgan|forall|exists|⊕|∀|∃|¬|∧|∨|→|↔)/i.test(message || '');
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

const buildGeneralPrompt = ({ message, hinglish }) => `You are a helpful AI assistant.
Respond naturally and concisely.
${hinglish ? 'User is speaking Hinglish. Reply in clear Hinglish (Roman Hindi + English mix).' : 'Reply in English unless user asks otherwise.'}
If asked basic math/facts, answer directly.

User message:
${message}`;

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

    return `Based on your uploaded document, here are ${requested} focused practice questions:\n${questions.join('\n')}`;
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

    return `Here are the most relevant excerpts from your uploaded materials for "${question}":\n${excerpts}`;
};

const isLowValueChunk = (chunk) => {
    const content = (chunk?.content || '').replace(/\s+/g, ' ').trim();
    // Keep concise but meaningful chunks (common in resumes), only drop extremely short noise.
    if (content.length < 25) return true;
    if (content.length < 80) {
        return LOW_VALUE_PATTERNS.some((pattern) => pattern.test(content));
    }
    return LOW_VALUE_PATTERNS.some((pattern) => pattern.test(content));
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
- For evaluative questions (e.g., candidate quality from a resume), infer only from provided excerpts and explicitly mention limits/assumptions.
- Treat retrieved excerpts as definition/law/evidence units and synthesize a direct final answer.
- For symbolic logic, map operators while reasoning: ⊕ (xor), ∀ (for all), ∃ (there exists), ¬ (not), ∧ (and), ∨ (or), → (implies), ↔ (iff).
- Do not merely repeat snippets; use them to complete and explain the result.
- If the user writes in Hinglish, respond in Hinglish with clear, natural phrasing.

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
        .slice(0, 2);
};

export const chatWithDocuments = async ({
    documents,
    userId,
    message,
    history = []
}) => {
    const documentIds = documents.map((document) => document._id);
    const documentTitles = documents.map((document) => document.title || document.originalName);
    const numericExpression = detectNumericExpression(message);
    if (numericExpression) {
        return {
            reply: evaluateMathExpression(numericExpression),
            retrievedChunks: [],
            citations: [],
            concepts: []
        };
    }

    const hinglish = isHinglishIntent(message);
    const intent = isGreetingIntent(message)
        ? 'social'
        : (isLikelyGeneralIntent(message) && !isLikelyDocIntent(message) ? 'general' : 'document');

    if (intent === 'social') {
        return {
            reply: hinglish
                ? `Main theek hoon. Tum pucho, document study, summary, flashcards, quiz ya general question mein help karta hoon.`
                : `I'm doing well. Ask me about your document, or any general question.`,
            retrievedChunks: [],
            citations: [],
            concepts: []
        };
    }

    if (intent === 'general') {
        let generalReply = '';
        try {
            generalReply = await generateText(buildGeneralPrompt({ message, hinglish }), { maxTokens: 220 });
        } catch (error) {
            generalReply = hinglish
                ? 'Main help karne ke liye ready hoon. Thoda specific question pucho.'
                : 'I can help. Please ask a more specific question.';
        }
        return {
            reply: stripModelSourcesLine(generalReply),
            retrievedChunks: [],
            citations: [],
            concepts: []
        };
    }

    const rawChunks = await retrieveRelevantChunks({
        userId,
        documentIds,
        query: message
    });
    const chunks = rawChunks.filter((chunk) => !isLowValueChunk(chunk));

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

    const topScore = chunks[0]?.rerankScore ?? 0;
    if ((!chunks.length || topScore < DOC_RELEVANCE_THRESHOLD) && !isDocumentEvaluationIntent(message)) {
        let generalReply = '';
        try {
            generalReply = await generateText(buildGeneralPrompt({ message, hinglish }), { maxTokens: 260 });
        } catch (error) {
            generalReply = hinglish
                ? 'Is sawal ka support uploaded material mein clearly nahi mila. Agar chaho to main general explanation de sakta hoon.'
                : 'I could not find strong support in the uploaded material. I can still give a general explanation.';
        }
        return {
            reply: stripModelSourcesLine(generalReply),
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
                () => generateText(prompt, { model: selectedModel, maxTokens: env.chatMaxOutputTokens }),
                18000
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

    await maybeUpdateRollingSummary({ chatSession });
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
