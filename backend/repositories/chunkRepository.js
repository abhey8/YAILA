import DocumentChunk from '../models/DocumentChunk.js';
import mongoose from 'mongoose';

export const chunkRepository = {
    createMany: (chunks) => DocumentChunk.insertMany(chunks),
    deleteByDocument: (documentId) => DocumentChunk.deleteMany({ document: documentId }),
    listByDocument: (documentId) => DocumentChunk.find({ document: documentId }).sort({ chunkIndex: 1 }),
    listByDocuments: (documentIds) => DocumentChunk.find({ document: { $in: documentIds } }),
    listByIds: (chunkIds) => DocumentChunk.find({ _id: { $in: chunkIds } }),
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
    }
};
