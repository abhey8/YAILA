import { env } from '../config/env.js';
import { cosineSimilarity } from '../lib/math.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { embedTexts } from './aiService.js';
import { getVectorStore } from './vectorStores/vectorStoreFactory.js';

const LOGIC_OPERATOR_ALIASES = [
    [/⊕|xor/gi, ' exclusive_or xor '],
    [/∀|for all|universal quantifier/gi, ' for_all universal_quantifier '],
    [/∃|there exists|exists|existential quantifier/gi, ' exists existential_quantifier '],
    [/¬|not/gi, ' not negation '],
    [/∧|and/gi, ' and conjunction '],
    [/∨|or/gi, ' or disjunction '],
    [/→|->|implies/gi, ' implies conditional '],
    [/↔|<->|iff|if and only if/gi, ' iff biconditional ']
];

const DEFAULT_RETRIEVAL_POLICY = {
    vectorCandidatePool: 24,
    lexicalCandidatePool: 24,
    mergedCandidatePool: 36,
    rerankPoolSize: 16,
    finalContextSize: 4,
    maxPerSection: 2,
    nearDuplicateThreshold: 0.88
};

const normalizeLogicText = (value = '') => {
    let text = `${value}`.toLowerCase();
    LOGIC_OPERATOR_ALIASES.forEach(([pattern, replacement]) => {
        text = text.replace(pattern, replacement);
    });
    return text.replace(/\s+/g, ' ').trim();
};

const lexicalScore = (query, content) => {
    const queryTerms = normalizeLogicText(query).split(/\W+/).filter(Boolean);
    if (!queryTerms.length) {
        return 0;
    }

    const haystack = normalizeLogicText(content);
    const matches = queryTerms.filter((term) => haystack.includes(term)).length;
    const base = matches / queryTerms.length;
    const definitionBoost = /\b(is|means|defined as|definition)\b/.test(haystack) ? 0.08 : 0;
    return Math.min(1, base + definitionBoost);
};

const hasUsableEmbedding = (embedding = []) => embedding.some((value) => Math.abs(value) > 1e-9);

const toPlainChunk = (chunk) => (typeof chunk?.toObject === 'function' ? chunk.toObject() : chunk);

const chunkKey = (chunk) => chunk?._id?.toString?.() || `${chunk?.document}-${chunk?.chunkIndex}`;

const tokenize = (text = '') => normalizeLogicText(text).split(/\W+/).filter((token) => token.length > 2);

const jaccardSimilarity = (leftText = '', rightText = '') => {
    const left = new Set(tokenize(leftText));
    const right = new Set(tokenize(rightText));
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    left.forEach((token) => {
        if (right.has(token)) intersection += 1;
    });
    const union = new Set([...left, ...right]).size;
    return union ? intersection / union : 0;
};

const resolvePolicy = (policy = {}, topK = null) => {
    const merged = {
        vectorCandidatePool: Number(policy.vectorCandidatePool || env.retrievalVectorCandidatePool || DEFAULT_RETRIEVAL_POLICY.vectorCandidatePool),
        lexicalCandidatePool: Number(policy.lexicalCandidatePool || env.retrievalLexicalCandidatePool || DEFAULT_RETRIEVAL_POLICY.lexicalCandidatePool),
        mergedCandidatePool: Number(policy.mergedCandidatePool || env.retrievalMergedCandidatePool || DEFAULT_RETRIEVAL_POLICY.mergedCandidatePool),
        rerankPoolSize: Number(policy.rerankPoolSize || env.retrievalRerankPoolSize || DEFAULT_RETRIEVAL_POLICY.rerankPoolSize),
        finalContextSize: Number(policy.finalContextSize || env.retrievalFinalContextSize || DEFAULT_RETRIEVAL_POLICY.finalContextSize),
        maxPerSection: Number(policy.maxPerSection || env.retrievalMaxPerSection || DEFAULT_RETRIEVAL_POLICY.maxPerSection),
        nearDuplicateThreshold: Number(policy.nearDuplicateThreshold || env.retrievalNearDuplicateThreshold || DEFAULT_RETRIEVAL_POLICY.nearDuplicateThreshold)
    };

    if (Number.isFinite(topK) && Number(topK) > 0) {
        merged.finalContextSize = Math.min(merged.finalContextSize, Number(topK));
    }

    return merged;
};

const mergeCandidates = (vectorCandidates, lexicalCandidates, mergedPoolSize) => {
    const merged = new Map();
    [...vectorCandidates, ...lexicalCandidates].forEach((raw) => {
        const chunk = toPlainChunk(raw);
        const key = chunkKey(chunk);
        if (!merged.has(key)) {
            merged.set(key, chunk);
            return;
        }
        const existing = merged.get(key);
        if ((chunk.semanticScore || 0) > (existing.semanticScore || 0)) {
            merged.set(key, chunk);
        }
    });

    return [...merged.values()].slice(0, mergedPoolSize);
};

const rerank = (query, chunks) => chunks
    .map((chunk) => {
        const lexical = lexicalScore(query, chunk.content);
        const semantic = chunk.semanticScore || 0;
        // If semantic is clearly a failure/placeholder (0.01), rely more on lexical
        const isPlaceholder = Math.abs(semantic - 1.0) < 1e-4 && lexical > 0.1;
        
        return {
            ...chunk,
            rerankScore: isPlaceholder ? (lexical * 0.8) : (semantic * 0.6 + lexical * 0.4)
        };
    })
    .sort((left, right) => right.rerankScore - left.rerankScore);

const applyDiversityFilter = (chunks, policy) => {
    const selected = [];
    const sectionCount = new Map();

    for (const chunk of chunks) {
        if (selected.length >= policy.finalContextSize) break;

        const sectionKey = `${chunk.document?.toString?.() || chunk.document}-${chunk.sectionTitle || 'untitled'}`;
        const currentSectionCount = sectionCount.get(sectionKey) || 0;
        if (currentSectionCount >= policy.maxPerSection) {
            continue;
        }

        const duplicate = selected.some((existing) => {
            if ((existing.document?.toString?.() || existing.document) !== (chunk.document?.toString?.() || chunk.document)) {
                return false;
            }
            const similarity = jaccardSimilarity(existing.content, chunk.content);
            return similarity >= policy.nearDuplicateThreshold;
        });
        if (duplicate) {
            continue;
        }

        selected.push(chunk);
        sectionCount.set(sectionKey, currentSectionCount + 1);
    }

    return selected.length ? selected : chunks.slice(0, policy.finalContextSize);
};

const expandContextWindows = async (chunks, radius, limit) => {
    if (!chunks.length || radius <= 0 || chunks.length >= limit) {
        return chunks.slice(0, limit);
    }

    const grouped = new Map();
    chunks.slice(0, Math.min(2, chunks.length)).forEach((chunk) => {
        const documentId = chunk.document?.toString?.() || `${chunk.document}`;
        const indexes = grouped.get(documentId) || [];
        indexes.push(chunk.chunkIndex);
        grouped.set(documentId, indexes);
    });

    const adjacentGroups = await Promise.all(
        [...grouped.entries()].map(async ([documentId, indexes]) => chunkRepository.listAdjacentByDocument(documentId, indexes, radius))
    );

    const existingKeys = new Set(chunks.map((chunk) => chunkKey(chunk)));
    const adjacent = adjacentGroups
        .flat()
        .map(toPlainChunk)
        .filter((chunk) => {
            const key = chunkKey(chunk);
            if (existingKeys.has(key)) {
                return false;
            }
            existingKeys.add(key);
            return true;
        })
        .sort((left, right) => left.chunkIndex - right.chunkIndex);

    return [...chunks, ...adjacent].slice(0, limit);
};

export const resolveQueryableDocuments = async ({ userId, documentIds = [] }) => {
    if (!userId) {
        return [];
    }

    if (documentIds.length) {
        return documentRepository.listOwnedDocumentsByIds(userId, documentIds);
    }

    return documentRepository.listOwnedDocuments(userId);
};

export const retrieveRelevantChunks = async ({
    userId,
    documentId = null,
    documentIds = [],
    query,
    topK = env.retrievalTopK,
    policy = {}
}) => {
    const retrievalPolicy = resolvePolicy(policy, Number(topK));
    const resolvedDocuments = documentId
        ? await resolveQueryableDocuments({ userId, documentIds: [documentId] })
        : await resolveQueryableDocuments({ userId, documentIds });

    if (!resolvedDocuments.length) {
        return [];
    }

    const resolvedIds = resolvedDocuments.map((document) => document._id);
    const documentTitleById = new Map(
        resolvedDocuments.map((document) => [document._id.toString(), document.title || document.originalName])
    );
    const vectorStore = getVectorStore();

    const attachTitles = (items = []) => items.map((item) => ({
        ...item,
        documentTitle: documentTitleById.get(item.document?.toString?.() || `${item.document}`) || 'Uploaded Document'
    }));

    let queryEmbedding = null;
    try {
        const embeddings = await embedTexts([query]);
        queryEmbedding = embeddings[0];
    } catch (error) {
        queryEmbedding = null;
    }

    const fetchLexicalCandidates = async () => {
        const chunks = await chunkRepository.lexicalSearchByDocuments(
            resolvedIds,
            userId,
            query,
            retrievalPolicy.lexicalCandidatePool
        );
        return chunks
            .map((chunk) => {
                const plain = toPlainChunk(chunk);
                return {
                    ...plain,
                    semanticScore: queryEmbedding?.length && hasUsableEmbedding(plain.embedding)
                        ? cosineSimilarity(queryEmbedding, plain.embedding)
                        : 0,
                    lexicalScore: lexicalScore(query, plain.content || '')
                };
            })
            .sort((a, b) => b.lexicalScore - a.lexicalScore)
            .slice(0, retrievalPolicy.lexicalCandidatePool);
    };

    const fetchVectorCandidates = async () => {
        if (!queryEmbedding?.length) return [];
        const vectorRaw = await vectorStore.search({
            documentIds: resolvedIds,
            userId,
            queryEmbedding,
            topK: retrievalPolicy.vectorCandidatePool
        });
        return vectorRaw.map((chunk) => ({
            ...toPlainChunk(chunk),
            lexicalScore: lexicalScore(query, chunk.content || '')
        }));
    };

    try {
        const [vectorCandidates, lexicalCandidates] = await Promise.all([
            fetchVectorCandidates(),
            fetchLexicalCandidates()
        ]);

        const merged = mergeCandidates(
            vectorCandidates,
            lexicalCandidates,
            retrievalPolicy.mergedCandidatePool
        );

        if (!merged.length) {
            return [];
        }

        const reranked = rerank(query, merged).slice(0, retrievalPolicy.rerankPoolSize);
        const diversified = await expandContextWindows(
            applyDiversityFilter(reranked, retrievalPolicy),
            env.retrievalContextRadius,
            retrievalPolicy.finalContextSize
        );

        return attachTitles(diversified);
    } catch (err) {
        const lexicalFallback = await fetchLexicalCandidates();
        const reranked = rerank(query, lexicalFallback).slice(0, retrievalPolicy.rerankPoolSize);
        const diversified = await expandContextWindows(
            applyDiversityFilter(reranked, retrievalPolicy),
            env.retrievalContextRadius,
            retrievalPolicy.finalContextSize
        );
        return attachTitles(diversified);
    }
};
