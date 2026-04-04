import crypto from 'crypto';
import fs from 'fs/promises';
import { env } from '../config/env.js';
import { normalizeWhitespace } from '../lib/text.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { documentIngestionCheckpointRepository } from '../repositories/documentIngestionCheckpointRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { buildChunksFromPages, createChunkSession } from './chunkingService.js';
import { embedTexts, generateJson } from './aiService.js';
import { rebuildKnowledgeGraph } from './knowledgeGraphService.js';
import { createNotification } from './notificationService.js';
import { trackActivity } from './activityService.js';
import { logger } from '../lib/logger.js';
import { extractTextFromImage } from './ocrService.js';
import { extractPdfPage, getPdfPageCount, openPdfDocument } from '../utils/pdfParser.js';
import { getVectorStore } from './vectorStores/vectorStoreFactory.js';
import { scheduleDocumentSummary } from './summaryService.js';

const PARSER_VERSION = 'v3-stream';
const REPEATED_LINE_THRESHOLD = 3;
const MAX_FREQUENCY_ENTRIES = 32;

const extractKeywords = (content) => {
    const tokens = content.toLowerCase().match(/[a-z]{4,}/g) || [];
    const frequency = new Map();

    tokens.forEach((token) => {
        frequency.set(token, (frequency.get(token) || 0) + 1);
    });

    return [...frequency.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([token]) => token);
};

const sanitizeKeywords = (keywords, content = '') => {
    if (Array.isArray(keywords) && keywords.length) {
        return keywords
            .map((keyword) => `${keyword}`.trim().toLowerCase())
            .filter((keyword) => keyword.length >= 3)
            .slice(0, 8);
    }
    return extractKeywords(content);
};

const buildChunkSummaryPrompt = ({ documentTitle, chunks }) => `You are creating semantic study summaries for document chunks.
Document: ${documentTitle || 'Uploaded Document'}

Return a JSON array with exactly ${chunks.length} objects in the same order as input chunks.
Each object must contain:
- summary: concise semantic summary preserving technical meaning (max ${env.chunkSummaryMaxTokens} tokens)
- keywords: 3 to 8 meaningful study keywords

Rules:
- Keep formulas, definitions, and logical relations intact.
- Do not copy long spans verbatim.
- Do not use generic filler.
- Keep each summary grounded in its own chunk only.

Input Chunks:
${chunks.map((chunk, index) => `Chunk ${index + 1}
Section: ${chunk.sectionTitle || 'Untitled Section'}
Pages: ${chunk.pageStart || 1}-${chunk.pageEnd || chunk.pageStart || 1}
Text:
${chunk.content}`).join('\n\n')}`;

const buildDeterministicChunkSummary = (chunk) => {
    const content = `${chunk?.content || ''}`.replace(/\s+/g, ' ').trim();
    const sectionLabel = `${chunk?.sectionTitle || ''}`.trim();
    const sentences = content
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 24);
    const summaryBody = sentences.slice(0, 2).join(' ').trim() || content.slice(0, 260);
    const summary = sectionLabel && !summaryBody.toLowerCase().includes(sectionLabel.toLowerCase())
        ? `${sectionLabel}: ${summaryBody}`
        : summaryBody;

    return {
        summary: summary.slice(0, 320).trim(),
        keywords: sanitizeKeywords([], content)
    };
};

const summarizeChunksSemantically = async ({ documentTitle, chunks }) => {
    if (!chunks.length) {
        return [];
    }

    if (!env.aiChunkSummariesEnabled) {
        return chunks.map((chunk) => buildDeterministicChunkSummary(chunk));
    }

    let raw = [];
    try {
        raw = await generateJson(
            buildChunkSummaryPrompt({ documentTitle, chunks }),
            { maxTokens: Math.min(2800, 400 + chunks.length * 320) }
        );
    } catch (error) {
        logger.warn('[Ingestion] Semantic chunk summary generation fell back to extractive mode', {
            documentTitle,
            reason: error.message
        });
        return chunks.map((chunk) => buildDeterministicChunkSummary(chunk));
    }

    if (!Array.isArray(raw)) {
        return chunks.map((chunk) => buildDeterministicChunkSummary(chunk));
    }

    return chunks.map((chunk, index) => {
        const item = raw[index] || {};
        const summary = `${item?.summary || ''}`.replace(/\s+/g, ' ').trim() || buildDeterministicChunkSummary(chunk).summary;
        return {
            summary,
            keywords: sanitizeKeywords(item?.keywords, chunk.content)
        };
    });
};

const hashContent = (value) => crypto.createHash('sha1').update(value).digest('hex');

const now = () => Date.now();

const toFrequencyMap = (entries = []) => new Map(
    entries
        .filter((entry) => entry?.value)
        .map((entry) => [entry.value, Number(entry.count || 0)])
);

const toFrequencyEntries = (map) => [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_FREQUENCY_ENTRIES)
    .map(([value, count]) => ({ value, count }));

const normalizeLine = (line = '') => normalizeWhitespace(`${line}`.replace(/\bpage\s+\d+\b/gi, '').replace(/\b\d+\b/g, ' ').trim())
    .slice(0, 160);

const updateFrequency = (map, value) => {
    if (!value || value.length < 4) {
        return;
    }
    map.set(value, (map.get(value) || 0) + 1);
};

const looksRepeated = (map, value) => value && (map.get(value) || 0) >= REPEATED_LINE_THRESHOLD;

const buildSourceChecksum = async (document) => {
    const stats = await fs.stat(document.path);
    return hashContent(`${document.filename}:${stats.size}:${stats.mtimeMs}`);
};

const computeProgressPercent = ({ processedPages, totalPages, indexedChunks, processedChunks }) => {
    const pageProgress = totalPages > 0 ? processedPages / totalPages : 0;
    const chunkRatio = processedChunks > 0 ? indexedChunks / processedChunks : 0;
    return Math.min(99, Math.max(1, Math.round(pageProgress * 75 + chunkRatio * 20 + 5)));
};

const updateDocumentProgress = async (document, patch = {}) => {
    document.ingestionProgress = {
        ...(document.ingestionProgress || {}),
        ...patch
    };
    await documentRepository.save(document);
};

const clearExistingIndexes = async (document, vectorStore) => {
    await Promise.all([
        chunkRepository.deleteByDocument(document._id),
        vectorStore.deleteDocumentVectors({ documentId: document._id, userId: document.user })
    ]);
};

const hydratePreview = (previewText, pageText) => {
    if (previewText.length >= env.ingestionPreviewChars || !pageText) {
        return previewText;
    }

    const remaining = env.ingestionPreviewChars - previewText.length;
    const next = previewText
        ? `${previewText}\n\n${pageText.slice(0, remaining)}`
        : pageText.slice(0, remaining);

    return next.slice(0, env.ingestionPreviewChars);
};

const preparePage = ({
    page,
    headerFrequencies,
    footerFrequencies,
    recentPageHashes,
    metrics
}) => {
    const lines = Array.isArray(page.lines) ? [...page.lines] : [];
    const firstLine = normalizeLine(lines[0] || '');
    const lastLine = normalizeLine(lines[lines.length - 1] || '');

    const filteredParagraphs = (page.paragraphs || [])
        .map((paragraph) => normalizeWhitespace(paragraph))
        .filter(Boolean)
        .filter((paragraph, index, all) => {
            const normalized = normalizeLine(paragraph);
            if (!normalized) {
                return false;
            }
            if (looksRepeated(headerFrequencies, normalized) && index === 0) {
                return false;
            }
            if (looksRepeated(footerFrequencies, normalized) && index === all.length - 1) {
                return false;
            }
            return true;
        });

    updateFrequency(headerFrequencies, firstLine);
    updateFrequency(footerFrequencies, lastLine);

    const text = filteredParagraphs.join('\n\n').trim();
    if (!text || text.length < 24) {
        metrics.skippedPages += 1;
        return null;
    }

    const pageHash = hashContent(text);
    if (env.ingestionDedupRepeatedPages && recentPageHashes.includes(pageHash)) {
        metrics.deduplicatedPages += 1;
        return null;
    }

    recentPageHashes.push(pageHash);
    if (recentPageHashes.length > 8) {
        recentPageHashes.shift();
    }

    return {
        pageNumber: page.pageNumber,
        text,
        paragraphs: filteredParagraphs,
        lines
    };
};

const loadCheckpointState = (checkpoint) => ({
    checkpoint,
    nextPage: Math.max(1, Number(checkpoint?.nextPage || 1)),
    nextChunkIndex: Number(checkpoint?.nextChunkIndex || 0),
    charCursor: Number(checkpoint?.charCursor || 0),
    currentSectionTitle: checkpoint?.currentSectionTitle || 'Introduction',
    semanticGroup: Number(checkpoint?.semanticGroup || 0),
    pendingParagraphs: Array.isArray(checkpoint?.pendingParagraphs) ? checkpoint.pendingParagraphs : [],
    previewText: `${checkpoint?.previewText || ''}`,
    metrics: {
        processedPages: Number(checkpoint?.metrics?.processedPages || 0),
        skippedPages: Number(checkpoint?.metrics?.skippedPages || 0),
        deduplicatedPages: Number(checkpoint?.metrics?.deduplicatedPages || 0),
        processedChunks: Number(checkpoint?.metrics?.processedChunks || 0),
        embeddedChunks: Number(checkpoint?.metrics?.embeddedChunks || 0),
        indexedChunks: Number(checkpoint?.metrics?.indexedChunks || 0)
    },
    timings: {
        parseMs: Number(checkpoint?.timings?.parseMs || 0),
        chunkMs: Number(checkpoint?.timings?.chunkMs || 0),
        embedMs: Number(checkpoint?.timings?.embedMs || 0),
        indexMs: Number(checkpoint?.timings?.indexMs || 0)
    },
    headerFrequencies: toFrequencyMap(checkpoint?.headerLineFrequencies || []),
    footerFrequencies: toFrequencyMap(checkpoint?.footerLineFrequencies || [])
});

const persistCheckpoint = async (document, state, extra = {}) => {
    if (!env.ingestionCheckpointEnabled) {
        return null;
    }

    return documentIngestionCheckpointRepository.createOrUpdate(document._id, document.user, {
        status: 'running',
        parserVersion: PARSER_VERSION,
        totalPages: document.metadata?.pageCount || document.ingestionProgress?.totalPages || 0,
        nextPage: state.nextPage,
        nextChunkIndex: state.nextChunkIndex,
        charCursor: state.charCursor,
        currentSectionTitle: state.currentSectionTitle,
        semanticGroup: state.semanticGroup,
        pendingParagraphs: state.pendingParagraphs || [],
        previewText: state.previewText || '',
        metrics: state.metrics,
        timings: state.timings,
        headerLineFrequencies: toFrequencyEntries(state.headerFrequencies),
        footerLineFrequencies: toFrequencyEntries(state.footerFrequencies),
        ...extra
    });
};

const flushChunkBatch = async ({
    document,
    chunkDrafts,
    caches,
    metrics,
    timings,
    vectorStore
}) => {
    if (!chunkDrafts.length) {
        return [];
    }

    const startedEmbeddingAt = now();
    const contentHashesToLookup = [...new Set(
        chunkDrafts
            .map((chunk) => hashContent(chunk.content))
            .filter((contentHash) => !caches.embeddings.has(contentHash) || !caches.chunkMeta.has(contentHash))
    )];

    if (contentHashesToLookup.length) {
        const existingChunks = await chunkRepository.findByHashes(contentHashesToLookup);
        existingChunks.forEach((chunk) => {
            if (Array.isArray(chunk.embedding) && chunk.embedding.length) {
                caches.embeddings.set(chunk.contentHash, chunk.embedding);
            }
            if (chunk.summary) {
                caches.chunkMeta.set(chunk.contentHash, {
                    summary: chunk.summary,
                    keywords: sanitizeKeywords(chunk.keywords, chunk.content)
                });
            }
        });
    }

    const missingEmbeddingInputs = [];
    const missingEmbeddingKeys = [];

    chunkDrafts.forEach((chunk) => {
        const contentHash = hashContent(chunk.content);
        if (!caches.embeddings.has(contentHash)) {
            missingEmbeddingInputs.push(chunk.content);
            missingEmbeddingKeys.push(contentHash);
        }
    });

    for (let start = 0; start < missingEmbeddingInputs.length; start += env.embeddingBatchSize) {
        const batchInputs = missingEmbeddingInputs.slice(start, start + env.embeddingBatchSize);
        const batchKeys = missingEmbeddingKeys.slice(start, start + env.embeddingBatchSize);
        const embeddings = await embedTexts(batchInputs);
        embeddings.forEach((embedding, index) => {
            caches.embeddings.set(batchKeys[index], embedding || []);
        });
    }

    timings.embedMs += now() - startedEmbeddingAt;

    const missingSummaryDrafts = chunkDrafts.filter((chunk) => {
        const contentHash = hashContent(chunk.content);
        return !caches.chunkMeta.has(contentHash);
    });

    if (missingSummaryDrafts.length) {
        for (let start = 0; start < missingSummaryDrafts.length; start += env.chunkSummaryBatchSize) {
            const summaryBatch = missingSummaryDrafts.slice(start, start + env.chunkSummaryBatchSize);
            const summaries = await summarizeChunksSemantically({
                documentTitle: document.title || document.originalName,
                chunks: summaryBatch
            });
            summaries.forEach((entry, index) => {
                const source = summaryBatch[index];
                caches.chunkMeta.set(hashContent(source.content), entry);
            });
        }
    }

    const records = chunkDrafts.map((chunk) => {
        const contentHash = hashContent(chunk.content);
        const embedding = caches.embeddings.get(contentHash) || [];
        const semanticSummary = caches.chunkMeta.get(contentHash) || buildDeterministicChunkSummary(chunk);

        return {
            ...chunk,
            document: document._id,
            user: document.user,
            vectorId: `${document._id}:${chunk.chunkIndex}`,
            contentHash,
            sourceName: document.originalName || document.title,
            embedding: env.persistChunkEmbeddings ? embedding : [],
            summary: semanticSummary.summary,
            keywords: semanticSummary.keywords,
            vectorIndexedAt: embedding.length ? new Date() : null
        };
    });

    const startedWriteAt = now();
    await chunkRepository.createMany(records);
    timings.indexMs += now() - startedWriteAt;

    const startedVectorAt = now();
    await vectorStore.upsertChunks(records.map((record) => ({
        ...record,
        embedding: caches.embeddings.get(record.contentHash) || record.embedding || []
    })));
    timings.indexMs += now() - startedVectorAt;

    metrics.processedChunks += records.length;
    metrics.embeddedChunks += records.filter((record) => Array.isArray(caches.embeddings.get(record.contentHash)) && caches.embeddings.get(record.contentHash).length).length;
    metrics.indexedChunks += records.length;

    return records;
};

const markFailed = async (document, error) => {
    document.ingestionStatus = 'failed';
    document.ingestionError = error.message;
    document.ingestionProgress = {
        ...(document.ingestionProgress || {}),
        stage: 'failed',
        completedAt: new Date()
    };
    await documentRepository.save(document);

    await documentIngestionCheckpointRepository.markFailed(document._id, error.message).catch(() => null);

    await trackActivity({
        userId: document.user,
        documentId: document._id,
        type: 'document-processing-failed',
        title: 'Document processing failed',
        description: `${document.title || document.originalName} could not be processed.`,
        metadata: {
            error: error.message
        }
    });

    await createNotification({
        userId: document.user,
        documentId: document._id,
        type: 'document-processing-failed',
        title: 'Document processing failed',
        message: `${document.title || document.originalName} could not be processed. Please retry the upload.`,
        metadata: {
            error: error.message
        }
    });
};

export const ingestDocument = async (document) => {
    const vectorStore = getVectorStore();
    const sourceChecksum = await buildSourceChecksum(document);
    const existingCheckpoint = env.ingestionCheckpointEnabled
        ? await documentIngestionCheckpointRepository.findByDocument(document._id)
        : null;

    const shouldResume = Boolean(
        existingCheckpoint
        && existingCheckpoint.status !== 'completed'
        && existingCheckpoint.sourceChecksum === sourceChecksum
        && existingCheckpoint.nextPage > 1
    );

    const state = loadCheckpointState(existingCheckpoint);
    const caches = {
        embeddings: new Map(),
        chunkMeta: new Map()
    };

    const startedAt = new Date();

    try {
        if (!shouldResume) {
            state.nextPage = 1;
            state.nextChunkIndex = 0;
            state.charCursor = 0;
            state.semanticGroup = 0;
            state.currentSectionTitle = 'Introduction';
            state.pendingParagraphs = [];
            state.previewText = '';
            state.metrics = {
                processedPages: 0,
                skippedPages: 0,
                deduplicatedPages: 0,
                processedChunks: 0,
                embeddedChunks: 0,
                indexedChunks: 0
            };
            state.timings = {
                parseMs: 0,
                chunkMs: 0,
                embedMs: 0,
                indexMs: 0
            };
            state.headerFrequencies = new Map();
            state.footerFrequencies = new Map();

            await clearExistingIndexes(document, vectorStore);
        }

        document.summary = '';
        document.summaryStatus = 'idle';
        document.summaryError = null;
        document.summaryUpdatedAt = null;
        document.ingestionStatus = 'processing';
        document.ingestionError = null;
        document.ingestionProgress = {
            ...(document.ingestionProgress || {}),
            stage: 'extracting',
            progressPercent: shouldResume ? document.ingestionProgress?.progressPercent || 5 : 1,
            totalPages: document.ingestionProgress?.totalPages || 0,
            processedPages: state.metrics.processedPages,
            currentPage: Math.max(0, state.nextPage - 1),
            totalChunks: state.metrics.processedChunks,
            processedChunks: state.metrics.processedChunks,
            embeddedChunks: state.metrics.embeddedChunks,
            indexedChunks: state.metrics.indexedChunks,
            resumeCount: shouldResume ? (document.ingestionProgress?.resumeCount || 0) + 1 : (document.ingestionProgress?.resumeCount || 0),
            startedAt,
            completedAt: null
        };
        await documentRepository.save(document);

        await persistCheckpoint(document, state, {
            sourceChecksum,
            status: 'running',
            lastError: null
        });

        const recentPageHashes = [];
        const chunkSession = createChunkSession({
            nextChunkIndex: state.nextChunkIndex,
            charCursor: state.charCursor,
            currentSectionTitle: state.currentSectionTitle,
            semanticGroup: state.semanticGroup,
            pendingParagraphs: state.pendingParagraphs
        });

        const flushAndPersist = async (chunkDrafts, nextPage) => {
            if (chunkDrafts.length) {
                const saved = await flushChunkBatch({
                    document,
                    chunkDrafts,
                    caches,
                    metrics: state.metrics,
                    timings: state.timings,
                    vectorStore
                });

                document.chunkCount = state.metrics.indexedChunks;
                document.ingestionProgress = {
                    ...(document.ingestionProgress || {}),
                    stage: 'indexing',
                    totalChunks: state.metrics.processedChunks,
                    processedChunks: state.metrics.processedChunks,
                    embeddedChunks: state.metrics.embeddedChunks,
                    indexedChunks: state.metrics.indexedChunks,
                    processedPages: state.metrics.processedPages,
                    currentPage: Math.max(0, nextPage - 1),
                    progressPercent: computeProgressPercent({
                        processedPages: state.metrics.processedPages,
                        totalPages: document.metadata?.pageCount || document.ingestionProgress?.totalPages || 0,
                        indexedChunks: state.metrics.indexedChunks,
                        processedChunks: state.metrics.processedChunks
                    })
                };
                await documentRepository.save(document);

                if (!saved.length) {
                    return;
                }
            }

            const sessionState = chunkSession.exportState();
            state.nextChunkIndex = sessionState.nextChunkIndex;
            state.charCursor = sessionState.charCursor;
            state.currentSectionTitle = sessionState.currentSectionTitle;
            state.semanticGroup = sessionState.semanticGroup;
            state.pendingParagraphs = sessionState.pendingParagraphs;
            state.nextPage = nextPage;

            await persistCheckpoint(document, state, {
                sourceChecksum
            });
        };

        if (document.metadata?.sourceType === 'image') {
            const startedOcrAt = now();
            const extractedText = await extractTextFromImage(document.path);
            state.timings.parseMs += now() - startedOcrAt;

            const text = normalizeWhitespace(extractedText);
            const previewText = hydratePreview(state.previewText, text);
            state.previewText = previewText;
            document.textContent = previewText;
            document.metadata = {
                ...(document.metadata || {}),
                pageCount: 1,
                textPreviewChars: previewText.length,
                deduplicatedPages: 0,
                skippedPages: text ? 0 : 1
            };
            document.ingestionProgress.totalPages = 1;
            document.ingestionProgress.stage = 'chunking';
            await documentRepository.save(document);

            const startedChunkAt = now();
            const chunks = buildChunksFromPages([{
                pageNumber: 1,
                paragraphs: text ? [text] : []
            }]);
            state.timings.chunkMs += now() - startedChunkAt;
            state.metrics.processedPages = text ? 1 : 0;

            await flushAndPersist(chunks, 2);
        } else {
            const totalPages = existingCheckpoint?.totalPages || await getPdfPageCount(document.path);
            document.metadata = {
                ...(document.metadata || {}),
                pageCount: totalPages
            };
            document.ingestionProgress.totalPages = totalPages;
            await documentRepository.save(document);

            const opened = await openPdfDocument(document.path);
            try {
                for (let startPage = state.nextPage; startPage <= totalPages; startPage += env.ingestionPageBatchSize) {
                    const endPage = Math.min(totalPages, startPage + env.ingestionPageBatchSize - 1);
                    const pageNumbers = [];
                    for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
                        pageNumbers.push(pageNumber);
                    }

                    const startedParseAt = now();
                    const rawPages = await Promise.all(pageNumbers.map((pageNumber) => extractPdfPage(opened.pdf, pageNumber)));
                    state.timings.parseMs += now() - startedParseAt;

                    const startedChunkAt = now();
                    const chunkDrafts = [];

                    rawPages
                        .sort((left, right) => left.pageNumber - right.pageNumber)
                        .forEach((page) => {
                            const preparedPage = preparePage({
                                page,
                                headerFrequencies: state.headerFrequencies,
                                footerFrequencies: state.footerFrequencies,
                                recentPageHashes,
                                metrics: state.metrics
                            });

                            if (!preparedPage) {
                                return;
                            }

                            state.metrics.processedPages += 1;
                            state.previewText = hydratePreview(state.previewText, preparedPage.text);
                            chunkDrafts.push(...chunkSession.ingestPage(preparedPage));
                        });

                    state.timings.chunkMs += now() - startedChunkAt;

                    document.textContent = state.previewText;
                    document.metadata = {
                        ...(document.metadata || {}),
                        pageCount: totalPages,
                        textPreviewChars: state.previewText.length,
                        deduplicatedPages: state.metrics.deduplicatedPages,
                        skippedPages: state.metrics.skippedPages,
                        repeatedHeaderLines: toFrequencyEntries(state.headerFrequencies)
                            .filter((entry) => entry.count >= REPEATED_LINE_THRESHOLD)
                            .map((entry) => entry.value),
                        repeatedFooterLines: toFrequencyEntries(state.footerFrequencies)
                            .filter((entry) => entry.count >= REPEATED_LINE_THRESHOLD)
                            .map((entry) => entry.value)
                    };
                    document.ingestionProgress = {
                        ...(document.ingestionProgress || {}),
                        stage: 'chunking',
                        processedPages: state.metrics.processedPages,
                        currentPage: endPage,
                        progressPercent: computeProgressPercent({
                            processedPages: state.metrics.processedPages,
                            totalPages,
                            indexedChunks: state.metrics.indexedChunks,
                            processedChunks: Math.max(state.metrics.processedChunks, chunkDrafts.length)
                        })
                    };
                    await documentRepository.save(document);

                    await flushAndPersist(chunkDrafts, endPage + 1);
                }
            } finally {
                await opened.close();
            }

            const trailingChunks = chunkSession.flush();
            await flushAndPersist(trailingChunks, totalPages + 1);
        }

        document.chunkCount = state.metrics.indexedChunks;
        document.ingestionStatus = 'completed';
        document.ingestionError = null;
        document.ingestionProgress = {
            ...(document.ingestionProgress || {}),
            stage: 'completed',
            progressPercent: 100,
            totalChunks: state.metrics.processedChunks,
            processedChunks: state.metrics.processedChunks,
            embeddedChunks: state.metrics.embeddedChunks,
            indexedChunks: state.metrics.indexedChunks,
            processedPages: state.metrics.processedPages,
            currentPage: document.metadata?.pageCount || document.ingestionProgress?.currentPage || 0,
            completedAt: new Date()
        };
        document.metadata = {
            ...(document.metadata || {}),
            textPreviewChars: state.previewText.length,
            deduplicatedPages: state.metrics.deduplicatedPages,
            skippedPages: state.metrics.skippedPages,
            repeatedHeaderLines: toFrequencyEntries(state.headerFrequencies)
                .filter((entry) => entry.count >= REPEATED_LINE_THRESHOLD)
                .map((entry) => entry.value),
            repeatedFooterLines: toFrequencyEntries(state.footerFrequencies)
                .filter((entry) => entry.count >= REPEATED_LINE_THRESHOLD)
                .map((entry) => entry.value)
        };
        document.textContent = state.previewText;
        await documentRepository.save(document);

        scheduleDocumentSummary(document._id);

        await documentIngestionCheckpointRepository.markCompleted(document._id, {
            sourceChecksum,
            parserVersion: PARSER_VERSION,
            nextPage: (document.metadata?.pageCount || 0) + 1,
            nextChunkIndex: state.nextChunkIndex,
            charCursor: state.charCursor,
            currentSectionTitle: state.currentSectionTitle,
            semanticGroup: state.semanticGroup,
            pendingParagraphs: [],
            previewText: state.previewText,
            metrics: state.metrics,
            timings: state.timings,
            headerLineFrequencies: toFrequencyEntries(state.headerFrequencies),
            footerLineFrequencies: toFrequencyEntries(state.footerFrequencies),
            lastError: null
        });

        try {
            await rebuildKnowledgeGraph(document);
        } catch (graphError) {
            logger.warn('[Ingestion] Knowledge graph generation skipped after successful ingestion', {
                documentId: document._id.toString(),
                reason: graphError.message
            });
        }

        await trackActivity({
            userId: document.user,
            documentId: document._id,
            type: 'document-processed',
            title: 'Document ready for study',
            description: `${document.title || document.originalName} finished processing.`,
            metadata: {
                chunkCount: document.chunkCount,
                pageCount: document.metadata?.pageCount || 0,
                timings: state.timings
            }
        });

        await createNotification({
            userId: document.user,
            documentId: document._id,
            type: 'document-processing-complete',
            title: 'Document processing complete',
            message: `${document.title || document.originalName} is ready for chat, quiz, and flashcards.`,
            metadata: {
                chunkCount: document.chunkCount
            }
        });

        logger.info('[Ingestion] Completed document ingestion', {
            documentId: document._id.toString(),
            chunks: document.chunkCount,
            pages: document.metadata?.pageCount || 0,
            metrics: state.metrics,
            timings: state.timings,
            resumed: shouldResume
        });

        return state.metrics.indexedChunks;
    } catch (error) {
        logger.error('[Ingestion] Document ingestion failed', {
            documentId: document._id.toString(),
            error: error.message
        });
        await markFailed(document, error);
        throw error;
    }
};
