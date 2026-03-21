import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null, index: true },
    type: {
        type: String,
        enum: [
            'document-processing-complete',
            'document-processing-failed',
            'weak-concept-detected',
            'roadmap-regenerated',
            'quiz-feedback-ready'
        ],
        required: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now, index: true }
});

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
