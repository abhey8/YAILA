import { chunkRepository } from '../../repositories/chunkRepository.js';

const toPlainChunk = (chunk) => (typeof chunk?.toObject === 'function' ? chunk.toObject() : chunk);

export const createMongoVectorStore = () => ({
    provider: 'mongo',

    async ensureIndex() {
        return true;
    },

    async upsertChunks() {
        return { indexedCount: 0 };
    },

    async search({ userId, documentIds = [], queryEmbedding, topK }) {
        if (!queryEmbedding?.length || !documentIds.length) {
            return [];
        }

        const raw = documentIds.length === 1
            ? await chunkRepository.vectorSearch(documentIds[0], queryEmbedding, topK)
            : await chunkRepository.vectorSearchByDocuments(documentIds, userId, queryEmbedding, topK);

        return raw.map((chunk) => ({
            ...toPlainChunk(chunk),
            semanticScore: chunk.semanticScore || 0
        }));
    },

    async deleteDocumentVectors() {
        return 0;
    }
});
