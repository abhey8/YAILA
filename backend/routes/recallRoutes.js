import express from 'express';
import { answerRecallQuestion, createRecallSession } from '../controllers/recallController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/document/:id/session', protect, createRecallSession);
router.post('/session/:id/answer', protect, answerRecallQuestion);

export default router;
