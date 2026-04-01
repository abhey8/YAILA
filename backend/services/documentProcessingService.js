import Document from '../models/Document.js';
import { logger } from '../lib/logger.js';
import { ingestDocument } from './documentIngestionService.js';
import { generateRoadmap } from './roadmapService.js';
import { documentQueueService } from './documentQueueService.js';

const activeIngestions = new Set();

const processDocument = async (documentId, source) => {
    if (activeIngestions.has(documentId.toString())) {
        return;
    }

    activeIngestions.add(documentId.toString());

    try {
        const document = await Document.findById(documentId);
        if (!document) {
            return;
        }

        if (!['pending', 'processing'].includes(document.ingestionStatus)) {
            return;
        }

        await ingestDocument(document);
        try {
            await generateRoadmap(document.user, document._id, `${source}-document-ingestion`);
        } catch (roadmapError) {
            logger.warn('Roadmap generation skipped after document ingestion', {
                documentId: documentId.toString(),
                error: roadmapError.message,
                source
            });
        }
    } catch (error) {
        logger.error('Document ingestion failed', {
            documentId: documentId.toString(),
            error: error.message,
            source
        });
    } finally {
        activeIngestions.delete(documentId.toString());
    }
};

export const scheduleDocumentIngestion = (documentId, source = 'upload') => {
    setImmediate(() => {
        processDocument(documentId, source);
    });
};

export const resumeIncompleteIngestion = async () => {
    const documents = await Document.find({
        ingestionStatus: { $in: ['queued', 'pending', 'extracting', 'processing', 'embedding_partial'] }
    }).select('_id');

    documents.forEach((document) => {
        documentQueueService.enqueueDocument(document._id);
    });
};
