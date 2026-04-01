import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { masteryRepository } from '../repositories/masteryRepository.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { roadmapRepository } from '../repositories/roadmapRepository.js';
import { createNotification } from './notificationService.js';
import { trackActivity } from './activityService.js';
import { rebuildKnowledgeGraph } from './knowledgeGraphService.js';
import { logger } from '../lib/logger.js';
import { filterStudyWorthConcepts } from '../lib/studyContent.js';

const hasWeakConcepts = (concepts = []) => {
    if (!concepts.length) {
        return true;
    }
    if (concepts.length < 4) {
        return true;
    }
    const weakDescriptions = concepts.filter((concept) => (concept.description || '').trim().length < 32).length;
    return weakDescriptions / concepts.length > 0.45;
};

const topologicalPlan = (concepts) => {
    const byId = new Map(concepts.map((concept) => [concept._id.toString(), concept]));
    const visited = new Set();
    const order = [];

    const visit = (concept) => {
        if (visited.has(concept._id.toString())) {
            return;
        }

        visited.add(concept._id.toString());
        concept.prerequisiteConcepts.forEach((prereqId) => {
            const prereq = byId.get(prereqId.toString());
            if (prereq) {
                visit(prereq);
            }
        });
        order.push(concept);
    };

    concepts.forEach(visit);
    return order;
};

const buildDependencyDepthIndex = (concepts) => {
    const byId = new Map(concepts.map((concept) => [concept._id.toString(), concept]));
    const memo = new Map();

    const resolveDepth = (concept) => {
        const key = concept._id.toString();
        if (memo.has(key)) {
            return memo.get(key);
        }

        const depth = concept.prerequisiteConcepts.reduce((maxDepth, prereqId) => {
            const prereq = byId.get(prereqId.toString());
            if (!prereq) {
                return maxDepth;
            }
            return Math.max(maxDepth, resolveDepth(prereq) + 1);
        }, 0);

        memo.set(key, depth);
        return depth;
    };

    concepts.forEach(resolveDepth);
    return memo;
};

export const generateRoadmap = async (userId, documentId, reason = 'manual-refresh') => {
    let concepts = filterStudyWorthConcepts(await conceptRepository.listByDocument(documentId));
    if (hasWeakConcepts(concepts)) {
        const document = await documentRepository.findById(documentId);
        if (!document) {
            throw new AppError('Document not found for roadmap generation', 404, 'DOCUMENT_NOT_FOUND');
        }
        try {
            await rebuildKnowledgeGraph(document);
            concepts = filterStudyWorthConcepts(await conceptRepository.listByDocument(documentId));
        } catch (error) {
            logger.warn('[Roadmap] Knowledge graph regeneration failed', {
                userId: userId.toString(),
                documentId: documentId.toString(),
                error: error.message
            });
            throw new AppError('Concept graph generation failed for roadmap', 502, 'ROADMAP_GRAPH_REGEN_FAILED', {
                stage: 'knowledge-graph',
                reason: error.message
            });
        }
    }

    if (!concepts.length) {
        throw new AppError('No concepts available for this document yet', 409, 'GRAPH_NOT_READY', {
            stage: 'knowledge-graph'
        });
    }

    const [masteries, progress] = await Promise.all([
        masteryRepository.findByUserAndDocument(userId, documentId),
        progressRepository.getOrCreate(userId)
    ]);

    const masteryByConcept = new Map(
        masteries
            .filter((mastery) => mastery?.concept?._id)
            .map((mastery) => [mastery.concept._id.toString(), mastery])
    );
    const documentProgress = progress.documents.find((entry) => entry.document.toString() === documentId.toString());
    const topicProgress = documentProgress?.topicProgress || [];
    const topologicalOrder = topologicalPlan(concepts);
    const topologicalIndex = new Map(topologicalOrder.map((concept, index) => [concept._id.toString(), index]));
    const depthIndex = buildDependencyDepthIndex(concepts);

    const ordered = concepts
        .map((concept) => {
            const mastery = masteryByConcept.get(concept._id.toString());
            const metrics = topicProgress.find((entry) => entry.concept.toString() === concept._id.toString());
            const priority = (1 - (mastery?.masteryScore ?? 0.4)) * 0.55
                + ((metrics?.quizFailures || 0) * 0.1)
                + ((metrics?.chatQuestions || 0) * 0.05)
                + (concept.importance * 0.3);

            return {
                concept,
                priority,
                depth: depthIndex.get(concept._id.toString()) || 0,
                topoOrder: topologicalIndex.get(concept._id.toString()) || 0
            };
        })
        .sort((left, right) => {
            if (left.depth !== right.depth) {
                return left.depth - right.depth;
            }
            if (Math.abs(right.priority - left.priority) > 0.08) {
                return right.priority - left.priority;
            }
            return left.topoOrder - right.topoOrder;
        })
        .slice(0, 10);

    const roadmap = await roadmapRepository.create({
        user: userId,
        document: documentId,
        generatedAt: new Date(),
        validUntil: new Date(Date.now() + env.roadmapRefreshHours * 60 * 60 * 1000),
        regenerationReason: reason,
        items: ordered.map((entry, index) => ({
            order: index + 1,
            concept: entry.concept._id,
            reason: entry.priority > 0.7 ? 'Low mastery with high concept importance' : 'Recommended next concept in dependency order',
            estimatedMinutes: Math.round(20 + (entry.concept.difficulty * 35)),
            recommendedResources: [
                { type: 'summary', label: `${entry.concept.name} summary` },
                { type: 'flashcard', label: `${entry.concept.name} flashcards` },
                { type: 'quiz', label: `${entry.concept.name} practice quiz` },
                { type: 'chat', label: `Ask AI about ${entry.concept.name}` }
            ]
        }))
    });

    let userDocumentProgress = progress.documents.find((entry) => entry.document.toString() === documentId.toString());
    if (!userDocumentProgress) {
        userDocumentProgress = {
            document: documentId,
            completionRate: 0,
            currentRoadmap: roadmap._id,
            topicProgress: []
        };
        progress.documents.push(userDocumentProgress);
    } else {
        userDocumentProgress.currentRoadmap = roadmap._id;
    }
    await progressRepository.save(progress);

    await trackActivity({
        userId,
        documentId,
        type: 'roadmap-regenerated',
        title: 'Learning roadmap updated',
        description: `A new roadmap was generated for ${ordered.length} priority concepts.`,
        metadata: {
            roadmapId: roadmap._id,
            reason
        }
    });

    await createNotification({
        userId,
        documentId,
        type: 'roadmap-regenerated',
        title: 'Roadmap regenerated',
        message: 'Your learning roadmap has been updated with the latest mastery data.',
        metadata: {
            roadmapId: roadmap._id,
            reason
        }
    });

    return roadmapRepository.findLatestForDocument(userId, documentId);
};

export const getCurrentRoadmap = (userId, documentId) => roadmapRepository.findLatestForDocument(userId, documentId);
