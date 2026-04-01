import Notification from '../models/Notification.js';

export const createNotification = async ({
    userId,
    documentId = null,
    type,
    title,
    message,
    metadata = {}
}) => Notification.create({
    user: userId,
    document: documentId,
    type,
    title,
    message,
    metadata
});

export const listNotifications = async (userId, { limit = 15 } = {}) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 15, 1), 50);
    const items = await Notification.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .populate('document', 'title originalName')
        .lean();

    return items.map((item) => ({
        id: item._id,
        type: item.type,
        title: item.title,
        message: item.message,
        read: Boolean(item.readAt),
        createdAt: item.createdAt,
        document: item.document ? {
            id: item.document._id,
            title: item.document.title || item.document.originalName
        } : null,
        metadata: item.metadata || {}
    }));
};

export const getUnreadNotificationCount = (userId) => Notification.countDocuments({
    user: userId,
    readAt: null
});

export const markNotificationRead = async (userId, notificationId) => {
    const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, user: userId },
        { $set: { readAt: new Date() } },
        { returnDocument: 'after' }
    );

    return notification;
};

export const markAllNotificationsRead = async (userId) => {
    await Notification.updateMany(
        { user: userId, readAt: null },
        { $set: { readAt: new Date() } }
    );
};
