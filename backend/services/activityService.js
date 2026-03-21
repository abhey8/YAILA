import ActivityEvent from '../models/ActivityEvent.js';

export const trackActivity = async ({
    userId,
    documentId = null,
    type,
    title,
    description = '',
    metadata = {}
}) => ActivityEvent.create({
    user: userId,
    document: documentId,
    type,
    title,
    description,
    metadata
});

export const listRecentActivity = async (userId, { limit = 20, page = 1 } = {}) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
        ActivityEvent.find({ user: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(safeLimit)
            .populate('document', 'title originalName')
            .lean(),
        ActivityEvent.countDocuments({ user: userId })
    ]);

    return {
        items: items.map((item) => ({
            id: item._id,
            type: item.type,
            title: item.title,
            description: item.description,
            createdAt: item.createdAt,
            document: item.document ? {
                id: item.document._id,
                title: item.document.title || item.document.originalName
            } : null,
            metadata: item.metadata || {}
        })),
        page: safePage,
        limit: safeLimit,
        total,
        hasMore: skip + items.length < total
    };
};
