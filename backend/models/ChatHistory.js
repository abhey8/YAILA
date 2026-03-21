import mongoose from 'mongoose';

const citationSchema = new mongoose.Schema({
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    chunk: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentChunk', default: null },
    documentTitle: { type: String, default: '' },
    sectionTitle: { type: String, default: '' },
    chunkIndex: { type: Number, default: 0 }
}, { _id: false });

const chatHistorySchema = new mongoose.Schema({
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceDocuments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    messages: [{
        role: { type: String, enum: ['user', 'ai'], required: true },
        content: { type: String, required: true },
        retrievedChunkIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DocumentChunk' }],
        conceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
        citations: [citationSchema],
        timestamp: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('ChatHistory', chatHistorySchema);
