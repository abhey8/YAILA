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

    if (!chunks.length || (chunks[0]?.rerankScore ?? 0) < 0.08) {
        return {
            reply: NOT_FOUND_MESSAGE,
            retrievedChunks: [],
            citations: [],
            concepts: []
        };
    }

    const concepts = await conceptRepository.listByDocuments(documentIds);
    const matchedConcepts = concepts
        .filter((concept) => chunks.some((chunk) => concept.chunkRefs.some((chunkId) => chunkId.toString() === chunk._id.toString())))
        .slice(0, 5);

    const citations = uniqueCitations(chunks);
    const reply = await generateText(buildPrompt({ documentTitles, message, chunks, history }));

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
