import Document from '../models/Document.js';
import Flashcard from '../models/Flashcard.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { listRecentActivity } from '../services/activityService.js';
import { getProfileAnalytics } from '../services/profileAnalyticsService.js';

export const getDashboardStats = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const progress = await progressRepository.getOrCreate(userId);

    const totalDocuments = await Document.countDocuments({ user: userId });
    const totalFlashcards = await Flashcard.countDocuments({ user: userId });

    const quizAttempts = await QuizAttempt.find({ user: userId });
    const totalQuizzesAttempted = quizAttempts.length;

    let avgQuizScore = 0;
    if (totalQuizzesAttempted > 0) {
        const sum = quizAttempts.reduce((acc, curr) => acc + (curr.score / curr.totalQuestions), 0);
        avgQuizScore = Math.round((sum / totalQuizzesAttempted) * 100);
    }

    const recentDocuments = await Document.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title createdAt ingestionStatus chunkCount conceptCount');
    const recentActivity = await listRecentActivity(userId, { limit: 6, page: 1 });
    const profileAnalytics = await getProfileAnalytics(userId);

    res.json({
        totalDocuments,
        totalFlashcards,
        totalQuizzesAttempted,
        avgQuizScore,
        totalStudyTimeSeconds: progress.totalStudyTimeSeconds,
        trackedDocuments: progress.documents.length,
        recentDocuments,
        recentActivity: recentActivity.items,
        progressOverview: {
            masteryScore: profileAnalytics.metrics.masteryScore,
            topicCoveragePercent: profileAnalytics.metrics.topicCoveragePercent,
            consistencyPercent: profileAnalytics.metrics.consistencyPercent,
            learningProgressPercent: profileAnalytics.metrics.learningProgressPercent,
            studyStreakDays: profileAnalytics.metrics.studyStreakDays
        }
    });
});

export const getDashboardProfileAnalytics = asyncHandler(async (req, res) => {
    const analytics = await getProfileAnalytics(req.user._id);
    res.json(analytics);
});
