import mongoose from 'mongoose';

const roadmapItemSchema = new mongoose.Schema({
    order: { type: Number, required: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    reason: { type: String, required: true },
    estimatedMinutes: { type: Number, default: 30 },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed'],
        default: 'pending'
    },
    recommendedResources: [{
        type: {
            type: String,
            enum: ['chunk', 'summary', 'quiz', 'flashcard', 'chat'],
            required: true
        },
        refId: { type: mongoose.Schema.Types.ObjectId, default: null },
        label: { type: String, required: true }
    }]
}, { _id: false });

const roadmapSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    generatedAt: { type: Date, default: Date.now },
    validUntil: { type: Date, required: true },
    regenerationReason: { type: String, required: true },
    items: [roadmapItemSchema]
});

export default mongoose.model('Roadmap', roadmapSchema);
