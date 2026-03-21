import { chunkRepository } from '../repositories/chunkRepository.js';
import { masteryRepository } from '../repositories/masteryRepository.js';

export const getRevisionRecommendations = async (userId, documentIds) => {
    const ids = Array.isArray(documentIds) ? documentIds : [documentIds];
    const weakConcepts = ids.length === 1
        ? await masteryRepository.listWeakConcepts(userId, ids[0])
        : await masteryRepository.listWeakConceptsByDocuments(userId, ids);
    const recommendations = [];

    for (const mastery of weakConcepts.slice(0, 5)) {
        const chunks = await chunkRepository.listByIds(mastery.concept.chunkRefs || []);
        recommendations.push({
            conceptId: mastery.concept._id,
            conceptName: mastery.concept.name,
            masteryScore: mastery.masteryScore,
            resources: chunks.slice(0, 3).map((chunk) => ({
                chunkId: chunk._id,
                summary: chunk.summary,
                excerpt: chunk.content.slice(0, 220)
            }))
        });
    }

    return recommendations;
};
