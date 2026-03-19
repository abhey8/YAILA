import { clamp, cosineSimilarity } from '../lib/math.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { masteryRepository } from '../repositories/masteryRepository.js';

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

        const record = await masteryRepository.upsert(userId, documentId, concept._id, {
            $set: {
                masteryScore,
                confidenceScore: clamp((existing?.confidenceScore || 0.4) * 0.5 + (score * 0.5)),
                lastInteractionAt: new Date(),
                confusionScore,
                needsRevision: masteryScore < 0.55
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
