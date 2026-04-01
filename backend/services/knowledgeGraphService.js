import { sampleChunksForPrompt } from '../lib/documentContext.js';
import { slugify } from '../lib/text.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { filterStudyWorthChunks, isLowValueConcept } from '../lib/studyContent.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { masteryRepository } from '../repositories/masteryRepository.js';
import { embedTexts, generateJson } from './aiService.js';

const MAX_PROMPT_CHUNKS = 16;
const MAX_GRAPH_NODES = 36;
const EXTRACTION_ATTEMPTS = 2;
const resolveNodeLimit = (chunks = []) => Math.min(MAX_GRAPH_NODES, Math.max(6, Math.min(18, chunks.length * 3)));

const clamp01 = (value, fallback = 0.5) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(1, parsed));
};

const sanitizeKeywords = (keywords = []) => {
    if (!Array.isArray(keywords)) return [];
    return keywords
        .map((keyword) => `${keyword}`.trim().toLowerCase())
        .filter((keyword) => keyword.length >= 3)
        .slice(0, 10);
};

const normalizeLabelToken = (token = '') => {
    if (token.length > 4 && token.endsWith('s')) {
        return token.slice(0, -1);
    }
    return token;
};

const toLabelTokens = (value = '') => new Set(
    `${value}`
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((token) => normalizeLabelToken(token))
        .filter((token) => token.length > 2)
);

const labelSimilarity = (left = '', right = '') => {
    const leftTokens = toLabelTokens(left);
    const rightTokens = toLabelTokens(right);

    if (!leftTokens.size || !rightTokens.size) {
        return 0;
    }

    let overlap = 0;
    leftTokens.forEach((token) => {
        if (rightTokens.has(token)) {
            overlap += 1;
        }
    });

    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union ? overlap / union : 0;
};

const normalizeRelation = (value = '') => {
    const normalized = `${value}`.trim().toLowerCase();
    if (/pre[- ]?req|prerequisite/.test(normalized)) return 'prerequisite';
    if (/parent|contains|subtopic|hierarch/.test(normalized)) return 'parent';
    return 'related';
};

const normalizeNodeType = (value = '') => {
    const normalized = `${value}`.trim().toLowerCase();
    if (['topic', 'subtopic', 'definition', 'theorem', 'method', 'example'].includes(normalized)) {
        return normalized;
    }
    return 'topic';
};

const toExtractionPrompt = (documentTitle, chunks, attempt = 1) => {
    const nodeLimit = resolveNodeLimit(chunks);
    const excerpts = chunks
        .map((chunk, index) => `Excerpt ${index + 1}
Section: ${chunk.sectionTitle || 'Untitled Section'}
Summary: ${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 180)}
Keywords: ${(chunk.keywords || []).slice(0, 6).join(', ') || 'n/a'}`)
        .join('\n\n');

    return `You are extracting a learning knowledge graph from study material.
Document title: ${documentTitle || 'Uploaded Document'}

Return strictly valid JSON object with this schema:
{
  "nodes": [
    {
      "id": "string-slug",
      "label": "Concept Name",
      "type": "topic|subtopic|definition|theorem|method|example",
      "description": "short concept description grounded in excerpts",
      "keywords": ["keyword"],
      "difficulty": 0.0,
      "importance": 0.0
    }
  ],
  "edges": [
    {
      "source": "node-id",
      "target": "node-id",
      "relation": "prerequisite|parent|related"
    }
  ]
}

Rules:
- Nodes must be concrete academic concepts from the excerpts.
- Do not include empty labels.
- Keep node ids URL-safe and stable.
- Avoid duplicate concepts.
- Use "prerequisite" only when dependency is explicit.
- Use "parent" for topic/subtopic containment.
- Use "related" for conceptual association.
- Prefer quality over quantity.
- Maximum ${nodeLimit} nodes.
- Attempt ${attempt} should improve coverage and relation quality without inventing facts.

Excerpts:
${excerpts}`;
};

const parseGraphPayload = (payload) => {
    if (Array.isArray(payload)) {
        return { nodes: payload, edges: [] };
    }
    if (payload && typeof payload === 'object') {
        return {
            nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
            edges: Array.isArray(payload.edges) ? payload.edges : []
        };
    }
    return { nodes: [], edges: [] };
};

const sanitizeGraph = (rawGraph, maxNodes = MAX_GRAPH_NODES) => {
    const parsed = parseGraphPayload(rawGraph);
    const seen = new Set();
    const seenLabels = new Set();
    const nodes = [];

    parsed.nodes.forEach((node) => {
        const label = `${node?.label || node?.name || ''}`.replace(/\s+/g, ' ').trim();
        if (!label) return;
        const id = slugify(`${node?.id || label}`) || slugify(label);
        const labelKey = [...toLabelTokens(label)].sort().join('-') || slugify(label);
        if (!id || seen.has(id) || seenLabels.has(labelKey)) return;
        if (isLowValueConcept({ name: label, description: node?.description || '' })) return;
        const nearDuplicate = nodes.some((existing) => labelSimilarity(existing.label, label) >= 0.74);
        if (nearDuplicate) return;
        seen.add(id);
        seenLabels.add(labelKey);
        nodes.push({
            id,
            label,
            type: normalizeNodeType(node?.type),
            description: `${node?.description || ''}`.replace(/\s+/g, ' ').trim().slice(0, 400),
            keywords: sanitizeKeywords(node?.keywords),
            difficulty: clamp01(node?.difficulty, 0.5),
            importance: clamp01(node?.importance, 0.5)
        });
    });

    const nodeIdSet = new Set(nodes.map((node) => node.id));
    const edgeSeen = new Set();
    const edges = [];

    parsed.edges.forEach((edge) => {
        const source = slugify(`${edge?.source || ''}`);
        const target = slugify(`${edge?.target || ''}`);
        if (!source || !target || source === target) return;
        if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) return;
        const relation = normalizeRelation(edge?.relation);
        const key = `${source}|${target}|${relation}`;
        if (edgeSeen.has(key)) return;
        edgeSeen.add(key);
        edges.push({ source, target, relation });
    });

    return {
        nodes: nodes.slice(0, maxNodes),
        edges
    };
};

const selectChunkRefsForNode = (node, chunks) => {
    const name = node.label.toLowerCase();
    const keywords = node.keywords || [];
    return chunks
        .filter((chunk) => {
            const content = `${chunk.content || ''}`.toLowerCase();
            if (content.includes(name)) return true;
            return keywords.some((keyword) => content.includes(keyword));
        })
        .slice(0, 6)
        .map((chunk) => chunk._id);
};

const buildFallbackGraphFromChunks = (chunks = []) => {
    const sectionBuckets = new Map();

    chunks.forEach((chunk) => {
        const sectionTitle = `${chunk.sectionTitle || 'Core Topic'}`.trim() || 'Core Topic';
        const list = sectionBuckets.get(sectionTitle) || [];
        list.push(chunk);
        sectionBuckets.set(sectionTitle, list);
    });

    const nodes = [...sectionBuckets.entries()]
        .map(([label, sectionChunks], index) => {
            const leadChunk = sectionChunks[0];
            const combinedKeywords = [...new Set(sectionChunks.flatMap((chunk) => chunk.keywords || []))].slice(0, 8);
            const importance = Math.max(0.25, Math.min(1, sectionChunks.length / Math.max(chunks.length / 3, 1)));
            const difficulty = Math.max(0.2, Math.min(0.9, (leadChunk?.tokenCount || 180) / 600));

            return {
                id: slugify(label || `topic-${index + 1}`),
                label,
                type: index === 0 ? 'topic' : 'subtopic',
                description: `${leadChunk?.summary || leadChunk?.content || label}`.replace(/\s+/g, ' ').trim().slice(0, 280),
                keywords: combinedKeywords,
                difficulty,
                importance
            };
        })
        .filter((node) => node.id && !isLowValueConcept(node))
        .slice(0, Math.min(MAX_GRAPH_NODES, 12));

    const edges = nodes.slice(1).map((node, index) => ({
        source: nodes[Math.max(index - 1, 0)].id,
        target: node.id,
        relation: 'related'
    }));

    return { nodes, edges };
};

export const rebuildKnowledgeGraph = async (document) => {
    const allChunks = await chunkRepository.listByDocument(document._id);
    const chunks = sampleChunksForPrompt(filterStudyWorthChunks(allChunks), MAX_PROMPT_CHUNKS);
    const nodeLimit = resolveNodeLimit(chunks);
    if (!chunks.length) {
        document.conceptCount = 0;
        await document.save();
        return [];
    }

    let bestGraph = { nodes: [], edges: [] };
    let lastError = null;

    for (let attempt = 1; attempt <= EXTRACTION_ATTEMPTS; attempt += 1) {
        try {
            const raw = await generateJson(
                toExtractionPrompt(document.title || document.originalName, chunks, attempt),
                { maxTokens: 3600 }
            );
            const graph = sanitizeGraph(raw, nodeLimit);
            if (graph.nodes.length > bestGraph.nodes.length) {
                bestGraph = graph;
            }
            if (graph.nodes.length >= 4) {
                break;
            }
        } catch (error) {
            lastError = error;
            logger.warn('[KnowledgeGraph] Extraction attempt failed', {
                documentId: document._id.toString(),
                attempt,
                error: error.message
            });
        }
    }

    if (bestGraph.nodes.length < 3) {
        const fallbackGraph = buildFallbackGraphFromChunks(chunks);
        if (fallbackGraph.nodes.length > bestGraph.nodes.length) {
            bestGraph = fallbackGraph;
        }
    }

    if (!bestGraph.nodes.length) {
        throw new AppError('Knowledge graph extraction failed', 502, 'KNOWLEDGE_GRAPH_EXTRACTION_FAILED', {
            documentId: document._id.toString(),
            reason: lastError?.message || 'No concepts extracted'
        });
    }

    let embeddings = [];
    try {
        embeddings = await embedTexts(bestGraph.nodes.map((node) => `${node.label}\n${node.description}`));
    } catch (error) {
        logger.warn('[KnowledgeGraph] Embedding generation failed for concepts', {
            documentId: document._id.toString(),
            error: error.message
        });
        embeddings = bestGraph.nodes.map(() => []);
    }

    await conceptRepository.deleteByDocument(document._id);

    const created = await conceptRepository.createMany(bestGraph.nodes.map((node, index) => ({
        document: document._id,
        user: document.user,
        name: node.label,
        slug: node.id,
        description: node.description || node.label,
        keywords: node.keywords,
        difficulty: node.difficulty,
        importance: node.importance,
        embedding: embeddings[index] || [],
        prerequisiteConcepts: [],
        relatedConcepts: [],
        chunkRefs: selectChunkRefsForNode(node, chunks)
    })));

    const conceptBySlug = new Map(created.map((concept) => [concept.slug, concept]));
    const relatedIndex = new Map(created.map((concept) => [concept._id.toString(), new Set()]));
    const prereqIndex = new Map(created.map((concept) => [concept._id.toString(), new Set()]));

    bestGraph.edges.forEach((edge) => {
        const source = conceptBySlug.get(edge.source);
        const target = conceptBySlug.get(edge.target);
        if (!source || !target) return;

        if (edge.relation === 'prerequisite') {
            prereqIndex.get(target._id.toString())?.add(source._id.toString());
            return;
        }

        if (edge.relation === 'parent') {
            target.parentConcept = source._id;
            return;
        }

        relatedIndex.get(source._id.toString())?.add(target._id.toString());
        relatedIndex.get(target._id.toString())?.add(source._id.toString());
    });

    for (const concept of created) {
        concept.prerequisiteConcepts = [...(prereqIndex.get(concept._id.toString()) || [])];
        concept.relatedConcepts = [...(relatedIndex.get(concept._id.toString()) || [])];
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
    const nodes = concepts.map((concept) => ({
        id: concept._id,
        label: concept.name,
        type: 'topic',
        difficulty: concept.difficulty,
        importance: concept.importance,
        parentConcept: concept.parentConcept
    }));

    const edges = concepts.flatMap((concept) => [
        ...concept.prerequisiteConcepts.map((targetId) => ({
            source: targetId,
            target: concept._id,
            relation: 'prerequisite',
            type: 'prerequisite'
        })),
        ...(concept.parentConcept ? [{
            source: concept.parentConcept,
            target: concept._id,
            relation: 'parent',
            type: 'parent'
        }] : []),
        ...concept.relatedConcepts.map((targetId) => ({
            source: concept._id,
            target: targetId,
            relation: 'related',
            type: 'related'
        }))
    ]);

    return { nodes, edges };
};
