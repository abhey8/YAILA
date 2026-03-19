import express from 'express';
import { generateQuiz, getQuizzesByDocument, getQuizById, submitQuizAttempt } from '../controllers/quizController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/generate/:id', protect, generateQuiz);
router.get('/document/:id', protect, getQuizzesByDocument);
router.route('/:id')
    .get(protect, getQuizById)
    .post(protect, submitQuizAttempt);

export default router;
