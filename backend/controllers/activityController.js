import { asyncHandler } from '../lib/asyncHandler.js';
import { listRecentActivity, trackActivity } from '../services/activityService.js';

export const getRecentActivity = asyncHandler(async (req, res) => {
    const activity = await listRecentActivity(req.user._id, {
        page: req.query.page,
        limit: req.query.limit
    });

    res.json(activity);
});

export const createActivityEvent = asyncHandler(async (req, res) => {
    const event = await trackActivity({
        userId: req.user._id,
        documentId: req.body.documentId || null,
        type: req.body.type,
        title: req.body.title,
        description: req.body.description,
        metadata: req.body.metadata || {}
    });

    res.status(201).json({ id: event._id });
});
