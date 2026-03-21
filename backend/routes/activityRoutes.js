import express from 'express';
import { createActivityEvent, getRecentActivity } from '../controllers/activityController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/recent', protect, getRecentActivity);
router.post('/track', protect, createActivityEvent);

export default router;
