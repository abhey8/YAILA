import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { answerActiveRecall, startActiveRecallSession } from '../services/activeRecallService.js';

export const createRecallSession = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const session = await startActiveRecallSession({
        userId: req.user._id,
        documentId: document._id
    });
    res.status(201).json(session);
});

export const answerRecallQuestion = asyncHandler(async (req, res) => {
    const session = await answerActiveRecall({
        sessionId: req.params.id,
        userId: req.user._id,
        answer: req.body.answer
    });

    res.json(session);
});
