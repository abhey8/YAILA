import mongoose from 'mongoose';

const conceptSchema = new mongoose.Schema({
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, required: true },
    parentConcept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
    prerequisiteConcepts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
    relatedConcepts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
    chunkRefs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DocumentChunk' }],
    keywords: [{ type: String }],
    difficulty: { type: Number, default: 0.5 },
    embedding: [{ type: Number, required: true }],
    importance: { type: Number, default: 0.5 },
    createdAt: { type: Date, default: Date.now }
});

conceptSchema.index({ document: 1, slug: 1 }, { unique: true });

export default mongoose.model('Concept', conceptSchema);
