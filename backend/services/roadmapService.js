import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { slugify } from '../lib/text.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { masteryRepository } from '../repositories/masteryRepository.js';
import { progressRepository } from '../repositories/progressRepository.js';
import { roadmapRepository } from '../repositories/roadmapRepository.js';
import { createNotification } from './notificationService.js';
import { trackActivity } from './activityService.js';

const buildFallbackConceptsFromChunks = (chunks, userId, documentId) => {
    const seen = new Set();
    const concepts = [];
    for (const chunk of chunks) {
        if (concepts.length >= 12) break;
        const rawName = (chunk.sectionTitle || chunk.keywords?.[0] || '').trim();
        const slug = slugify(rawName);
        if (!rawName || !slug || seen.has(slug)) continue;
        seen.add(slug);
        concepts.push({
            document: documentId,
            user: userId,
            name: rawName.slice(0, 80),
            slug,
            description: (chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 220),
            keywords: Array.isArray(chunk.keywords) ? chunk.keywords.slice(0, 8) : [],
            difficulty: 0.5,
            embedding: [],
            importance: 0.5,
            chunkRefs: [chunk._id],
            prerequisiteConcepts: [],
            relatedConcepts: []
        });
    }
    return concepts;
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

export const generateRoadmap = async (userId, documentId, reason = 'manual-refresh') => {
    let [concepts, masteries, progress] = await Promise.all([
        conceptRepository.listByDocument(documentId),
        masteryRepository.findByUserAndDocument(userId, documentId),
        progressRepository.getOrCreate(userId)
    ]);

    if (!concepts.length) {
        const chunks = await chunkRepository.listByDocument(documentId);
        const fallbackConcepts = buildFallbackConceptsFromChunks(chunks, userId, documentId);
        if (fallbackConcepts.length) {
            await conceptRepository.createMany(fallbackConcepts);
            concepts = await conceptRepository.listByDocument(documentId);
        }
    }

    if (!concepts.length) {
        throw new AppError('No concepts available for this document yet', 400, 'GRAPH_NOT_READY');
    }

    const masteryByConcept = new Map(masteries.map((mastery) => [mastery.concept._id.toString(), mastery]));
    const documentProgress = progress.documents.find((entry) => entry.document.toString() === documentId.toString());
    const topicProgress = documentProgress?.topicProgress || [];

    const ordered = topologicalPlan(concepts)
        .map((concept) => {
            const mastery = masteryByConcept.get(concept._id.toString());
            const metrics = topicProgress.find((entry) => entry.concept.toString() === concept._id.toString());
            const priority = (1 - (mastery?.masteryScore ?? 0.4)) * 0.55
                + ((metrics?.quizFailures || 0) * 0.1)
                + ((metrics?.chatQuestions || 0) * 0.05)
                + (concept.importance * 0.3);

            return {
                concept,
                priority
            };
        })
        .sort((left, right) => right.priority - left.priority)
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
