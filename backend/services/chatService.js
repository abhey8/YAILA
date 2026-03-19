import ChatHistory from '../models/ChatHistory.js';
import { recordLearningInteraction } from './analyticsService.js';
import { generateText } from './aiService.js';
import { retrieveRelevantChunks } from './retrievalService.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { updateConceptMastery } from './masteryService.js';

const extractRawFallbackContext = (textContent = '', message = '') => {
    const normalizedText = textContent.replace(/\s+/g, ' ').trim();
    if (!normalizedText) {
        return [];
    }

    const queryTerms = message
        .toLowerCase()
        .split(/\W+/)
        .filter((term) => term.length > 2);

    const windows = [];
    const windowSize = 1200;
    const step = 800;

    for (let start = 0; start < normalizedText.length; start += step) {
        const content = normalizedText.slice(start, start + windowSize).trim();
        if (!content) {
            continue;
        }

        const lower = content.toLowerCase();
        const lexicalHits = queryTerms.filter((term) => lower.includes(term)).length;
        windows.push({
            _id: `raw-${start}`,
            content,
            rerankScore: lexicalHits / Math.max(queryTerms.length, 1),
            semanticScore: lexicalHits / Math.max(queryTerms.length, 1),
        });
    }

    return windows
        .sort((left, right) => right.rerankScore - left.rerankScore)
        .slice(0, 4);
};

const buildPrompt = ({ document, message, chunks, history }) => {
    const context = chunks.map((chunk, index) => `Source ${index + 1}:\n${chunk.content}`).join('\n\n');
    const memory = history
        .slice(-6)
        .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
        .join('\n');

    return `You are an adaptive study tutor for the uploaded document currently open in the app.
The current document title is: "${document.title || document.originalName}".
When the student says "the book", "the document", "this chapter", or similar, they are referring to this uploaded document.
Use the retrieved document chunks first when the question is about the document.
If the answer is present in the provided document context, answer from that context directly instead of saying you do not have access.
If the question is simple general knowledge, arithmetic, or common factual knowledge not dependent on the document, answer it directly and correctly.
Do not add repetitive disclaimer lines at the end of every answer.
Only mention that something is general knowledge when that distinction is actually helpful for the student.

Conversation memory:
${memory || 'None'}

Retrieved context:
${context}

Student question:
${message}`;
};

export const chatWithDocument = async ({ document, userId, message, history = [] }) => {
    let chunks = await retrieveRelevantChunks({ documentId: document._id, query: message });
    if (!chunks.length || (chunks[0]?.rerankScore ?? 0) < 0.08) {
        chunks = extractRawFallbackContext(document.textContent || '', message);
    }

    const concepts = await conceptRepository.listByDocument(document._id);
    const matchedConcepts = concepts
        .filter((concept) => chunks.some((chunk) => concept.chunkRefs.some((chunkId) => chunkId.toString() === chunk._id.toString())))
        .slice(0, 5);

    const reply = await generateText(buildPrompt({ document, message, chunks, history }));

    let chatSession = await ChatHistory.findOne({ document: document._id, user: userId });
    if (!chatSession) {
        chatSession = new ChatHistory({ document: document._id, user: userId, messages: [] });
    }

    chatSession.messages.push({
        role: 'user',
        content: message,
        retrievedChunkIds: chunks
            .map((chunk) => chunk._id)
            .filter((value) => typeof value !== 'string' || !value.startsWith('raw-')),
        conceptIds: matchedConcepts.map((concept) => concept._id)
    });
    chatSession.messages.push({
        role: 'ai',
        content: reply,
        retrievedChunkIds: chunks
            .map((chunk) => chunk._id)
            .filter((value) => typeof value !== 'string' || !value.startsWith('raw-')),
        conceptIds: matchedConcepts.map((concept) => concept._id)
    });
    await chatSession.save();

    if (matchedConcepts.length) {
        await recordLearningInteraction({
            userId,
            documentId: document._id,
            conceptIds: matchedConcepts.map((concept) => concept._id),
            timeSpentSeconds: 90,
            chatQuestions: 1
        });

        await updateConceptMastery({
            userId,
            documentId: document._id,
            conceptIds: matchedConcepts.map((concept) => concept._id),
            sourceType: 'chat',
            score: 0.65
        });
    }

    return {
        reply,
        retrievedChunks: chunks.map((chunk) => ({
            id: chunk._id,
            content: chunk.content,
            score: chunk.rerankScore
        })),
        concepts: matchedConcepts
    };
};
