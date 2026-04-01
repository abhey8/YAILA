import ConceptMastery from '../models/ConceptMastery.js';

export const masteryRepository = {
    findByUserAndDocument: (userId, documentId) => ConceptMastery.find({ user: userId, document: documentId }).populate('concept'),
    findByUserAndDocuments: (userId, documentIds) => ConceptMastery.find({ user: userId, document: { $in: documentIds } }).populate('concept'),
    findOne: (userId, conceptId) => ConceptMastery.findOne({ user: userId, concept: conceptId }),
    upsert: (userId, documentId, conceptId, update) => ConceptMastery.findOneAndUpdate(
        { user: userId, document: documentId, concept: conceptId },
        update,
        { returnDocument: 'after', upsert: true }
    ),
    listWeakConcepts: (userId, documentId, threshold = 0.55) => ConceptMastery.find({
        user: userId,
        document: documentId,
        $or: [
            { masteryScore: { $lt: threshold } },
            { needsRevision: true }
        ]
    }).populate('concept').sort({ masteryScore: 1 }),
    listWeakConceptsByDocuments: (userId, documentIds, threshold = 0.55) => ConceptMastery.find({
        user: userId,
        document: { $in: documentIds },
        $or: [
            { masteryScore: { $lt: threshold } },
            { needsRevision: true }
        ]
    }).populate('concept').sort({ masteryScore: 1 })
};
