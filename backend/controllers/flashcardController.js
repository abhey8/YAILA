import Flashcard from '../models/Flashcard.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { generateJson } from '../services/aiService.js';
import { trackActivity } from '../services/activityService.js';

const lexicalScore = (needle, haystack) => {
    const tokens = (needle.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
    if (!tokens.length) {
        return 0;
    }

    const lowered = haystack.toLowerCase();
    const matches = tokens.filter((token) => lowered.includes(token)).length;
    return matches / tokens.length;
};

const selectCitations = (question, chunks) => chunks
    .map((chunk) => ({
        chunk,
        score: lexicalScore(question, `${chunk.content} ${chunk.summary || ''}`)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((entry) => ({
        document: entry.chunk.document,
        chunk: entry.chunk._id,
        documentTitle: entry.chunk.documentTitle,
        sectionTitle: entry.chunk.sectionTitle || 'Untitled Section'
    }));

export const generateFlashcards = asyncHandler(async (req, res) => {
    const isCollection = req.params.id === 'collection';
    const requestedDocuments = isCollection
        ? await documentRepository.listOwnedDocumentsByIds(req.user._id, req.body.documentIds || [])
        : [await documentRepository.findOwnedDocument(req.params.id, req.user._id)].filter(Boolean);
    if (!requestedDocuments.length) {
        throw new AppError(isCollection ? 'No documents found for flashcard generation' : 'Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const documents = await Promise.all(
        requestedDocuments.map((document) => documentRepository.findOwnedDocument(document._id, req.user._id))
    );
    const sourceDocuments = documents.filter(Boolean);
    const sourceDocumentIds = sourceDocuments.map((document) => document._id);
    const anchorDocument = sourceDocuments[0];

    const shouldRegenerate = req.query.regenerate === 'true' || req.body?.regenerate === true;
    const existingFlashcards = await Flashcard.find({ document: anchorDocument._id, user: req.user._id });
    if (existingFlashcards.length && !shouldRegenerate && !isCollection) {
        res.json(existingFlashcards);
        return;
    }

    if (shouldRegenerate && existingFlashcards.length) {
        await Flashcard.deleteMany({ document: anchorDocument._id, user: req.user._id });
    }

    const chunks = (await chunkRepository.listByDocumentsOrdered(sourceDocumentIds)).map((chunk) => ({
        ...chunk.toObject(),
        documentTitle: sourceDocuments.find((document) => document._id.toString() === chunk.document.toString())?.title
            || sourceDocuments.find((document) => document._id.toString() === chunk.document.toString())?.originalName
            || 'Uploaded Document'
    }));
    const sampledChunks = chunks.slice(0, 18);
    const prompt = `Create 10 strong study flashcards from these uploaded materials.
Documents:
${sourceDocuments.map((document) => `- ${document.title || document.originalName}`).join('\n')}

Rules:
- Every flashcard must be grounded in the excerpts below.
- Use multiple documents when helpful.
- Focus on definitions, proof ideas, methods, and distinctions.
- Do not use outside knowledge.
- Keep answers short but meaningful.

Return a JSON array with objects containing question and answer.

${sampledChunks.map((chunk, index) => `Excerpt ${index + 1}
Document: ${chunk.documentTitle}
Section: ${chunk.sectionTitle || 'Untitled Section'}
${chunk.content}`).join('\n\n')}`;
    const flashcardsData = await generateJson(prompt);

    const flashcards = await Promise.all(
        flashcardsData.map(async (flashcard) => Flashcard.create({
            document: anchorDocument._id,
            user: req.user._id,
            sourceDocuments: sourceDocumentIds,
            question: flashcard.question,
            answer: flashcard.answer,
            citations: selectCitations(flashcard.question, sampledChunks)
        }))
    );

    await trackActivity({
        userId: req.user._id,
        documentId: anchorDocument._id,
        type: 'flashcards-generated',
        title: 'Flashcards generated',
        description: `${flashcards.length} flashcards were created from uploaded materials.`,
        metadata: {
            count: flashcards.length,
            sourceDocuments: sourceDocumentIds
        }
    });

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
