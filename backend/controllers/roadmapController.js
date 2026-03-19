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
