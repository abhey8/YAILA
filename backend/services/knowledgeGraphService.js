import { sampleChunksForPrompt } from '../lib/documentContext.js';
import { slugify } from '../lib/text.js';
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

export const rebuildKnowledgeGraph = async (document) => {
    const allChunks = await chunkRepository.listByDocument(document._id);
    const chunks = sampleChunksForPrompt(allChunks, 40);
    const uniqueConcepts = [];
    const seen = new Set();
    const batchSize = 10;
    
    // Process chunks in batches to avoid overwhelming context limits, extracting graph holistically
    for (let i = 0; i < chunks.length; i += batchSize) {
        const batchChunks = chunks.slice(i, i + batchSize);
        let extracted = [];
        try {
             // 4 second stagger to respect Gemini Free Tier 15 RPM
             await new Promise((resolve) => setTimeout(resolve, 4000));
             extracted = await generateJson(toExtractionPrompt(document.title, batchChunks));
        } catch (err) {
            console.error('Failed to extract knowledge graph batch', err);
            continue;
        }

        extracted.forEach((item) => {
            const slug = slugify(item.name);
            if (!slug || seen.has(slug)) {
                return; // deduplicate
            }

            seen.add(slug);
            uniqueConcepts.push({
                ...item,
                slug
            });
        });
    }

    const embeddings = await embedTexts(uniqueConcepts.map((concept) => `${concept.name}\n${concept.description}`));

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
