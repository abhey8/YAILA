import DocumentChunk from '../models/DocumentChunk.js';
import mongoose from 'mongoose';

export const chunkRepository = {
    createMany: async (chunks) => {
        if (!chunks || chunks.length === 0) return [];
        const operations = chunks.map((chunk) => ({
            updateOne: {
                filter: { document: chunk.document, chunkIndex: chunk.chunkIndex },
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
    listByIds: (chunkIds) => DocumentChunk.find({ _id: { $in: chunkIds } }),
    listByUser: (userId) => DocumentChunk.find({ user: userId }),
    findByHashes: (hashes) => DocumentChunk.find({ contentHash: { $in: hashes } }),
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
                    chunkIndex: 1,
                    content: 1,
                    summary: 1,
                    keywords: 1,
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
                    chunkIndex: 1,
                    content: 1,
                    summary: 1,
                    keywords: 1,
                    tokenCount: 1,
                    charStart: 1,
                    charEnd: 1,
                    sectionTitle: 1,
                    window: 1,
                    semanticScore: { $meta: 'vectorSearchScore' }
                }
            }
        ]);
    }
};
