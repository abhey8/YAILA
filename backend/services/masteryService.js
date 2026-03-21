import { clamp, cosineSimilarity } from '../lib/math.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { masteryRepository } from '../repositories/masteryRepository.js';
import { createNotification } from './notificationService.js';
import { trackActivity } from './activityService.js';

const recencyWeight = (date) => {
    const ageDays = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
    return Math.exp(-ageDays / 14);
};

export const updateConceptMastery = async ({
    userId,
    documentId,
    conceptIds,
    sourceType,
    score,
    sourceId = null
}) => {
    const concepts = await conceptRepository.listByIds(conceptIds);
    const updated = [];

    for (const concept of concepts) {
        const existing = await masteryRepository.findOne(userId, concept._id);
        const attempts = (existing?.attempts || 0) + 1;
        const correctAttempts = (existing?.correctAttempts || 0) + (score >= 0.7 ? 1 : 0);
        const accuracy = correctAttempts / attempts;
        const masteryScore = clamp((accuracy * 0.55) + (score * 0.25) + (recencyWeight(new Date()) * 0.2));
        const confusionScore = clamp(1 - masteryScore);
        const needsRevision = masteryScore < 0.55;

        const record = await masteryRepository.upsert(userId, documentId, concept._id, {
            $set: {
                masteryScore,
                confidenceScore: clamp((existing?.confidenceScore || 0.4) * 0.5 + (score * 0.5)),
                lastInteractionAt: new Date(),
                confusionScore,
                needsRevision
            },
            $inc: {
                attempts: 1,
                correctAttempts: score >= 0.7 ? 1 : 0
            },
            $push: {
                evidence: {
                    $each: [{
                        sourceType,
                        sourceId,
                        score,
                        recordedAt: new Date()
                    }],
                    $slice: -20
                }
            }
        });

        if (!existing?.needsRevision && needsRevision) {
            await Promise.all([
                trackActivity({
                    userId,
                    documentId,
                    type: 'weak-concept-detected',
                    title: 'Weak concept detected',
                    description: `${concept.name} needs revision based on recent performance.`,
                    metadata: {
                        conceptId: concept._id,
                        masteryScore
                    }
                }),
                createNotification({
                    userId,
                    documentId,
                    type: 'weak-concept-detected',
                    title: 'Revision recommended',
                    message: `${concept.name} has been flagged as a weak concept and should be reviewed.`,
                    metadata: {
                        conceptId: concept._id,
                        masteryScore
                    }
                })
            ]);
        }

        updated.push(record);
    }

    for (const sourceConcept of concepts) {
        for (const targetConcept of concepts.filter((candidate) => candidate._id.toString() !== sourceConcept._id.toString())) {
            const propagated = cosineSimilarity(sourceConcept.embedding, targetConcept.embedding) * (1 - score) * 0.15;
            if (propagated <= 0.02) {
                continue;
            }

            await masteryRepository.upsert(userId, documentId, targetConcept._id, {
                $set: {
                    lastInteractionAt: new Date(),
                    needsRevision: true
                },
                $inc: {
                    confusionScore: propagated
                }
            });
        }
    }

    return updated;
};
