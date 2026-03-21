import ActivityEvent from '../models/ActivityEvent.js';
import Concept from '../models/Concept.js';
import ConceptMastery from '../models/ConceptMastery.js';
import Document from '../models/Document.js';
import Flashcard from '../models/Flashcard.js';
import LearningSession from '../models/LearningSession.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { getUnreadNotificationCount } from './notificationService.js';

const toDayKey = (value) => new Date(value).toISOString().slice(0, 10);

const computeStreak = (dates) => {
    const dayKeys = [...new Set(dates.map(toDayKey))].sort().reverse();
    if (!dayKeys.length) {
        return 0;
    }

    let streak = 0;
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    for (const key of dayKeys) {
        const currentKey = cursor.toISOString().slice(0, 10);
        if (key === currentKey) {
            streak += 1;
            cursor.setDate(cursor.getDate() - 1);
            continue;
        }

        if (streak === 0) {
            const yesterday = new Date(cursor);
            yesterday.setDate(yesterday.getDate() - 1);
            if (key === yesterday.toISOString().slice(0, 10)) {
                streak += 1;
                cursor = yesterday;
                cursor.setDate(cursor.getDate() - 1);
            }
        }

        break;
    }

    return streak;
};

export const getProfileAnalytics = async (userId) => {
    const [
        progress,
        totalDocuments,
        totalFlashcards,
        totalQuizAttempts,
        totalConcepts,
        masteryRecords,
        sessions,
        recentActivity,
        streakActivity,
        unreadNotifications
    ] = await Promise.all([
        progressRepository.getOrCreate(userId),
        Document.countDocuments({ user: userId }),
        Flashcard.countDocuments({ user: userId }),
        QuizAttempt.countDocuments({ user: userId }),
        Concept.countDocuments({ user: userId }),
        ConceptMastery.find({ user: userId }).select('masteryScore lastInteractionAt').lean(),
        LearningSession.countDocuments({ user: userId, status: 'completed' }),
        ActivityEvent.find({ user: userId }).sort({ createdAt: -1 }).limit(8).populate('document', 'title originalName').lean(),
        ActivityEvent.find({ user: userId }).sort({ createdAt: -1 }).limit(120).select('createdAt').lean(),
        getUnreadNotificationCount(userId)
    ]);

    const masteryScore = masteryRecords.length
        ? Math.round((masteryRecords.reduce((sum, item) => sum + item.masteryScore, 0) / masteryRecords.length) * 100)
        : 0;
    const topicCoveragePercent = totalConcepts
        ? Math.round((masteryRecords.filter((item) => item.masteryScore >= 0.6).length / totalConcepts) * 100)
        : 0;

    const recentDates = streakActivity.map((item) => item.createdAt);
    const streakDays = computeStreak(recentDates);

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    const consistencyDays = new Set(
        streakActivity
            .filter((item) => item.createdAt >= fourteenDaysAgo)
            .map((item) => toDayKey(item.createdAt))
    ).size;
    const consistencyPercent = Math.round((consistencyDays / 14) * 100);

    const documentCompletionRates = progress.documents.map((entry) => entry.completionRate || 0);
    const averageCompletion = documentCompletionRates.length
        ? documentCompletionRates.reduce((sum, value) => sum + value, 0) / documentCompletionRates.length
        : 0;
    const learningProgressPercent = Math.round(((masteryScore / 100) * 0.5 + averageCompletion * 0.3 + (consistencyPercent / 100) * 0.2) * 100);

    return {
        metrics: {
            documentsUploaded: totalDocuments,
            flashcardsCollected: totalFlashcards,
            quizzesAttempted: totalQuizAttempts,
            studyStreakDays: streakDays,
            totalStudyTimeSeconds: progress.totalStudyTimeSeconds || 0,
            masteryScore,
            topicCoveragePercent,
            consistencyPercent,
            learningProgressPercent,
            completedRecallSessions: sessions
        },
        recentActivity: recentActivity.map((item) => ({
            id: item._id,
            type: item.type,
            title: item.title,
            description: item.description,
            createdAt: item.createdAt,
            document: item.document ? {
                id: item.document._id,
                title: item.document.title || item.document.originalName
            } : null
        })),
        unreadNotifications
    };
};
