import Quiz from '../models/Quiz.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { generateAdaptiveQuiz, submitAdaptiveQuizAttempt } from '../services/quizService.js';

export const generateQuiz = asyncHandler(async (req, res) => {
    const { count = 5 } = req.body;
    const isCollection = req.params.id === 'collection';
    const documents = isCollection
        ? await documentRepository.listOwnedDocumentsByIds(req.user._id, req.body.documentIds || [])
        : [await documentRepository.findOwnedDocument(req.params.id, req.user._id)].filter(Boolean);
    if (!documents.length) {
        throw new AppError(isCollection ? 'No documents found for quiz generation' : 'Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const fullDocuments = await Promise.all(
        documents.map((document) => documentRepository.findOwnedDocument(document._id, req.user._id))
    );
    const quiz = await generateAdaptiveQuiz(fullDocuments.filter(Boolean), req.user._id, count);
    res.status(201).json(quiz);
});

export const getQuizzesByDocument = asyncHandler(async (req, res) => {
    const quizzes = await Quiz.find({ document: req.params.id, user: req.user._id }).select('-questions.correctAnswer');
    res.json(quizzes);
});

export const getQuizById = asyncHandler(async (req, res) => {
    const quiz = await Quiz.findOne({ _id: req.params.id, user: req.user._id });
    if (!quiz) {
        throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    }

    res.json(quiz);
});

export const submitQuizAttempt = asyncHandler(async (req, res) => {
    const { answers } = req.body;
    const quiz = await Quiz.findOne({ _id: req.params.id, user: req.user._id });
    if (!quiz) {
        throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND');
    }

    const result = await submitAdaptiveQuizAttempt(quiz, req.user._id, answers);
    res.status(201).json(result);
});
