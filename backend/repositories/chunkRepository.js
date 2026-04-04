import DocumentChunk from '../models/DocumentChunk.js';
import mongoose from 'mongoose';

export const chunkRepository = {
    createMany: async (chunks) => {
        if (!chunks || chunks.length === 0) return [];
        const operations = chunks.map((chunk) => ({
            updateOne: {
                filter: chunk.vectorId
                    ? { document: chunk.document, vectorId: chunk.vectorId }
                    : { document: chunk.document, chunkIndex: chunk.chunkIndex },
                update: { $set: chunk },
                upsert: true
            }
        }));
        await DocumentChunk.bulkWrite(operations, { ordered: false });
        // Return chunks back so the caller can check lengths seamlessly
        return chunks;
    },
    deleteByDocument: (documentId) => DocumentChunk.deleteMany({ document: documentId }),
    listByDocument: (documentId) => DocumentChunk.find({ document: documentId }).sort({ chunkIndex: 1 }),
    listByDocuments: (documentIds) => DocumentChunk.find({ document: { $in: documentIds } }),
    listByDocumentsOrdered: (documentIds) => DocumentChunk.find({ document: { $in: documentIds } }).sort({ document: 1, chunkIndex: 1 }),
    findByVectorIds: (vectorIds) => DocumentChunk.find({ vectorId: { $in: vectorIds } }),
    listByIds: (chunkIds) => DocumentChunk.find({ _id: { $in: chunkIds } }),
    listByUser: (userId) => DocumentChunk.find({ user: userId }),
    findByHashes: (hashes) => DocumentChunk.find({ contentHash: { $in: hashes } }),
    getDocumentChunkHashes: async (documentId) => {
        const rows = await DocumentChunk.find({ document: documentId }).select('contentHash -_id').lean();
        return rows.map((row) => row.contentHash).filter(Boolean);
    },
    sampleByDocument: async (documentId, limit = 64) => {
        const total = await DocumentChunk.countDocuments({ document: documentId });
        if (total <= limit) {
            return DocumentChunk.find({ document: documentId })
                .sort({ chunkIndex: 1 })
                .limit(limit);
        }

        return DocumentChunk.aggregate([
            { $match: { document: new mongoose.Types.ObjectId(documentId) } },
            { $sample: { size: limit } },
            { $sort: { chunkIndex: 1 } }
        ]);
    },
    lexicalSearchByDocuments: async (documentIds, userId, query, limit = 24) => {
        const trimmed = `${query || ''}`.trim();
        if (!trimmed) {
            return [];
        }

        try {
                return await DocumentChunk.find({
                user: userId,
                document: { $in: documentIds },
                $text: { $search: trimmed }
            }, {
                score: { $meta: 'textScore' }
            })
                .sort({ score: { $meta: 'textScore' }, document: 1, chunkIndex: 1 })
                .limit(limit);
        } catch {
            const tokens = trimmed
                .toLowerCase()
                .split(/\W+/)
                .filter((token) => token.length > 2)
                .slice(0, 8);

            if (!tokens.length) {
                return [];
            }

            return DocumentChunk.find({
                user: userId,
                document: { $in: documentIds },
                $or: tokens.flatMap((token) => ([
                    { content: { $regex: token, $options: 'i' } },
                    { summary: { $regex: token, $options: 'i' } },
                    { sectionTitle: { $regex: token, $options: 'i' } },
                    { keywords: token }
                ]))
            })
                .sort({ document: 1, chunkIndex: 1 })
                .limit(limit);
        }
    },
    listAdjacentByDocument: async (documentId, chunkIndexes = [], radius = 1) => {
        if (!chunkIndexes.length || radius <= 0) {
            return [];
        }

        const ranges = chunkIndexes.map((chunkIndex) => ({
            chunkIndex: {
                $gte: Math.max(0, chunkIndex - radius),
                $lte: chunkIndex + radius
            }
        }));

        return DocumentChunk.find({
            document: documentId,
            $or: ranges
        }).sort({ chunkIndex: 1 });
    },
    vectorSearch: async (documentId, queryEmbedding, topK) => {
        return await DocumentChunk.aggregate([
            {
                $vectorSearch: {
                    index: 'vector_index',
                    path: 'embedding',
                    queryVector: queryEmbedding,
                    numCandidates: topK * 10,
                    limit: topK,
                    filter: { document: new mongoose.Types.ObjectId(documentId) }
                }
            },
            {
                $project: {
                    _id: 1,
                    document: 1,
                    user: 1,
                    vectorId: 1,
                    chunkIndex: 1,
                    content: 1,
                    summary: 1,
                    keywords: 1,
                    sectionTitle: 1,
                    sourceName: 1,
                    pageStart: 1,
                    pageEnd: 1,
                    tokenCount: 1,
                    charStart: 1,
                    charEnd: 1,
                    window: 1,
                    semanticScore: { $meta: 'vectorSearchScore' }
                }
            }
        ]);
    },
    vectorSearchByDocuments: async (documentIds, userId, queryEmbedding, topK) => {
        return await DocumentChunk.aggregate([
            {
                $vectorSearch: {
                    index: 'vector_index',
                    path: 'embedding',
                    queryVector: queryEmbedding,
                    numCandidates: topK * 10,
                    limit: topK,
                    filter: {
                        user: new mongoose.Types.ObjectId(userId),
                        document: {
                            $in: documentIds.map((documentId) => new mongoose.Types.ObjectId(documentId))
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    document: 1,
                    user: 1,
                    vectorId: 1,
                    chunkIndex: 1,
                    content: 1,
                    summary: 1,
                    keywords: 1,
                    tokenCount: 1,
                    charStart: 1,
                    charEnd: 1,
                    sectionTitle: 1,
                    sourceName: 1,
                    pageStart: 1,
                    pageEnd: 1,
                    window: 1,
                    semanticScore: { $meta: 'vectorSearchScore' }
                }
            }
        ]);
    }
};
