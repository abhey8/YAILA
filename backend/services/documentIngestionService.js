import crypto from 'crypto';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { buildChunks } from './chunkingService.js';
import { embedTexts, generateJson } from './aiService.js';
import { rebuildKnowledgeGraph } from './knowledgeGraphService.js';
import { createNotification } from './notificationService.js';
import { trackActivity } from './activityService.js';
import { logger } from '../lib/logger.js';

const EMBEDDING_BATCH_SIZE = 12;
const CHUNK_SUMMARY_BATCH_SIZE = Math.min(8, Math.max(3, Number(process.env.CHUNK_SUMMARY_BATCH_SIZE) || 6));
const CHUNK_SUMMARY_MAX_TOKENS = Math.min(120, Math.max(40, Number(process.env.CHUNK_SUMMARY_MAX_TOKENS) || 80));

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
- summary: concise semantic summary preserving technical meaning (max ${CHUNK_SUMMARY_MAX_TOKENS} tokens)
- keywords: 3 to 8 meaningful study keywords

Rules:
- Keep formulas, definitions, and logical relations intact.
- Do not copy long spans verbatim.
- Do not use generic filler.
- Keep each summary grounded in its own chunk only.

Input Chunks:
${chunks.map((chunk, index) => `Chunk ${index + 1}
Section: ${chunk.sectionTitle || 'Untitled Section'}
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
        logger.warn('[Ingestion] Semantic summary response was not an array, using extractive fallback', {
            documentTitle
        });
        return chunks.map((chunk) => buildDeterministicChunkSummary(chunk));
    }

    if (raw.length !== chunks.length) {
        logger.warn('[Ingestion] Semantic summary item count mismatch', {
            expected: chunks.length,
            received: raw.length
        });
    }

    return chunks.map((chunk, index) => {
        const content = chunk?.content || '';
        const item = raw[index] || {};
        let summary = `${item?.summary || ''}`.replace(/\s+/g, ' ').trim();
        if (!summary) {
            summary = buildDeterministicChunkSummary(chunk).summary;
        }
        return {
            summary,
            keywords: sanitizeKeywords(item?.keywords, content)
        };
    });
};

const hashContent = (value) => crypto.createHash('sha1').update(value).digest('hex');

const updateProgress = async (document, patch) => {
    document.ingestionProgress = {
        ...(document.ingestionProgress || {}),
        ...patch
    };
    await documentRepository.save(document);
};

export const ingestDocument = async (document) => {
    document.ingestionStatus = 'processing';
    document.ingestionError = null;
    document.ingestionProgress = {
        stage: 'chunking',
        progressPercent: 5,
        totalChunks: 0,
        processedChunks: 0,
        embeddedChunks: 0,
        startedAt: new Date(),
        completedAt: null
    };
    await documentRepository.save(document);

    try {
        const chunkDrafts = buildChunks(document.textContent || '');
        await updateProgress(document, {
            stage: 'embedding',
            totalChunks: chunkDrafts.length,
            progressPercent: chunkDrafts.length ? 10 : 100
        });

        await chunkRepository.deleteByDocument(document._id);

        const embeddedCache = new Map();
        const cachedChunkMeta = new Map();
        let processedChunks = 0;
        let embeddedChunks = 0;
        let insertedCount = 0;

        for (let start = 0; start < chunkDrafts.length; start += EMBEDDING_BATCH_SIZE) {
            const batch = chunkDrafts.slice(start, start + EMBEDDING_BATCH_SIZE);
            const missingEmbeddings = [];
            const embeddingKeys = [];

            // Find existing embeddings from database first to avoid API quota
            const hashesToFind = batch.map(c => hashContent(c.content)).filter(h => !embeddedCache.has(h));
            if (hashesToFind.length > 0) {
                const existingChunks = await chunkRepository.findByHashes(hashesToFind);
                existingChunks.forEach(chunk => {
                    if (chunk.embedding && chunk.embedding.length > 0) {
                        embeddedCache.set(chunk.contentHash, chunk.embedding);
                    }
                    if (chunk.summary) {
                        cachedChunkMeta.set(chunk.contentHash, {
                            summary: chunk.summary,
                            keywords: sanitizeKeywords(chunk.keywords, chunk.content)
                        });
                    }
                });
            }

            batch.forEach((chunk) => {
                const contentHash = hashContent(chunk.content);
                if (!embeddedCache.has(contentHash)) {
                    missingEmbeddings.push(chunk.content);
                    embeddingKeys.push(contentHash);
                }
            });

            if (missingEmbeddings.length) {
                try {
                    const embeddings = await embedTexts(missingEmbeddings);
                    embeddings.forEach((embedding, index) => {
                        embeddedCache.set(embeddingKeys[index], embedding || []);
                    });
                } catch (embeddingError) {
                    throw new Error(`Embedding generation failed: ${embeddingError.message}`);
                }
            }

            const missingSummaryChunks = [];
            batch.forEach((chunk) => {
                const contentHash = hashContent(chunk.content);
                if (!cachedChunkMeta.has(contentHash)) {
                    missingSummaryChunks.push({
                        contentHash,
                        content: chunk.content,
                        sectionTitle: chunk.sectionTitle
                    });
                }
            });

            if (missingSummaryChunks.length) {
                for (let i = 0; i < missingSummaryChunks.length; i += CHUNK_SUMMARY_BATCH_SIZE) {
                    const summaryBatch = missingSummaryChunks.slice(i, i + CHUNK_SUMMARY_BATCH_SIZE);
                    const semanticSummaries = await summarizeChunksSemantically({
                        documentTitle: document.title || document.originalName,
                        chunks: summaryBatch
                    });
                    semanticSummaries.forEach((summaryEntry, index) => {
                        const source = summaryBatch[index];
                        cachedChunkMeta.set(source.contentHash, summaryEntry);
                    });
                }
            }

            const savedChunks = await chunkRepository.createMany(batch.map((chunk, index) => {
                const contentHash = hashContent(chunk.content);
                const embedding = embeddedCache.get(contentHash) || [];
                const semanticSummary = cachedChunkMeta.get(contentHash);
                if (!semanticSummary?.summary) {
                    throw new Error(`Missing semantic summary for chunk hash ${contentHash}`);
                }
                if (embedding.length) {
                    embeddedChunks += 1;
                }

                return {
                    ...chunk,
                    document: document._id,
                    user: document.user,
                    chunkIndex: start + index,
                    contentHash,
                    embedding,
                    summary: semanticSummary.summary,
                    keywords: semanticSummary.keywords
                };
            }));

            insertedCount += savedChunks.length;
            processedChunks += batch.length;

            await updateProgress(document, {
                stage: start + EMBEDDING_BATCH_SIZE >= chunkDrafts.length ? 'indexing' : 'embedding',
                processedChunks,
                embeddedChunks,
                progressPercent: Math.min(95, Math.round((processedChunks / Math.max(chunkDrafts.length, 1)) * 85) + 10)
            });
        }

        document.chunkCount = insertedCount;
        document.ingestionStatus = 'completed';
        document.ingestionProgress = {
            ...(document.ingestionProgress || {}),
            stage: 'completed',
            progressPercent: 100,
            processedChunks,
            embeddedChunks,
            completedAt: new Date()
        };
        await documentRepository.save(document);

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
                pageCount: document.metadata?.pageCount || 0
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

        return insertedCount;
    } catch (error) {
        document.ingestionStatus = 'failed';
        document.ingestionError = error.message;
        document.ingestionProgress = {
            ...(document.ingestionProgress || {}),
            stage: 'failed',
            completedAt: new Date()
        };
        await documentRepository.save(document);

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

        throw error;
    }
};
