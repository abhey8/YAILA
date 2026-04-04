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
            new: true
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
        { new: true }
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
        { new: true }
    ),
    deleteByDocument: (documentId) => DocumentIngestionCheckpoint.deleteOne({ document: documentId })
};
