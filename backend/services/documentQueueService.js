import { env } from '../config/env.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { ingestDocument } from './documentIngestionService.js';
import { logger } from '../lib/logger.js';
import { generateRoadmap } from './roadmapService.js';

class DocumentProcessingQueue {
    constructor(maxConcurrent = env.ingestionWorkerConcurrency || 2) {
        this.queue = [];
        this.activeCount = 0;
        this.maxConcurrent = maxConcurrent;
    }

    enqueueDocument(documentId) {
        this.queue.push(documentId);
        logger.info(`[DocumentQueue] Enqueued document ID: ${documentId}. Queue size: ${this.queue.length}`);
        this.processNext();
    }

    async processNext() {
        if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }

        const documentId = this.queue.shift();
        this.activeCount++;

        try {
            await this.processDocument(documentId);
        } catch (error) {
            logger.error(`[DocumentQueue] Failed to process document ${documentId}: ${error.message}`);
        } finally {
            this.activeCount--;
            this.processNext();
        }
    }

    async processDocument(documentId) {
        const document = await documentRepository.findById(documentId);
        if (!document) return;

        try {
            await ingestDocument(document);
            try {
                await generateRoadmap(document.user, document._id, 'background-worker-ingestion');
            } catch (roadmapError) {
                logger.warn('[DocumentQueue] Roadmap generation skipped after successful ingestion', {
                    documentId: document._id.toString(),
                    error: roadmapError.message
                });
            }

        } catch (error) {
            document.ingestionStatus = 'failed';
            document.ingestionError = `Extraction/processing failed: ${error.message}`;
            await documentRepository.save(document);
            throw error;
        }
    }
}

export const documentQueueService = new DocumentProcessingQueue();
