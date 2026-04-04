import Document from '../models/Document.js';
import DocumentChunk from '../models/DocumentChunk.js';

const documentSummaryProjection = '-textContent';

export const documentRepository = {
    findById: (documentId) => Document.findById(documentId),
    findOwnedDocument: (documentId, userId) => Document.findOne({ _id: documentId, user: userId }),
    findOwnedDocumentSummary: (documentId, userId) =>
        Document.findOne({ _id: documentId, user: userId }).select(documentSummaryProjection),
    listOwnedDocumentsByIds: (userId, documentIds) =>
        Document.find({ user: userId, _id: { $in: documentIds } }).select(documentSummaryProjection),
    listOwnedDocuments: (userId) =>
        Document.find({ user: userId }).select(documentSummaryProjection).sort('-createdAt'),
    listDocumentsNeedingSummary: () =>
        Document.find({
            ingestionStatus: 'completed',
            $or: [
                { summaryStatus: { $in: ['idle', 'generating', 'failed'] } },
                { summary: { $exists: false } },
                { summary: '' },
                { summary: null }
            ]
        }).select(documentSummaryProjection),
    create: (payload) => Document.create(payload),
    save: (document) => document.save(),
    deleteChunksForDocument: (documentId) => DocumentChunk.deleteMany({ document: documentId }),
    deleteDocument: (document) => document.deleteOne()
};
