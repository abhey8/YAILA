import Flashcard from '../models/Flashcard.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { generateJson } from '../services/aiService.js';
import { trackActivity } from '../services/activityService.js';
import { sampleChunksForPrompt } from '../lib/documentContext.js';

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

const extractKeywords = (text = '') => {
    const tokens = (text.toLowerCase().match(/[a-z]{4,}/g) || []);
    const stop = new Set(['this', 'that', 'with', 'from', 'into', 'there', 'their', 'about', 'which', 'using', 'used', 'also', 'have', 'been', 'were', 'they', 'them']);
    const frequency = new Map();
    tokens.forEach((token) => {
        if (!stop.has(token)) {
            frequency.set(token, (frequency.get(token) || 0) + 1);
        }
    });
    return [...frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([token]) => token);
};

const buildFallbackFlashcards = (chunks, requestedCount) => {
    if (!chunks.length) {
        return [];
    }

    const allKeywords = extractKeywords(chunks.map((chunk) => chunk.content).join(' '));
    const cards = [];
    for (let index = 0; index < requestedCount; index += 1) {
        const chunk = chunks[index % chunks.length];
        const keyword = allKeywords[index % Math.max(allKeywords.length, 1)] || 'core concept';
        const content = (chunk.content || '').replace(/\s+/g, ' ').trim();
        const answer = content.slice(0, 180) + (content.length > 180 ? '...' : '');

        cards.push({
            question: `What does the document explain about "${keyword}" in ${chunk.sectionTitle || 'this section'}?`,
            answer
        });
    }
    return cards;
};

export const generateFlashcards = asyncHandler(async (req, res) => {
    const body = req.body || {};
    const isCollection = req.params.id === 'collection';
    const requestedDocuments = isCollection
        ? await documentRepository.listOwnedDocumentsByIds(req.user._id, body.documentIds || [])
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

    const shouldRegenerate = req.query.regenerate === 'true' || body.regenerate === true;
    const appendMode = req.query.append === 'true' || body.append === true;
    const existingFlashcards = await Flashcard.find({ document: anchorDocument._id, user: req.user._id });
    if (existingFlashcards.length && !shouldRegenerate && !appendMode && !isCollection) {
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
    const sampledChunks = sampleChunksForPrompt(chunks, 18);
    const requestedCount = Math.min(
        20,
        Math.max(5, Number(req.query.count) || Number(body.count) || 10)
    );
    const prompt = `Create ${requestedCount} strong study flashcards from these uploaded materials.
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
    let flashcardsData = [];
    try {
      flashcardsData = await generateJson(prompt, {
        maxTokens: Math.min(7000, 500 + requestedCount * 220)
      });
    } catch (error) {
      flashcardsData = buildFallbackFlashcards(sampledChunks, requestedCount);
    }

    const existingQuestionSet = new Set(existingFlashcards.map((card) => card.question.trim().toLowerCase()));
    const newItems = (Array.isArray(flashcardsData) ? flashcardsData : [])
      .filter((item) => item?.question && item?.answer)
      .filter((item) => {
        const key = `${item.question}`.trim().toLowerCase();
        if (!key || existingQuestionSet.has(key)) {
          return false;
        }
        existingQuestionSet.add(key);
        return true;
      });

    const flashcards = await Promise.all(
        newItems.map(async (flashcard) => Flashcard.create({
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

    if (appendMode) {
      const merged = await Flashcard.find({ document: anchorDocument._id, user: req.user._id });
      res.json(merged);
      return;
    }

    res.json(flashcards.length ? flashcards : existingFlashcards);
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
