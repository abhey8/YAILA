import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { logger } from '../lib/logger.js';
import { getKnowledgeGraph, rebuildKnowledgeGraph } from '../services/knowledgeGraphService.js';

const inFlightGraphGeneration = new Set();

export const getDocumentGraph = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const graph = await getKnowledgeGraph(document._id);
    if (!graph?.nodes?.length || graph.nodes.length < 3) {
        const key = document._id.toString();
        if (!inFlightGraphGeneration.has(key)) {
            inFlightGraphGeneration.add(key);
            Promise.resolve()
                .then(() => rebuildKnowledgeGraph(document))
                .catch((error) => {
                    logger.warn('[Graph] Async graph generation failed', {
                        documentId: key,
                        error: error.message
                    });
                })
                .finally(() => {
                    inFlightGraphGeneration.delete(key);
                });
        }
        res.status(202).json({
            status: 'generating',
            nodes: [],
            edges: []
        });
        return;
    }

    res.json({
        status: 'ready',
        ...graph
    });
});
