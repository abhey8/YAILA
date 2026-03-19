import { sampleChunksForPrompt } from '../lib/documentContext.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { buildChunks } from './chunkingService.js';
import { embedTexts } from './aiService.js';
import { rebuildKnowledgeGraph } from './knowledgeGraphService.js';

const MAX_EMBEDDED_CHUNKS = 72;
const EMPTY_EMBEDDING = [];

const summarizeChunk = async (content) => {
    // Avoid blowing the Gemini Free Tier 15 RPM limit with 50 parallel requests
    const cleanContent = content.replace(/\s+/g, ' ').trim();
    return cleanContent.substring(0, 150) + '...';
};

const extractKeywords = (content) => {
    const tokens = content.toLowerCase().match(/[a-z]{4,}/g) || [];
    const frequency = new Map();

    tokens.forEach((token) => {
        frequency.set(token, (frequency.get(token) || 0) + 1);
    });

    return [...frequency.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([token]) => token);
};

const getEmbeddingIndexes = (chunkDrafts) => {
    const sampledChunks = sampleChunksForPrompt(
        chunkDrafts.map((chunk, index) => ({ ...chunk, __index: index })),
        Math.min(MAX_EMBEDDED_CHUNKS, chunkDrafts.length)
    );

    return sampledChunks.map((chunk) => chunk.__index);
};

export const ingestDocument = async (document) => {
    document.ingestionStatus = 'processing';
    document.ingestionError = null;
    await documentRepository.save(document);

    try {
        const chunkDrafts = buildChunks(document.textContent || '');
        const embeddingIndexes = getEmbeddingIndexes(chunkDrafts);
        const embeddedVectors = embeddingIndexes.length
            ? await embedTexts(embeddingIndexes.map((index) => chunkDrafts[index].content))
            : [];
        const embeddingByIndex = new Map(
            embeddingIndexes.map((index, position) => [index, embeddedVectors[position] || EMPTY_EMBEDDING])
        );
        const summaries = await Promise.all(chunkDrafts.map((chunk) => summarizeChunk(chunk.content)));

        await chunkRepository.deleteByDocument(document._id);

        const savedChunks = await chunkRepository.createMany(chunkDrafts.map((chunk, index) => ({
            ...chunk,
            document: document._id,
            user: document.user,
            chunkIndex: index,
            embedding: embeddingByIndex.get(index) || EMPTY_EMBEDDING,
            summary: summaries[index],
            keywords: extractKeywords(chunk.content)
        })));

        document.chunkCount = savedChunks.length;
        document.ingestionStatus = 'completed';
        await documentRepository.save(document);

        await rebuildKnowledgeGraph(document);
        return savedChunks;
    } catch (error) {
        document.ingestionStatus = 'failed';
        document.ingestionError = error.message;
        await documentRepository.save(document);
        throw error;
    }
};
