import LearningSession from '../models/LearningSession.js';

export const sessionRepository = {
    create: (payload) => LearningSession.create(payload),
    findOwnedSession: (sessionId, userId) => LearningSession.findOne({ _id: sessionId, user: userId }).populate('concept'),
    listByUserAndDocument: (userId, documentId) => LearningSession.find({ user: userId, document: documentId }).sort({ startedAt: -1 })
};
