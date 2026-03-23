import mongoose from 'mongoose';

const aiCacheSchema = new mongoose.Schema({
    cacheKey: { type: String, required: true, unique: true, index: true },
    response: { type: mongoose.Schema.Types.Mixed, required: true },
    promptHash: { type: String },
    createdAt: { type: Date, default: Date.now, expires: '6h' } // 6 hour TTL
}, { timestamps: true });

export default mongoose.models.AICache || mongoose.model('AICache', aiCacheSchema);
