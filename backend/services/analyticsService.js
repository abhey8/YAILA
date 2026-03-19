import { progressRepository } from '../repositories/progressRepository.js';

const ensureDocumentProgress = (progress, documentId) => {
    let documentProgress = progress.documents.find((entry) => entry.document.toString() === documentId.toString());
    if (!documentProgress) {
        documentProgress = {
            document: documentId,
            completionRate: 0,
            currentRoadmap: null,
            topicProgress: []
        };
        progress.documents.push(documentProgress);
    }

    return documentProgress;
};

const ensureTopicProgress = (documentProgress, conceptId) => {
    let topicProgress = documentProgress.topicProgress.find((entry) => entry.concept.toString() === conceptId.toString());
    if (!topicProgress) {
        topicProgress = {
            concept: conceptId,
            timeSpentSeconds: 0,
            chatQuestions: 0,
            quizFailures: 0,
            tutorSessions: 0,
            lastStudiedAt: new Date()
        };
        documentProgress.topicProgress.push(topicProgress);
    }

    return topicProgress;
};

export const recordLearningInteraction = async ({
    userId,
    documentId,
    conceptIds = [],
    timeSpentSeconds = 0,
    chatQuestions = 0,
    quizFailures = 0,
    tutorSessions = 0,
    completionDelta = 0
}) => {
    const progress = await progressRepository.getOrCreate(userId);
    const documentProgress = ensureDocumentProgress(progress, documentId);

    documentProgress.completionRate = Math.min(1, Math.max(0, documentProgress.completionRate + completionDelta));
    progress.totalStudyTimeSeconds += timeSpentSeconds;
    progress.lastActiveAt = new Date();

    conceptIds.forEach((conceptId) => {
        const topicProgress = ensureTopicProgress(documentProgress, conceptId);
        topicProgress.timeSpentSeconds += timeSpentSeconds;
        topicProgress.chatQuestions += chatQuestions;
        topicProgress.quizFailures += quizFailures;
        topicProgress.tutorSessions += tutorSessions;
        topicProgress.lastStudiedAt = new Date();
    });

    await progressRepository.save(progress);
    return progress;
};
