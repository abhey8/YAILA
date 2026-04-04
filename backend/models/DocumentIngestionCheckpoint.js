import mongoose from 'mongoose';

const pendingParagraphSchema = new mongoose.Schema({
    text: { type: String, required: true },
    pageNumber: { type: Number, required: true },
    isHeading: { type: Boolean, default: false }
}, { _id: false });

const frequencyEntrySchema = new mongoose.Schema({
    value: { type: String, required: true },
    count: { type: Number, default: 0 }
}, { _id: false });

const documentIngestionCheckpointSchema = new mongoose.Schema({
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceChecksum: { type: String, default: '' },
    status: {
        type: String,
        enum: ['pending', 'running', 'completed', 'failed'],
        default: 'pending'
    },
    parserVersion: { type: String, default: 'v2' },
    totalPages: { type: Number, default: 0 },
    nextPage: { type: Number, default: 1 },
    nextChunkIndex: { type: Number, default: 0 },
    charCursor: { type: Number, default: 0 },
    currentSectionTitle: { type: String, default: 'Introduction' },
    semanticGroup: { type: Number, default: 0 },
    pendingParagraphs: [pendingParagraphSchema],
    headerLineFrequencies: [frequencyEntrySchema],
    footerLineFrequencies: [frequencyEntrySchema],
    previewText: { type: String, default: '' },
    metrics: {
        processedPages: { type: Number, default: 0 },
        skippedPages: { type: Number, default: 0 },
        deduplicatedPages: { type: Number, default: 0 },
        processedChunks: { type: Number, default: 0 },
        embeddedChunks: { type: Number, default: 0 },
        indexedChunks: { type: Number, default: 0 }
    },
    timings: {
        parseMs: { type: Number, default: 0 },
        chunkMs: { type: Number, default: 0 },
        embedMs: { type: Number, default: 0 },
        indexMs: { type: Number, default: 0 }
    },
    lastError: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null }
});

documentIngestionCheckpointSchema.index({ document: 1, status: 1 });

export default mongoose.model('DocumentIngestionCheckpoint', documentIngestionCheckpointSchema);
