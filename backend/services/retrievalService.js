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
    .map((chunk) => {
        const lexical = lexicalScore(query, chunk.content);
        const semantic = chunk.semanticScore || 0;
        // If semantic is clearly a failure/placeholder (0.01), rely more on lexical
        const isPlaceholder = Math.abs(semantic - 1.0) < 1e-4 && lexical > 0.1;
        
        return {
            ...chunk,
            rerankScore: isPlaceholder ? (lexical * 0.8) : (semantic * 0.6 + lexical * 0.4)
        };
    })
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
    let queryEmbedding = null;
    try {
        const embeddings = await embedTexts([query]);
        queryEmbedding = embeddings[0];
    } catch (error) {
        queryEmbedding = null;
    }

    const fallbackLexicalSearch = async () => {
        const chunks = resolvedIds.length === 1
            ? await chunkRepository.listByDocument(resolvedIds[0])
            : await chunkRepository.listByDocuments(resolvedIds);
        const scored = chunks.map((chunk) => ({
            ...chunk.toObject(),
            semanticScore: (queryEmbedding?.length && hasUsableEmbedding(chunk.embedding))
                ? cosineSimilarity(queryEmbedding, chunk.embedding)
                : lexicalScore(query, chunk.content),
            documentTitle: documentTitleById.get(chunk.document.toString()) || 'Uploaded Document'
        }));

        return rerank(query, scored).slice(0, topK);
    };

    try {
        if (!queryEmbedding?.length) {
            throw new Error('Query embedding unavailable');
        }
        const scoredChunks = resolvedIds.length === 1
            ? await chunkRepository.vectorSearch(resolvedIds[0], queryEmbedding, topK * 3)
            : await chunkRepository.vectorSearchByDocuments(resolvedIds, userId, queryEmbedding, topK * 3);

        if (!scoredChunks.length) {
            return fallbackLexicalSearch();
        }

        return rerank(query, scoredChunks)
            .slice(0, topK)
            .map((chunk) => ({
                ...chunk,
                documentTitle: documentTitleById.get(chunk.document.toString()) || 'Uploaded Document'
            }));
    } catch (err) {
        return fallbackLexicalSearch();
    }
};
