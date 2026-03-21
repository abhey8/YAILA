import express from 'express';
import { getDashboardProfileAnalytics, getDashboardStats } from '../controllers/dashboardController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/stats', protect, getDashboardStats);
router.get('/profile-analytics', protect, getDashboardProfileAnalytics);

export default router;
