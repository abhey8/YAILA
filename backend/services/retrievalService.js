import { env } from '../config/env.js';
import { cosineSimilarity } from '../lib/math.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { embedTexts } from './aiService.js';

const lexicalScore = (query, content) => {
    const queryTerms = query.toLowerCase().split(/\W+/).filter(Boolean);
    if (!queryTerms.length) {
        return 0;
    }

    const haystack = content.toLowerCase();
    const matches = queryTerms.filter((term) => haystack.includes(term)).length;
    return matches / queryTerms.length;
};

const hasUsableEmbedding = (embedding = []) => embedding.some((value) => Math.abs(value) > 1e-9);

const rerank = (query, chunks) => chunks
    .map((chunk) => ({
        ...chunk,
        rerankScore: (chunk.semanticScore * 0.65) + (lexicalScore(query, chunk.content) * 0.35)
    }))
    .sort((left, right) => right.rerankScore - left.rerankScore);

export const retrieveRelevantChunks = async ({ documentId, query, topK = env.retrievalTopK }) => {
    const [queryEmbedding] = await embedTexts([query]);

    try {
        const scoredChunks = await chunkRepository.vectorSearch(documentId, queryEmbedding, topK * 2);
        return rerank(query, scoredChunks).slice(0, topK);
    } catch (err) {
        const chunks = await chunkRepository.listByDocument(documentId);
        const scored = chunks.map((chunk) => ({
            ...chunk.toObject(),
            semanticScore: hasUsableEmbedding(chunk.embedding)
                ? cosineSimilarity(queryEmbedding, chunk.embedding)
                : lexicalScore(query, chunk.content)
        }));

        return rerank(query, scored).slice(0, topK);
    }
};
