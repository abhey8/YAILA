import Flashcard from '../models/Flashcard.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { generateJson } from '../services/aiService.js';
import { trackActivity } from '../services/activityService.js';
import { filterStudyWorthConcepts } from '../lib/studyContent.js';
import { loadPromptChunkCandidates, selectPromptExcerpts, toChunkId } from '../lib/promptSources.js';

const MAX_FLASHCARD_ATTEMPTS = 2;
const SEMANTIC_DUPLICATE_THRESHOLD = 0.75;

const lexicalScore = (needle, haystack) => {
    const tokens = (needle.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
    if (!tokens.length) {
        return 0;
    }

    const lowered = haystack.toLowerCase();
    const matches = tokens.filter((token) => lowered.includes(token)).length;
    return matches / tokens.length;
};

const selectCitations = (question, chunks, preferredChunk = null) => {
    const sourceChunks = preferredChunk ? [preferredChunk, ...chunks.filter((chunk) => toChunkId(chunk._id) !== toChunkId(preferredChunk._id))] : chunks;
    return sourceChunks
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
};

const buildConceptAnchoredChunkSet = (concepts = [], chunkMap = new Map(), requestedCount = 10) => {
    const selected = [];
    const seen = new Set();

    concepts
        .filter((concept) => Array.isArray(concept.chunkRefs) && concept.chunkRefs.length)
        .slice(0, Math.max(requestedCount * 2, 10))
        .forEach((concept) => {
            concept.chunkRefs.slice(0, 2).forEach((chunkId) => {
                const key = toChunkId(chunkId);
                const chunk = chunkMap.get(key);
                if (!chunk || seen.has(key)) {
                    return;
                }
                seen.add(key);
                selected.push(chunk);
            });
        });

    return selected;
};

const mergeUniqueChunks = (...chunkLists) => {
    const merged = [];
    const seen = new Set();

    chunkLists.flat().forEach((chunk) => {
        const key = toChunkId(chunk?._id);
        if (!chunk || seen.has(key)) {
            return;
        }
        seen.add(key);
        merged.push(chunk);
    });

    return merged;
};

const normalizeFlashcards = (raw = []) => {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((item) => item && item.question && item.answer)
        .map((item) => ({
            question: `${item.question}`.replace(/\s+/g, ' ').trim(),
            answer: `${item.answer}`.replace(/\s+/g, ' ').trim(),
            sourceExcerptIndex: Number.isFinite(Number(item.sourceExcerptIndex))
                ? Number(item.sourceExcerptIndex)
                : null
        }))
        .filter((item) => item.question.length > 8 && item.answer.length > 8);
};

const tokenize = (value = '') => `${value}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);

const jaccardSimilarity = (left = '', right = '') => {
    const leftTokens = new Set(tokenize(left));
    const rightTokens = new Set(tokenize(right));
    if (!leftTokens.size || !rightTokens.size) {
        return 0;
    }
    let overlap = 0;
    leftTokens.forEach((token) => {
        if (rightTokens.has(token)) {
            overlap += 1;
        }
    });
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union ? overlap / union : 0;
};

const dedupeSemantically = (items = []) => {
    const deduped = [];
    for (const candidate of items) {
        const duplicate = deduped.some((existing) => {
            const qSimilarity = jaccardSimilarity(existing.question, candidate.question);
            const aSimilarity = jaccardSimilarity(existing.answer, candidate.answer);
            return qSimilarity >= SEMANTIC_DUPLICATE_THRESHOLD || (qSimilarity >= 0.64 && aSimilarity >= 0.7);
        });
        if (!duplicate) {
            deduped.push(candidate);
        }
    }
    return deduped;
};

const inferConceptKey = (card, concepts = []) => {
    const text = `${card.question} ${card.answer}`.toLowerCase();
    const match = concepts.find((concept) => text.includes((concept.name || '').toLowerCase()));
    return match ? match.name.toLowerCase() : 'misc';
};

const enforceConceptCoverage = (cards = [], concepts = [], requestedCount = 10) => {
    if (cards.length <= requestedCount) {
        return cards;
    }

    const buckets = new Map();
    cards.forEach((card) => {
        const key = inferConceptKey(card, concepts);
        const list = buckets.get(key) || [];
        list.push(card);
        buckets.set(key, list);
    });

    const orderedBuckets = [...buckets.values()].sort((a, b) => b.length - a.length);
    const selected = [];
    let round = 0;
    while (selected.length < requestedCount) {
        let added = false;
        for (const bucket of orderedBuckets) {
            if (bucket[round]) {
                selected.push(bucket[round]);
                added = true;
                if (selected.length >= requestedCount) {
                    break;
                }
            }
        }
        if (!added) {
            break;
        }
        round += 1;
    }

    return selected.slice(0, requestedCount);
};

const scoreCardSupport = (card, chunks = []) => {
    const combined = `${card.question} ${card.answer}`;
    const excerptIndex = Number(card.sourceExcerptIndex);
    const preferredChunk = Number.isInteger(excerptIndex) && excerptIndex >= 1 && excerptIndex <= chunks.length
        ? chunks[excerptIndex - 1]
        : null;
    const sourcePool = preferredChunk ? [preferredChunk] : chunks;

    return sourcePool.reduce((best, chunk) => {
        const score = lexicalScore(combined, `${chunk.summary || ''} ${chunk.content || ''}`);
        return Math.max(best, score);
    }, 0);
};

const filterGroundedCards = (cards = [], chunks = []) => cards.filter((card) => scoreCardSupport(card, chunks) >= 0.24);

const buildPrompt = ({
    requestedCount,
    sourceDocuments,
    sampledChunks,
    concepts,
    existingQuestions
}) => `Create ${requestedCount} high-quality study flashcards from these uploaded materials.
Documents:
${sourceDocuments.map((document) => `- ${document.title || document.originalName}`).join('\n')}

Concept coverage targets:
${concepts.length ? concepts.map((concept) => `- ${concept.name}: ${`${concept.description || ''}`.replace(/\s+/g, ' ').trim().slice(0, 80)}`).join('\n') : '- Cover different sections and key definitions'}

Rules:
- Every flashcard must be grounded in the excerpts below.
- Only create a flashcard when the answer can be directly supported by the excerpts below.
- Cover varied concepts (definitions, methods, distinctions, proof ideas).
- Avoid semantic duplicates.
- No outside knowledge.
- Ignore dedications, publisher pages, blank pages, and author bio material.
- Keep answers concise but technically meaningful.
- Prefer exact textbook meaning over guessed paraphrases.
- Prefer one concept or distinction per card instead of broad vague questions.
- Make the question stand alone by naming the concept or method directly.
- If the excerpt is weak, skip it instead of guessing.
- Focus on named concepts, methods, definitions, and distinctions instead of isolated formulas or notation fragments.
- Ignore excerpts that are mostly symbols, isolated equations, or fragmented OCR-like text.
${existingQuestions.length ? `- Do not repeat these questions:\n${existingQuestions.map((q) => `  * ${q}`).join('\n')}` : ''}

Return JSON array only with objects:
{ "question": "...", "answer": "...", "sourceExcerptIndex": 1 }

Excerpts:
${sampledChunks.map((chunk, index) => `Excerpt ${index + 1}
Document: ${chunk.documentTitle}
Section: ${chunk.sectionTitle || 'Untitled Section'}
${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 140)}`).join('\n\n')}`;

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

    const requestedCount = Math.min(
        20,
        Math.max(5, Number(req.query.count) || Number(body.count) || 10)
    );
    const candidateChunks = await loadPromptChunkCandidates(sourceDocuments, {
        sampleLimitPerDocument: Math.min(18, Math.max(10, requestedCount + 4))
    });
    const concepts = filterStudyWorthConcepts(await conceptRepository.listByDocuments(sourceDocumentIds))
        .filter((concept) => !Array.isArray(concept.chunkRefs) || concept.chunkRefs.length > 0);
    const conceptChunkIds = [...new Set(
        concepts
            .filter((concept) => Array.isArray(concept.chunkRefs) && concept.chunkRefs.length)
            .slice(0, Math.max(requestedCount * 2, 10))
            .flatMap((concept) => concept.chunkRefs.slice(0, 2).map((chunkId) => toChunkId(chunkId)))
    )].slice(0, 28);
    const conceptChunks = conceptChunkIds.length
        ? (await chunkRepository.listByIds(conceptChunkIds)).map((chunk) => ({
            ...chunk.toObject(),
            documentTitle: sourceDocuments.find((document) => document._id.toString() === chunk.document.toString())?.title
                || sourceDocuments.find((document) => document._id.toString() === chunk.document.toString())?.originalName
                || 'Uploaded Document'
        }))
        : [];
    const chunkMap = new Map(mergeUniqueChunks(candidateChunks, conceptChunks).map((chunk) => [toChunkId(chunk._id), chunk]));
    const conceptAnchoredChunks = buildConceptAnchoredChunkSet(concepts, chunkMap, requestedCount);
    const sampledChunks = selectPromptExcerpts({
        candidates: candidateChunks,
        preferredChunks: mergeUniqueChunks(conceptAnchoredChunks, conceptChunks),
        maxChunks: Math.min(8, Math.max(6, requestedCount)),
        maxPerSection: 2,
        maxPerDocument: Math.min(4, Math.max(3, Math.ceil(requestedCount / 2)))
    });

    if (!sampledChunks.length) {
        throw new AppError('Flashcards cannot be generated because document content is unavailable', 400, 'FLASHCARD_SOURCE_EMPTY');
    }

    let collected = [];
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_FLASHCARD_ATTEMPTS; attempt += 1) {
        try {
            const payload = await generateJson(
                buildPrompt({
                    requestedCount,
                    sourceDocuments,
                    sampledChunks,
                    concepts: concepts.slice(0, 10),
                    existingQuestions: collected.map((item) => item.question).slice(0, 20)
                }),
                { maxTokens: Math.min(1600, 260 + requestedCount * 120) }
            );
            const normalized = normalizeFlashcards(payload);
            const grounded = filterGroundedCards(normalized, sampledChunks);
            collected = dedupeSemantically([...collected, ...grounded]).slice(0, requestedCount * 2);
            if (collected.length >= requestedCount) {
                break;
            }
        } catch (error) {
            lastError = error;
        }
    }

    if (!collected.length) {
        throw new AppError('Flashcard generation failed', 502, 'FLASHCARD_GENERATION_FAILED', {
            requested: requestedCount,
            generated: 0,
            reason: lastError?.message || 'No flashcards returned'
        });
    }

    let finalCards = enforceConceptCoverage(dedupeSemantically(collected), concepts, requestedCount);
    finalCards = dedupeSemantically(finalCards).slice(0, requestedCount);
    const minimumRequired = Math.min(requestedCount, Math.max(5, Math.ceil(requestedCount * 0.6)));
    if (finalCards.length < minimumRequired) {
        throw new AppError('Flashcard generation did not meet diversity requirements', 502, 'FLASHCARD_LOW_QUALITY_OUTPUT', {
            requested: requestedCount,
            generated: finalCards.length
        });
    }

    finalCards = filterGroundedCards(finalCards, sampledChunks);

    const baselineCards = shouldRegenerate ? [] : existingFlashcards;
    const existingQuestionSet = new Set(baselineCards.map((card) => card.question.trim().toLowerCase()));
    const newItems = finalCards.filter((item) => {
        const key = item.question.toLowerCase();
        if (!key || existingQuestionSet.has(key)) {
            return false;
        }
        existingQuestionSet.add(key);
        return true;
    });

    if (!newItems.length && !baselineCards.length) {
        throw new AppError('Flashcard generation produced only duplicate or low-quality items', 502, 'FLASHCARD_LOW_QUALITY_OUTPUT', {
            requested: requestedCount,
            generated: 0
        });
    }

    const flashcards = await Promise.all(
        newItems.map(async (flashcard) => {
            const preferredChunk = Number.isInteger(flashcard.sourceExcerptIndex)
                && flashcard.sourceExcerptIndex >= 1
                && flashcard.sourceExcerptIndex <= sampledChunks.length
                ? sampledChunks[flashcard.sourceExcerptIndex - 1]
                : null;

            return Flashcard.create({
                document: anchorDocument._id,
                user: req.user._id,
                sourceDocuments: sourceDocumentIds,
                question: flashcard.question,
                answer: flashcard.answer,
                citations: selectCitations(`${flashcard.question} ${flashcard.answer}`, sampledChunks, preferredChunk)
            });
        })
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

    res.json(flashcards.length ? flashcards : baselineCards);
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
