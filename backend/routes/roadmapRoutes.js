import express from 'express';
import { getRoadmap, regenerateRoadmap } from '../controllers/roadmapController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/document/:id', protect, getRoadmap);
router.post('/document/:id/regenerate', protect, regenerateRoadmap);

export default router;
