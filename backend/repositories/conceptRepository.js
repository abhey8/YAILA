import Concept from '../models/Concept.js';

export const conceptRepository = {
    createMany: (concepts) => Concept.insertMany(concepts),
    deleteByDocument: (documentId) => Concept.deleteMany({ document: documentId }),
    listByDocument: (documentId) => Concept.find({ document: documentId }).sort({ name: 1 }),
    listByDocuments: (documentIds) => Concept.find({ document: { $in: documentIds } }).sort({ name: 1 }),
    listByIds: (conceptIds) => Concept.find({ _id: { $in: conceptIds } }),
    listByUserAndDocuments: (userId, documentIds) => Concept.find({ user: userId, document: { $in: documentIds } })
};
