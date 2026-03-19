import express from 'express';
import { getRevisionResources, getWeakConcepts } from '../controllers/conceptController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/document/:id/weak', protect, getWeakConcepts);
router.get('/document/:id/recommendations', protect, getRevisionResources);

export default router;
