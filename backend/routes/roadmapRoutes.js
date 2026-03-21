import express from 'express';
import { getRoadmap, regenerateRoadmap, updateRoadmapItemStatus } from '../controllers/roadmapController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/document/:id', protect, getRoadmap);
router.post('/document/:id/regenerate', protect, regenerateRoadmap);
router.patch('/document/:id/item/:order/status', protect, updateRoadmapItemStatus);

export default router;
