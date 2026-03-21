import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { masteryRepository } from '../repositories/masteryRepository.js';
import { getRevisionRecommendations } from '../services/recommendationService.js';

export const getWeakConcepts = asyncHandler(async (req, res) => {
    const isCollection = req.params.id === 'collection';
    const documents = isCollection
        ? await documentRepository.listOwnedDocumentsByIds(req.user._id, (req.query.documentIds || '').split(',').filter(Boolean))
        : [await documentRepository.findOwnedDocument(req.params.id, req.user._id)].filter(Boolean);
    if (!documents.length) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const concepts = isCollection
        ? await masteryRepository.listWeakConceptsByDocuments(req.user._id, documents.map((document) => document._id))
        : await masteryRepository.listWeakConcepts(req.user._id, documents[0]._id);
    res.json(concepts.map((entry) => ({
        conceptId: entry.concept._id,
        conceptName: entry.concept.name,
        masteryScore: entry.masteryScore,
        confusionScore: entry.confusionScore,
        needsRevision: entry.needsRevision
    })));
});

export const getRevisionResources = asyncHandler(async (req, res) => {
    const isCollection = req.params.id === 'collection';
    const documents = isCollection
        ? await documentRepository.listOwnedDocumentsByIds(req.user._id, (req.query.documentIds || '').split(',').filter(Boolean))
        : [await documentRepository.findOwnedDocument(req.params.id, req.user._id)].filter(Boolean);
    if (!documents.length) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const recommendations = await getRevisionRecommendations(req.user._id, documents.map((document) => document._id));
    res.json(recommendations);
});
