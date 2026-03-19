import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    filename: { type: String, required: true }, // stored file name
    originalName: { type: String, required: true },
    path: { type: String, required: true },
    size: { type: Number, required: true },
    textContent: { type: String }, // Extracted text
    summary: { type: String },
    ingestionStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    ingestionError: { type: String, default: null },
    chunkCount: { type: Number, default: 0 },
    conceptCount: { type: Number, default: 0 },
    metadata: {
        pageCount: { type: Number, default: 0 },
        language: { type: String, default: 'en' },
        sourceType: { type: String, default: 'pdf' }
    },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Document', documentSchema);
