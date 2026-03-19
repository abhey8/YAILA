import { masteryRepository } from '../repositories/masteryRepository.js';
import { progressRepository } from '../repositories/progressRepository.js';

export const predictConfusion = async (userId, documentId) => {
    const [masteries, progress] = await Promise.all([
        masteryRepository.findByUserAndDocument(userId, documentId),
        progressRepository.getOrCreate(userId)
    ]);

    const documentProgress = progress.documents.find((entry) => entry.document.toString() === documentId.toString());
    const topicProgress = documentProgress?.topicProgress || [];

    return masteries.map((mastery) => {
        const metrics = topicProgress.find((entry) => entry.concept.toString() === mastery.concept._id.toString());
        const behavioralScore = [
            (metrics?.timeSpentSeconds || 0) > 1800 ? 0.3 : 0,
            (metrics?.quizFailures || 0) >= 2 ? 0.4 : 0,
            (metrics?.chatQuestions || 0) >= 3 ? 0.3 : 0
        ].reduce((sum, value) => sum + value, 0);

        const score = Math.min(1, mastery.confusionScore + behavioralScore);

        return {
            conceptId: mastery.concept._id,
            conceptName: mastery.concept.name,
            confusionScore: score,
            triggerRevision: score >= 0.6,
            easierExplanation: score >= 0.7
        };
    }).sort((left, right) => right.confusionScore - left.confusionScore);
};
