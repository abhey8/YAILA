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
    summaryStatus: {
        type: String,
        enum: ['idle', 'generating', 'ready', 'failed'],
        default: 'idle'
    },
    summaryError: { type: String, default: null },
    summaryUpdatedAt: { type: Date, default: null },
    ingestionStatus: {
        type: String,
        enum: ['queued', 'pending', 'extracting', 'processing', 'embedding_partial', 'completed', 'failed'],
        default: 'pending'
    },
    ingestionError: { type: String, default: null },
    chunkCount: { type: Number, default: 0 },
    conceptCount: { type: Number, default: 0 },
    metadata: {
        pageCount: { type: Number, default: 0 },
        language: { type: String, default: 'en' },
        sourceType: { type: String, default: 'pdf' },
        textPreviewChars: { type: Number, default: 0 },
        deduplicatedPages: { type: Number, default: 0 },
        skippedPages: { type: Number, default: 0 },
        repeatedHeaderLines: [{ type: String }],
        repeatedFooterLines: [{ type: String }]
    },
    ingestionProgress: {
        stage: {
            type: String,
            enum: ['queued', 'extracting', 'parsing', 'chunking', 'embedding', 'indexing', 'completed', 'failed'],
            default: 'queued'
        },
        progressPercent: { type: Number, default: 0 },
        totalPages: { type: Number, default: 0 },
        processedPages: { type: Number, default: 0 },
        currentPage: { type: Number, default: 0 },
        totalChunks: { type: Number, default: 0 },
        processedChunks: { type: Number, default: 0 },
        embeddedChunks: { type: Number, default: 0 },
        indexedChunks: { type: Number, default: 0 },
        resumeCount: { type: Number, default: 0 },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null }
    },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Document', documentSchema);
