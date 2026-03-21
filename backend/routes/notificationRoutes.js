import express from 'express';
import {
    getNotifications,
    getNotificationUnreadCount,
    markAllNotificationsAsRead,
    markNotificationAsRead
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protect, getNotifications);
router.get('/unread-count', protect, getNotificationUnreadCount);
router.post('/read-all', protect, markAllNotificationsAsRead);
router.post('/:id/read', protect, markNotificationAsRead);

export default router;
