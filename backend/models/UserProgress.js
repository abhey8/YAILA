import mongoose from 'mongoose';

const topicProgressSchema = new mongoose.Schema({
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    timeSpentSeconds: { type: Number, default: 0 },
    chatQuestions: { type: Number, default: 0 },
    quizFailures: { type: Number, default: 0 },
    tutorSessions: { type: Number, default: 0 },
    lastStudiedAt: { type: Date, default: Date.now }
}, { _id: false });

const userProgressSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    documents: [{
        document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
        completionRate: { type: Number, default: 0 },
        currentRoadmap: { type: mongoose.Schema.Types.ObjectId, ref: 'Roadmap', default: null },
        topicProgress: [topicProgressSchema]
    }],
    totalStudyTimeSeconds: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('UserProgress', userProgressSchema);
