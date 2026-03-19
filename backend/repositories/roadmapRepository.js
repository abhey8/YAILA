import Roadmap from '../models/Roadmap.js';

export const roadmapRepository = {
    create: (payload) => Roadmap.create(payload),
    findLatestForDocument: (userId, documentId) => Roadmap.findOne({ user: userId, document: documentId }).sort({ generatedAt: -1 }).populate('items.concept'),
    findExpired: (before) => Roadmap.find({ validUntil: { $lte: before } }),
    save: (roadmap) => roadmap.save()
};
