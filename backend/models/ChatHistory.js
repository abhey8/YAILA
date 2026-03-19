import mongoose from 'mongoose';

const chatHistorySchema = new mongoose.Schema({
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    messages: [{
        role: { type: String, enum: ['user', 'ai'], required: true },
        content: { type: String, required: true },
        retrievedChunkIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DocumentChunk' }],
        conceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
        timestamp: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('ChatHistory', chatHistorySchema);
