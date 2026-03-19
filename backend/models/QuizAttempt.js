import mongoose from 'mongoose';

const quizAttemptSchema = new mongoose.Schema({
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    answers: [{
        questionIndex: { type: Number, required: true },
        selectedOption: { type: String, required: true },
        isCorrect: { type: Boolean, required: true },
        conceptTags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }]
    }],
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('QuizAttempt', quizAttemptSchema);
