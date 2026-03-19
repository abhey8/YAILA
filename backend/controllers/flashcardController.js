import Flashcard from '../models/Flashcard.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { formatChunksForPrompt, sampleChunksForPrompt } from '../lib/documentContext.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { generateJson } from '../services/aiService.js';

export const generateFlashcards = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const shouldRegenerate = req.query.regenerate === 'true' || req.body?.regenerate === true;
    const existingFlashcards = await Flashcard.find({ document: document._id, user: req.user._id });
    if (existingFlashcards.length && !shouldRegenerate) {
        res.json(existingFlashcards);
        return;
    }

    if (shouldRegenerate && existingFlashcards.length) {
        await Flashcard.deleteMany({ document: document._id, user: req.user._id });
    }

    const chunks = await chunkRepository.listByDocument(document._id);
    const sampledChunks = sampleChunksForPrompt(chunks, 12);
    const prompt = `Create 10 strong study flashcards from this uploaded document.
Document title: ${document.title}

Rules:
- Every flashcard must be grounded in the source excerpts below.
- Focus on important definitions, proof ideas, methods, and distinctions.
- Do not ask generic trivia or outside-knowledge questions.
- Keep each answer short but meaningful.

Return a JSON array with objects containing question and answer.

${formatChunksForPrompt(sampledChunks)}`;
    const flashcardsData = await generateJson(prompt);

    const flashcards = await Promise.all(
        flashcardsData.map(async (flashcard) => Flashcard.create({
            document: document._id,
            user: req.user._id,
            question: flashcard.question,
            answer: flashcard.answer
        }))
    );

    res.json(flashcards);
});

export const getFlashcardsByDocument = asyncHandler(async (req, res) => {
    const flashcards = await Flashcard.find({ document: req.params.id, user: req.user._id });
    res.json(flashcards);
});

export const getFavoriteFlashcards = asyncHandler(async (req, res) => {
    const flashcards = await Flashcard.find({ user: req.user._id, isFavorite: true });
    res.json(flashcards);
});

export const toggleFavorite = asyncHandler(async (req, res) => {
    const flashcard = await Flashcard.findOne({ _id: req.params.id, user: req.user._id });
    if (!flashcard) {
        throw new AppError('Flashcard not found', 404, 'FLASHCARD_NOT_FOUND');
    }

    flashcard.isFavorite = !flashcard.isFavorite;
    await flashcard.save();

    res.json(flashcard);
});

export const deleteFlashcard = asyncHandler(async (req, res) => {
    const flashcard = await Flashcard.findOne({ _id: req.params.id, user: req.user._id });
    if (!flashcard) {
        throw new AppError('Flashcard not found', 404, 'FLASHCARD_NOT_FOUND');
    }

    await flashcard.deleteOne();
    res.json({ message: 'Flashcard removed' });
});
