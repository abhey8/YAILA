import mongoose from 'mongoose';

const exchangeSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, default: '' },
    score: { type: Number, default: 0 },
    feedback: { type: String, default: '' },
    hint: { type: String, default: '' },
    followUpQuestion: { type: String, default: '' },
    askedAt: { type: Date, default: Date.now }
}, { _id: false });

const learningSessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
    mode: {
        type: String,
        enum: ['active-recall', 'chat', 'revision'],
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'completed'],
        default: 'active'
    },
    exchanges: [exchangeSchema],
    masteryDelta: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null }
});

export default mongoose.model('LearningSession', learningSessionSchema);
