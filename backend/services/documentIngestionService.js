import crypto from 'crypto';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { buildChunks } from './chunkingService.js';
import { embedTexts } from './aiService.js';
import { rebuildKnowledgeGraph } from './knowledgeGraphService.js';
import { createNotification } from './notificationService.js';
import { trackActivity } from './activityService.js';

const EMBEDDING_BATCH_SIZE = 12;

const summarizeChunk = (content) => {
    const cleanContent = content.replace(/\s+/g, ' ').trim();
    return cleanContent.length > 180 ? `${cleanContent.slice(0, 177)}...` : cleanContent;
};

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
        let processedChunks = 0;
        let embeddedChunks = 0;
        let insertedCount = 0;

        for (let start = 0; start < chunkDrafts.length; start += EMBEDDING_BATCH_SIZE) {
            const batch = chunkDrafts.slice(start, start + EMBEDDING_BATCH_SIZE);
            const missingEmbeddings = [];
            const embeddingKeys = [];

            batch.forEach((chunk) => {
                const contentHash = hashContent(chunk.content);
                if (!embeddedCache.has(contentHash)) {
                    missingEmbeddings.push(chunk.content);
                    embeddingKeys.push(contentHash);
                }
            });

            if (missingEmbeddings.length) {
                const embeddings = await embedTexts(missingEmbeddings);
                embeddings.forEach((embedding, index) => {
                    embeddedCache.set(embeddingKeys[index], embedding || []);
                });
            }

            const savedChunks = await chunkRepository.createMany(batch.map((chunk, index) => {
                const contentHash = hashContent(chunk.content);
                const embedding = embeddedCache.get(contentHash) || [];
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
                    summary: summarizeChunk(chunk.content),
                    keywords: extractKeywords(chunk.content)
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
        await documentRepository.save(document);
        await rebuildKnowledgeGraph(document);

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
