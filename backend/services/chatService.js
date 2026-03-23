import ChatHistory from '../models/ChatHistory.js';
import { recordLearningInteraction } from './analyticsService.js';
import { generateText } from './aiService.js';
import { retrieveRelevantChunks } from './retrievalService.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { updateConceptMastery } from './masteryService.js';

const NOT_FOUND_MESSAGE = 'Information not found in uploaded materials.';

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
- When the answer is found, end with a short "Sources:" line that references document title and section only from the provided excerpts.

Conversation memory:
${memory || 'None'}

Retrieved excerpts:
${context}

Student question:
${message}`;
};

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
        } catch (error) {
            if (error.statusCode === 429 || /quota|rate limit|timeout/i.test(error.message || '')) {
                return {
                    reply: 'AI service is temporarily rate-limited. Please retry in a short while.',
                    retrievedChunks: [],
                    citations: [],
                    concepts: []
                };
            }
            throw error;
        }

        // Store cache in background
        setCachedResponse(cacheKey, reply).catch(e => console.error(e));
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
