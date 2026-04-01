import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { logger } from '../lib/logger.js';
import { getKnowledgeGraph, rebuildKnowledgeGraph } from '../services/knowledgeGraphService.js';
import { generateRoadmap } from '../services/roadmapService.js';

const inFlightGraphGeneration = new Set();

export const getDocumentGraph = asyncHandler(async (req, res) => {
    const document = await documentRepository.findOwnedDocument(req.params.id, req.user._id);
    if (!document) {
        throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const graph = await getKnowledgeGraph(document._id);
    const key = document._id.toString();
    const scheduleGraphRefresh = () => {
        if (inFlightGraphGeneration.has(key)) {
            return;
        }

        inFlightGraphGeneration.add(key);
        Promise.resolve()
            .then(async () => {
                const concepts = await rebuildKnowledgeGraph(document);
                if ((concepts?.length || 0) > 0) {
                    try {
                        await generateRoadmap(req.user._id, document._id, 'graph-regeneration');
                    } catch (roadmapError) {
                        logger.warn('[Graph] Roadmap regeneration skipped after graph refresh', {
                            documentId: key,
                            error: roadmapError.message
                        });
                    }
                }
            })
            .catch((error) => {
                logger.warn('[Graph] Async graph generation failed', {
                    documentId: key,
                    error: error.message
                });
            })
            .finally(() => {
                inFlightGraphGeneration.delete(key);
            });
    };

    if (!graph?.nodes?.length) {
        scheduleGraphRefresh();
        res.status(202).json({
            status: 'generating',
            nodes: [],
            edges: []
        });
        return;
    }

    if (graph.nodes.length < 3) {
        scheduleGraphRefresh();
        res.json({
            status: 'ready',
            isLimited: true,
            ...graph
        });
        return;
    }

    res.json({
        status: 'ready',
        ...graph
    });
});
