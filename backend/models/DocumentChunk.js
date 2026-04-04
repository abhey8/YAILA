import mongoose from 'mongoose';

const documentChunkSchema = new mongoose.Schema({
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    vectorId: { type: String, index: true, sparse: true },
    chunkIndex: { type: Number, required: true },
    content: { type: String, required: true },
    contentHash: { type: String, required: true, index: true },
    sectionTitle: { type: String, default: 'Untitled Section' },
    sourceName: { type: String, default: '' },
    pageStart: { type: Number, default: 1, index: true },
    pageEnd: { type: Number, default: 1, index: true },
    summary: { type: String, default: '' },
    keywords: [{ type: String }],
    tokenCount: { type: Number, required: true },
    charStart: { type: Number, required: true },
    charEnd: { type: Number, required: true },
    window: {
        semanticGroup: { type: Number, default: 0 },
        overlapFrom: { type: Number, default: 0 }
    },
    embedding: [{ type: Number, default: [] }],
    vectorIndexedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

documentChunkSchema.index({ document: 1, chunkIndex: 1 }, { unique: true });
documentChunkSchema.index({ user: 1, contentHash: 1 });
documentChunkSchema.index({ document: 1, vectorId: 1 }, { unique: true, sparse: true });
documentChunkSchema.index({
    content: 'text',
    summary: 'text',
    sectionTitle: 'text',
    keywords: 'text'
});

export default mongoose.model('DocumentChunk', documentChunkSchema);
