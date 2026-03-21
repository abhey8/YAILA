import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { generateRoadmap, getCurrentRoadmap } from '../services/roadmapService.js';

export const getRoadmap = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const roadmap = await getCurrentRoadmap(req.user._id, document._id);
    res.json(roadmap);
});

export const regenerateRoadmap = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const roadmap = await generateRoadmap(req.user._id, document._id, req.body.reason || 'manual-refresh');
    res.json(roadmap);
});

export const updateRoadmapItemStatus = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const roadmap = await getCurrentRoadmap(req.user._id, document._id);
    if (!roadmap) {
        throw new AppError('Roadmap not found', 404, 'ROADMAP_NOT_FOUND');
    }

    const { order } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'in-progress', 'completed'].includes(status)) {
        throw new AppError('Invalid status', 400, 'INVALID_STATUS');
    }

    const item = roadmap.items.find(i => i.order === parseInt(order));
    if (!item) {
        throw new AppError('Roadmap item not found', 404, 'ITEM_NOT_FOUND');
    }

    item.status = status;
    await roadmap.save();

    res.json(roadmap);
});
