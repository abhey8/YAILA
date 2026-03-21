import { env } from '../config/env.js';
import { cosineSimilarity } from '../lib/math.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { documentRepository } from '../repositories/documentRepository.js';
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

export const resolveQueryableDocuments = async ({ userId, documentIds = [] }) => {
    if (!userId) {
        return [];
    }

    if (documentIds.length) {
        return documentRepository.listOwnedDocumentsByIds(userId, documentIds);
    }

    return documentRepository.listOwnedDocuments(userId);
};

export const retrieveRelevantChunks = async ({
    userId,
    documentId = null,
    documentIds = [],
    query,
    topK = env.retrievalTopK
}) => {
    const resolvedDocuments = documentId
        ? await resolveQueryableDocuments({ userId, documentIds: [documentId] })
        : await resolveQueryableDocuments({ userId, documentIds });

    if (!resolvedDocuments.length) {
        return [];
    }

    const resolvedIds = resolvedDocuments.map((document) => document._id);
    const documentTitleById = new Map(
        resolvedDocuments.map((document) => [document._id.toString(), document.title || document.originalName])
    );
    const [queryEmbedding] = await embedTexts([query]);

    try {
        const scoredChunks = resolvedIds.length === 1
            ? await chunkRepository.vectorSearch(resolvedIds[0], queryEmbedding, topK * 3)
            : await chunkRepository.vectorSearchByDocuments(resolvedIds, userId, queryEmbedding, topK * 3);

        return rerank(query, scoredChunks)
            .slice(0, topK)
            .map((chunk) => ({
                ...chunk,
                documentTitle: documentTitleById.get(chunk.document.toString()) || 'Uploaded Document'
            }));
    } catch (err) {
        const chunks = resolvedIds.length === 1
            ? await chunkRepository.listByDocument(resolvedIds[0])
            : await chunkRepository.listByDocuments(resolvedIds);
        const scored = chunks.map((chunk) => ({
            ...chunk.toObject(),
            semanticScore: hasUsableEmbedding(chunk.embedding)
                ? cosineSimilarity(queryEmbedding, chunk.embedding)
                : lexicalScore(query, chunk.content),
            documentTitle: documentTitleById.get(chunk.document.toString()) || 'Uploaded Document'
        }));

        return rerank(query, scored).slice(0, topK);
    }
};
