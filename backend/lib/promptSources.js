import { chunkRepository } from '../repositories/chunkRepository.js';
import { sampleChunksForPrompt } from './documentContext.js';
import { filterStudyWorthChunks } from './studyContent.js';

const toPlainChunk = (chunk) => (typeof chunk?.toObject === 'function' ? chunk.toObject() : chunk);

export const toChunkId = (value) => value?.toString?.() || `${value}`;

const proseWordCount = (value = '') => (`${value}`.match(/[a-z]{3,}/gi) || []).length;
const mathSymbolCount = (value = '') => (`${value}`.match(/[=<>±∆∂∑∫λμσπ0-9/\\^_*()[\]{}|]+/g) || []).join('').length;

const scoreChunkForPrompt = (chunk = {}, preferredIds = new Set()) => {
    const section = `${chunk.sectionTitle || ''}`.toLowerCase();
    const content = `${chunk.summary || chunk.content || ''}`.replace(/\s+/g, ' ').trim();
    const summaryLength = `${chunk.summary || ''}`.trim().length;
    const tokenCount = Number(chunk.tokenCount) || 0;
    const keywordCount = Array.isArray(chunk.keywords) ? chunk.keywords.length : 0;
    const proseWords = proseWordCount(content);
    const symbolWeight = mathSymbolCount(content);

    let score = 0;
    if (preferredIds.has(toChunkId(chunk._id))) {
        score += 1.8;
    }
    if (/(definition|theorem|proof|example|lemma|algorithm|application|rule|method|intuition)/i.test(section)) {
        score += 0.5;
    }
    if (summaryLength >= 90 && summaryLength <= 260) {
        score += 0.25;
    }
    if (tokenCount >= 80 && tokenCount <= 320) {
        score += 0.18;
    }
    if (keywordCount >= 2) {
        score += 0.12;
    }
    if (/[.!?]/.test(content) && proseWords >= 18) {
        score += 0.18;
    }
    if (proseWords < 10) {
        score -= 0.28;
    }
    if (symbolWeight > proseWords * 1.1 && proseWords < 28) {
        score -= 0.45;
    }
    if (/^[a-z]\s+[a-z]\s+[a-z]/i.test(content)) {
        score -= 0.4;
    }

    return score;
};

export const attachDocumentTitles = (chunks = [], documents = []) => chunks.map((chunk) => {
    const plain = toPlainChunk(chunk);
    const owner = documents.find((document) => document._id.toString() === plain.document.toString());

    return {
        ...plain,
        documentTitle: owner?.title || owner?.originalName || plain.documentTitle || 'Uploaded Document'
    };
});

export const loadPromptChunkCandidates = async (documents = [], { sampleLimitPerDocument = 18 } = {}) => {
    const groups = await Promise.all(documents.map(async (document) => {
        const limit = Math.max(6, Number(sampleLimitPerDocument) || 18);
        const rawChunks = Number(document.chunkCount || 0) > limit
            ? await chunkRepository.sampleByDocument(document._id, limit)
            : await chunkRepository.listByDocument(document._id);

        return attachDocumentTitles(rawChunks, documents);
    }));

    return filterStudyWorthChunks(groups.flat());
};

export const selectPromptExcerpts = ({
    candidates = [],
    preferredChunks = [],
    maxChunks = 10,
    maxPerSection = 2,
    maxPerDocument = 5
} = {}) => {
    const filteredCandidates = filterStudyWorthChunks(candidates);
    const filteredPreferred = filterStudyWorthChunks(preferredChunks);
    const preferredIds = new Set(filteredPreferred.map((chunk) => toChunkId(chunk._id)));
    const broadSample = sampleChunksForPrompt(filteredCandidates, Math.min(filteredCandidates.length, Math.max(maxChunks + 4, maxChunks * 2)));

    const pool = [];
    const seen = new Set();

    [...filteredPreferred, ...broadSample, ...filteredCandidates].forEach((chunk) => {
        const key = toChunkId(chunk?._id);
        if (!chunk || seen.has(key)) {
            return;
        }
        seen.add(key);
        pool.push(chunk);
    });

    const sectionCounts = new Map();
    const documentCounts = new Map();
    const selected = [];

    pool
        .map((chunk) => ({
            ...chunk,
            promptScore: scoreChunkForPrompt(chunk, preferredIds)
        }))
        .sort((left, right) => right.promptScore - left.promptScore)
        .forEach((chunk) => {
            if (selected.length >= maxChunks) {
                return;
            }

            const sectionKey = `${chunk.document}-${chunk.sectionTitle || 'untitled'}`;
            const documentKey = `${chunk.document}`;
            const currentSectionCount = sectionCounts.get(sectionKey) || 0;
            const currentDocumentCount = documentCounts.get(documentKey) || 0;

            if (currentSectionCount >= maxPerSection || currentDocumentCount >= maxPerDocument) {
                return;
            }

            selected.push(chunk);
            sectionCounts.set(sectionKey, currentSectionCount + 1);
            documentCounts.set(documentKey, currentDocumentCount + 1);
        });

    return selected;
};
