import fs from 'fs';
import ChatHistory from '../models/ChatHistory.js';
import Concept from '../models/Concept.js';
import ConceptMastery from '../models/ConceptMastery.js';
import Flashcard from '../models/Flashcard.js';
import LearningSession from '../models/LearningSession.js';
import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import Roadmap from '../models/Roadmap.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { trackActivity } from '../services/activityService.js';
import { scheduleDocumentIngestion } from '../services/documentProcessingService.js';
import { extractTextFromPDF } from '../utils/pdfParser.js';

export const uploadDocument = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new AppError('Please upload a PDF file', 400, 'MISSING_FILE');
    }

    try {
        const { text, pageCount } = await extractTextFromPDF(req.file.path);

        const document = await documentRepository.create({
            user: req.user._id,
            title: req.body.title || req.file.originalname,
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            textContent: text,
            metadata: {
                pageCount,
                language: 'en',
                sourceType: 'pdf'
            },
            ingestionProgress: {
                stage: 'queued',
                progressPercent: 0,
                totalChunks: 0,
                processedChunks: 0,
                embeddedChunks: 0,
                startedAt: null,
                completedAt: null
            }
        });

        await trackActivity({
            userId: req.user._id,
            documentId: document._id,
            type: 'document-uploaded',
            title: 'Document uploaded',
            description: `${document.title || document.originalName} was uploaded successfully.`,
            metadata: {
                pageCount,
                size: req.file.size
            }
        });

        scheduleDocumentIngestion(document._id, 'initial');

        const freshDocument = await documentRepository.findOwnedDocumentSummary(document._id, req.user._id);
        res.status(202).json({
             message: 'Document uploaded successfully. Ingestion is processing in the background.', 
             document: freshDocument
        });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        throw error;
    }
});

export const getUserDocuments = asyncHandler(async (req, res) => {
    const documents = await documentRepository.listOwnedDocuments(req.user._id);
    res.json(documents);
});

export const getDocumentById = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocumentSummary(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    res.json(document);
});

export const deleteDocument = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    if (fs.existsSync(document.path)) {
        fs.unlinkSync(document.path);
    }

    await documentRepository.deleteChunksForDocument(document._id);
    await Promise.all([
        ChatHistory.deleteMany({ document: document._id }),
        Concept.deleteMany({ document: document._id }),
        ConceptMastery.deleteMany({ document: document._id }),
        Flashcard.deleteMany({ document: document._id }),
        LearningSession.deleteMany({ document: document._id }),
        Quiz.deleteMany({ document: document._id }),
        QuizAttempt.deleteMany({ document: document._id }),
        Roadmap.deleteMany({ document: document._id })
    ]);
    await documentRepository.deleteDocument(document);

    res.json({ message: 'Document removed' });
});
