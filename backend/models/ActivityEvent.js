import mongoose from 'mongoose';

const activityEventSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null, index: true },
    type: {
        type: String,
        enum: [
            'document-uploaded',
            'document-processed',
            'document-processing-failed',
            'quiz-attempted',
            'flashcards-generated',
            'flashcards-reviewed',
            'recall-session',
            'roadmap-regenerated',
            'roadmap-progress',
            'weak-concept-detected'
        ],
        required: true
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, index: true }
});

activityEventSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('ActivityEvent', activityEventSchema);
