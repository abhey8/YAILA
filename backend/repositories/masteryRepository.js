import ConceptMastery from '../models/ConceptMastery.js';

export const masteryRepository = {
    findByUserAndDocument: (userId, documentId) => ConceptMastery.find({ user: userId, document: documentId }).populate('concept'),
    findOne: (userId, conceptId) => ConceptMastery.findOne({ user: userId, concept: conceptId }),
    upsert: (userId, documentId, conceptId, update) => ConceptMastery.findOneAndUpdate(
        { user: userId, document: documentId, concept: conceptId },
        update,
        { new: true, upsert: true }
    ),
    listWeakConcepts: (userId, documentId, threshold = 0.55) => ConceptMastery.find({
        user: userId,
        document: documentId,
        $or: [
            { masteryScore: { $lt: threshold } },
            { needsRevision: true }
        ]
    }).populate('concept').sort({ masteryScore: 1 })
};
