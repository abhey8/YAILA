import mongoose from 'mongoose';

const quizSchema = new mongoose.Schema({
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    questions: [{
        question: { type: String, required: true },
        options: [{ type: String, required: true }],
        correctAnswer: { type: String, required: true },
        explanation: { type: String },
        conceptTags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }],
        conceptEmbedding: [{ type: Number }]
    }],
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Quiz', quizSchema);
