import mongoose from 'mongoose';

const flashcardSchema = new mongoose.Schema({
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceDocuments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    question: { type: String, required: true },
    answer: { type: String, required: true },
    citations: [{
        document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
        chunk: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentChunk', default: null },
        documentTitle: { type: String, default: '' },
        sectionTitle: { type: String, default: '' }
    }],
    isFavorite: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Flashcard', flashcardSchema);
