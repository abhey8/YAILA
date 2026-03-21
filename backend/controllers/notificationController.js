import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import {
    getUnreadNotificationCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead
} from '../services/notificationService.js';

export const getNotifications = asyncHandler(async (req, res) => {
    const items = await listNotifications(req.user._id, { limit: req.query.limit });
    res.json({ items });
});

export const getNotificationUnreadCount = asyncHandler(async (req, res) => {
    const unreadCount = await getUnreadNotificationCount(req.user._id);
    res.json({ unreadCount });
});

export const markNotificationAsRead = asyncHandler(async (req, res) => {
    const notification = await markNotificationRead(req.user._id, req.params.id);
    if (!notification) {
        throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
    }

    res.json({ success: true });
});

export const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
    await markAllNotificationsRead(req.user._id);
    res.json({ success: true });
});
