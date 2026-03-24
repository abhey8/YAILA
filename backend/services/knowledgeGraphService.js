import { sampleChunksForPrompt } from '../lib/documentContext.js';
import { slugify } from '../lib/text.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { masteryRepository } from '../repositories/masteryRepository.js';
import { embedTexts, generateJson } from './aiService.js';

const toExtractionPrompt = (documentTitle, chunks) => {
    const excerpt = chunks
        .slice(0, 10)
        .map((chunk, index) => `Chunk ${index + 1}: ${chunk.content}`)
        .join('\n\n');

    return `You are extracting a learning knowledge graph from a study document.
Document title: ${documentTitle}

From the excerpts below, identify the core concepts and subtopics. Return a JSON array where each item has:
- name
- description
- parentName (string or null)
- prerequisiteNames (array of strings)
- keywords (array of strings)
- difficulty (0 to 1)
- importance (0 to 1)

Focus on concrete study concepts, not generic words.

${excerpt}`;
};

const buildDeterministicGraphConcepts = (chunks) => {
    const seen = new Set();
    const concepts = [];

    for (const chunk of chunks) {
        if (concepts.length >= 28) break;
        const name = (chunk.sectionTitle || chunk.keywords?.[0] || '').trim();
        const slug = slugify(name);
        if (!name || !slug || seen.has(slug)) continue;
        seen.add(slug);

        concepts.push({
            name,
            slug,
            description: (chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 260),
            parentName: null,
            prerequisiteNames: [],
            keywords: Array.isArray(chunk.keywords) ? chunk.keywords.slice(0, 8) : [],
            difficulty: 0.5,
            importance: 0.5
        });
    }

    return concepts;
};

export const rebuildKnowledgeGraph = async (document) => {
    const allChunks = await chunkRepository.listByDocument(document._id);
    const chunks = sampleChunksForPrompt(allChunks, 40);
    let uniqueConcepts = [];

    if (env.lowCreditMode) {
        uniqueConcepts = buildDeterministicGraphConcepts(chunks);
    } else {
        const seen = new Set();
        const batchSize = 10;

        for (let i = 0; i < chunks.length; i += batchSize) {
            const batchChunks = chunks.slice(i, i + batchSize);
            let extracted = [];
            try {
                extracted = await generateJson(toExtractionPrompt(document.title, batchChunks));
            } catch (err) {
                logger.warn('[KnowledgeGraph] Batch extraction failed', { error: err.message, documentId: document._id.toString() });
                continue;
            }

            extracted.forEach((item) => {
                const slug = slugify(item.name);
                if (!slug || seen.has(slug)) {
                    return;
                }
                seen.add(slug);
                uniqueConcepts.push({
                    ...item,
                    slug
                });
            });
        }
    }

    if (!uniqueConcepts.length) {
        uniqueConcepts = buildDeterministicGraphConcepts(chunks);
    }

    if (!uniqueConcepts.length) {
        document.conceptCount = 0;
        await document.save();
        return [];
    }

    let embeddings = [];
    try {
        embeddings = await embedTexts(uniqueConcepts.map((concept) => `${concept.name}\n${concept.description}`));
    } catch (error) {
        embeddings = uniqueConcepts.map(() => []);
    }

    await conceptRepository.deleteByDocument(document._id);

    const created = await conceptRepository.createMany(uniqueConcepts.map((concept, index) => ({
        document: document._id,
        user: document.user,
        name: concept.name,
        slug: concept.slug,
        description: concept.description,
        keywords: concept.keywords || [],
        difficulty: Number(concept.difficulty ?? 0.5),
        importance: Number(concept.importance ?? 0.5),
        embedding: embeddings[index],
        prerequisiteConcepts: [],
        relatedConcepts: [],
        chunkRefs: chunks
            .filter((chunk) => (concept.keywords || []).some((keyword) => chunk.content.toLowerCase().includes(keyword.toLowerCase())))
            .slice(0, 5)
            .map((chunk) => chunk._id)
    })));

    const byName = new Map(created.map((concept) => [concept.name.toLowerCase(), concept]));

    for (const concept of created) {
        const source = uniqueConcepts.find((item) => item.slug === concept.slug);
        concept.parentConcept = source?.parentName ? byName.get(source.parentName.toLowerCase())?._id || null : null;
        concept.prerequisiteConcepts = (source?.prerequisiteNames || [])
            .map((name) => byName.get(name.toLowerCase())?._id)
            .filter(Boolean);
        concept.relatedConcepts = created
            .filter((candidate) => candidate._id.toString() !== concept._id.toString())
            .filter((candidate) => candidate.keywords.some((keyword) => concept.keywords.includes(keyword)))
            .slice(0, 5)
            .map((candidate) => candidate._id);
        await concept.save();
        await masteryRepository.upsert(document.user, document._id, concept._id, {
            $setOnInsert: {
                masteryScore: 0.45,
                confidenceScore: 0.3,
                attempts: 0,
                correctAttempts: 0,
                lastInteractionAt: new Date(),
                confusionScore: 0.2,
                needsRevision: true,
                evidence: []
            }
        });
    }

    document.conceptCount = created.length;
    await document.save();

    return created;
};

export const getKnowledgeGraph = async (documentId) => {
    const concepts = await conceptRepository.listByDocument(documentId);

    return {
        nodes: concepts.map((concept) => ({
            id: concept._id,
            label: concept.name,
            difficulty: concept.difficulty,
            importance: concept.importance,
            parentConcept: concept.parentConcept
        })),
        edges: concepts.flatMap((concept) => [
            ...concept.prerequisiteConcepts.map((targetId) => ({
                source: targetId,
                target: concept._id,
                type: 'prerequisite'
            })),
            ...concept.relatedConcepts.map((targetId) => ({
                source: concept._id,
                target: targetId,
                type: 'related'
            }))
        ])
    };
};
