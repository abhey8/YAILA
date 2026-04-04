import DocumentIngestionCheckpoint from '../models/DocumentIngestionCheckpoint.js';

export const documentIngestionCheckpointRepository = {
    findByDocument: (documentId) => DocumentIngestionCheckpoint.findOne({ document: documentId }),
    createOrUpdate: async (documentId, userId, patch = {}) => DocumentIngestionCheckpoint.findOneAndUpdate(
        { document: documentId },
        {
            $set: {
                user: userId,
                updatedAt: new Date(),
                ...patch
            },
            $setOnInsert: {
                startedAt: new Date()
            }
        },
        {
            upsert: true,
            returnDocument: 'after'
        }
    ),
    markCompleted: (documentId, patch = {}) => DocumentIngestionCheckpoint.findOneAndUpdate(
        { document: documentId },
        {
            $set: {
                status: 'completed',
                updatedAt: new Date(),
                completedAt: new Date(),
                ...patch
            }
        },
        { returnDocument: 'after' }
    ),
    markFailed: (documentId, errorMessage, patch = {}) => DocumentIngestionCheckpoint.findOneAndUpdate(
        { document: documentId },
        {
            $set: {
                status: 'failed',
                updatedAt: new Date(),
                lastError: errorMessage,
                ...patch
            }
        },
        { returnDocument: 'after' }
    ),
    deleteByDocument: (documentId) => DocumentIngestionCheckpoint.deleteOne({ document: documentId })
};
