import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { masteryRepository } from '../repositories/masteryRepository.js';
import { getRevisionRecommendations } from '../services/recommendationService.js';

export const getWeakConcepts = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const concepts = await masteryRepository.listWeakConcepts(req.user._id, document._id);
    res.json(concepts.map((entry) => ({
        conceptId: entry.concept._id,
        conceptName: entry.concept.name,
        masteryScore: entry.masteryScore,
        confusionScore: entry.confusionScore,
        needsRevision: entry.needsRevision
    })));
});

export const getRevisionResources = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const recommendations = await getRevisionRecommendations(req.user._id, document._id);
    res.json(recommendations);
});
