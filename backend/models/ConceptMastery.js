import mongoose from 'mongoose';

const evidenceSchema = new mongoose.Schema({
    sourceType: {
        type: String,
        enum: ['quiz', 'chat', 'recall', 'revision', 'time-spent'],
        required: true
    },
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    score: { type: Number, required: true },
    recordedAt: { type: Date, default: Date.now }
}, { _id: false });

const conceptMasterySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true, index: true },
    masteryScore: { type: Number, default: 0.5 },
    confidenceScore: { type: Number, default: 0.5 },
    attempts: { type: Number, default: 0 },
    correctAttempts: { type: Number, default: 0 },
    lastInteractionAt: { type: Date, default: Date.now },
    confusionScore: { type: Number, default: 0 },
    needsRevision: { type: Boolean, default: false },
    evidence: [evidenceSchema],
    createdAt: { type: Date, default: Date.now }
});

conceptMasterySchema.index({ user: 1, concept: 1 }, { unique: true });

export default mongoose.model('ConceptMastery', conceptMasterySchema);
