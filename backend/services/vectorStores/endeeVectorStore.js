import { decode } from '@msgpack/msgpack';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { chunkRepository } from '../../repositories/chunkRepository.js';

const ensuredIndexes = new Map();
const ENDPOINT_TIMEOUT_MS = 15000;

const toIndexName = () => {
    const parts = [env.vectorStoreNamespace, env.endeeIndexName]
        .map((value) => `${value || ''}`.trim())
        .filter(Boolean);
    return parts.join('-');
};

const buildHeaders = (contentType = 'application/json') => {
    const headers = {
        'Content-Type': contentType
    };

    if (env.endeeAuthToken) {
        headers.Authorization = env.endeeAuthToken;
    }

    return headers;
};

const withTimeout = async (url, options = {}, timeoutMs = ENDPOINT_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
};

const safeParseJson = async (response) => {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
};

const decodeMeta = (meta = null) => {
    if (!meta) return {};

    try {
        const bytes = meta instanceof Uint8Array ? meta : Uint8Array.from(meta);
        const decoded = new TextDecoder().decode(bytes);
        return decoded ? JSON.parse(decoded) : {};
    } catch {
        return {};
    }
};

const buildSearchFilter = ({ userId, documentIds = [] }) => {
    const filters = [];
    if (userId) {
        filters.push({ userId: { $eq: `${userId}` } });
    }
    if (documentIds.length === 1) {
        filters.push({ documentId: { $eq: `${documentIds[0]}` } });
    } else if (documentIds.length > 1) {
        filters.push({ documentId: { $in: documentIds.map((documentId) => `${documentId}`) } });
    }
    return filters;
};

const toInsertObject = (chunk) => ({
    id: chunk.vectorId,
    meta: JSON.stringify({
        documentId: `${chunk.document}`,
        userId: `${chunk.user}`,
        chunkIndex: chunk.chunkIndex,
        sectionTitle: chunk.sectionTitle || 'Untitled Section',
        pageStart: chunk.pageStart || 1,
        pageEnd: chunk.pageEnd || chunk.pageStart || 1,
        sourceName: chunk.sourceName || '',
        keywords: chunk.keywords || [],
        tokenCount: chunk.tokenCount || 0
    }),
    filter: JSON.stringify({
        userId: `${chunk.user}`,
        documentId: `${chunk.document}`,
        sectionTitle: chunk.sectionTitle || 'Untitled Section',
        sourceName: chunk.sourceName || '',
        pageStart: Number(chunk.pageStart || 1),
        pageEnd: Number(chunk.pageEnd || chunk.pageStart || 1)
    }),
    vector: chunk.embedding
});

export const createEndeeVectorStore = ({ fallbackStore }) => {
    const indexName = toIndexName();

    const ensureIndex = async ({ dimension }) => {
        const cacheKey = `${indexName}:${dimension}`;
        if (ensuredIndexes.has(cacheKey)) {
            return ensuredIndexes.get(cacheKey);
        }

        const promise = (async () => {
            const infoResponse = await withTimeout(
                `${env.endeeBaseUrl}/api/v1/index/${encodeURIComponent(indexName)}/info`,
                { method: 'GET', headers: buildHeaders() }
            );

            if (infoResponse.ok) {
                return true;
            }

            if (infoResponse.status !== 404) {
                const payload = await safeParseJson(infoResponse);
                throw new Error(payload?.error || `Endee index check failed with status ${infoResponse.status}`);
            }

            const createResponse = await withTimeout(
                `${env.endeeBaseUrl}/api/v1/index/create`,
                {
                    method: 'POST',
                    headers: buildHeaders(),
                    body: JSON.stringify({
                        index_name: indexName,
                        dim: dimension,
                        space_type: env.endeeSpaceType,
                        precision: env.endeePrecision
                    })
                }
            );

            if (!createResponse.ok) {
                const payload = await safeParseJson(createResponse);
                const errorMessage = payload?.error || payload?.raw || `Endee index creation failed with status ${createResponse.status}`;
                if (!/already exists/i.test(errorMessage)) {
                    throw new Error(errorMessage);
                }
            }

            return true;
        })();

        ensuredIndexes.set(cacheKey, promise);

        try {
            return await promise;
        } catch (error) {
            ensuredIndexes.delete(cacheKey);
            throw error;
        }
    };

    return {
        provider: 'endee',

        async ensureIndex({ dimension }) {
            return ensureIndex({ dimension });
        },

        async upsertChunks(chunks = []) {
            const readyChunks = chunks.filter((chunk) => chunk.vectorId && Array.isArray(chunk.embedding) && chunk.embedding.length);
            if (!readyChunks.length) {
                return { indexedCount: 0 };
            }

            try {
                const dimension = readyChunks[0].embedding.length || env.embeddingDimensions;
                await ensureIndex({ dimension });

                const response = await withTimeout(
                    `${env.endeeBaseUrl}/api/v1/index/${encodeURIComponent(indexName)}/vector/insert`,
                    {
                        method: 'POST',
                        headers: buildHeaders(),
                        body: JSON.stringify(readyChunks.map(toInsertObject))
                    }
                );

                if (!response.ok) {
                    const payload = await safeParseJson(response);
                    throw new Error(payload?.error || payload?.raw || `Endee insert failed with status ${response.status}`);
                }

                return { indexedCount: readyChunks.length };
            } catch (error) {
                logger.warn('[VectorStore] Endee insert failed, keeping Mongo chunk records as fallback', {
                    error: error.message,
                    indexName,
                    chunkCount: readyChunks.length
                });
                await fallbackStore.upsertChunks(readyChunks);
                return { indexedCount: readyChunks.length };
            }
        },

        async search({ userId, documentIds = [], queryEmbedding, topK }) {
            if (!documentIds.length || !queryEmbedding?.length) {
                return [];
            }

            try {
                await ensureIndex({ dimension: queryEmbedding.length || env.embeddingDimensions });
                const filter = buildSearchFilter({ userId, documentIds });
                const response = await withTimeout(
                    `${env.endeeBaseUrl}/api/v1/index/${encodeURIComponent(indexName)}/search`,
                    {
                        method: 'POST',
                        headers: buildHeaders(),
                        body: JSON.stringify({
                            vector: queryEmbedding,
                            k: topK,
                            ef: env.endeeEfSearch,
                            include_vectors: env.endeeIncludeVectors,
                            filter: JSON.stringify(filter)
                        })
                    }
                );

                if (!response.ok) {
                    const payload = await safeParseJson(response);
                    throw new Error(payload?.error || payload?.raw || `Endee search failed with status ${response.status}`);
                }

                const buffer = await response.arrayBuffer();
                const decoded = decode(new Uint8Array(buffer));
                const results = Array.isArray(decoded?.results) ? decoded.results : [];
                const vectorIds = results
                    .map((result) => `${result?.id || ''}`.trim())
                    .filter(Boolean);

                if (!vectorIds.length) {
                    return [];
                }

                const chunks = await chunkRepository.findByVectorIds(vectorIds);
                const byVectorId = new Map(
                    chunks.map((chunk) => [chunk.vectorId, typeof chunk?.toObject === 'function' ? chunk.toObject() : chunk])
                );

                return results
                    .map((result) => {
                        const chunk = byVectorId.get(result.id);
                        if (!chunk) {
                            return null;
                        }

                        const meta = decodeMeta(result.meta);
                        return {
                            ...chunk,
                            document: chunk.document || meta.documentId,
                            user: chunk.user || meta.userId,
                            chunkIndex: chunk.chunkIndex ?? meta.chunkIndex ?? 0,
                            sectionTitle: chunk.sectionTitle || meta.sectionTitle || 'Untitled Section',
                            pageStart: chunk.pageStart || meta.pageStart || 1,
                            pageEnd: chunk.pageEnd || meta.pageEnd || chunk.pageStart || 1,
                            sourceName: chunk.sourceName || meta.sourceName || '',
                            semanticScore: Number(result.similarity || 0)
                        };
                    })
                    .filter(Boolean);
            } catch (error) {
                logger.warn('[VectorStore] Endee search failed, falling back to Mongo vectors', {
                    error: error.message,
                    indexName
                });
                return fallbackStore.search({ userId, documentIds, queryEmbedding, topK });
            }
        },

        async deleteDocumentVectors({ documentId, userId }) {
            try {
                await ensureIndex({ dimension: env.embeddingDimensions });
                const filter = buildSearchFilter({ userId, documentIds: [documentId] });
                const response = await withTimeout(
                    `${env.endeeBaseUrl}/api/v1/index/${encodeURIComponent(indexName)}/vectors/delete`,
                    {
                        method: 'DELETE',
                        headers: buildHeaders(),
                        body: JSON.stringify({ filter })
                    }
                );

                if (!response.ok) {
                    const payload = await safeParseJson(response);
                    throw new Error(payload?.error || payload?.raw || `Endee delete failed with status ${response.status}`);
                }

                return true;
            } catch (error) {
                logger.warn('[VectorStore] Endee delete skipped', {
                    error: error.message,
                    indexName,
                    documentId: `${documentId}`
                });
                return false;
            }
        }
    };
};
