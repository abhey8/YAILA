import fs from 'fs';
import { documentRepository } from '../repositories/documentRepository.js';
import { extractTextFromPDF } from '../utils/pdfParser.js';
import { extractTextFromImage } from './ocrService.js';
import { ingestDocument } from './documentIngestionService.js';
import { logger } from '../lib/logger.js';
import { generateRoadmap } from './roadmapService.js';

class DocumentProcessingQueue {
    constructor(maxConcurrent = 2) {
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
            document.ingestionStatus = 'extracting';
            await documentRepository.save(document);

            let extractedText = '';
            let pageCount = 0;

            if (document.metadata?.sourceType === 'image') {
                extractedText = await extractTextFromImage(document.path);
                pageCount = 1;
            } else {
                const pdfResult = await extractTextFromPDF(document.path);
                extractedText = pdfResult.text;
                pageCount = pdfResult.pageCount || 1;
            }

            document.textContent = extractedText;
            document.metadata.pageCount = pageCount;
            await documentRepository.save(document);

            // Trigger the chunking and embedding pipeline
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
