import { normalizeWhitespace, splitParagraphs, tokenizeEstimate } from '../lib/text.js';
import { logger } from '../lib/logger.js';

const MAX_CHUNK_CHARS = 1400; // About 300 to 500 tokens
const OVERLAP_CHARS = 250;
const HEADING_PATTERN = /^([A-Z0-9][A-Za-z0-9\s,.:;()/-]{2,80}|(?:\d+\.)+\d*\s+[A-Z][A-Za-z0-9\s,.:;()/-]{2,80})$/;

const LOW_QUALITY_SECTIONS = [
    'preface', 'acknowledgements', 'acknowledgments', 
    'notes for students', 'index', 'copyright', 'table of contents'
];

const isLikelyHeading = (paragraph) => {
    const clean = paragraph.trim();
    if (!clean || clean.length > 90) {
        return false;
    }

    if (clean.split(/\s+/).length > 12) {
        return false;
    }

    return HEADING_PATTERN.test(clean) && !clean.endsWith('.');
};

export const buildChunks = (text) => {
    const paragraphs = splitParagraphs(text);
    const semanticGroups = [];
    let current = [];
    let currentLength = 0;
    let currentSectionTitle = 'Introduction';

    paragraphs.forEach((paragraph) => {
        if (isLikelyHeading(paragraph)) {
            currentSectionTitle = paragraph.trim();
        }

        if (currentLength + paragraph.length > MAX_CHUNK_CHARS && current.length) {
            semanticGroups.push({
                content: current.join('\n\n'),
                sectionTitle: currentSectionTitle
            });
            current = [paragraph];
            currentLength = paragraph.length;
            return;
        }

        current.push(paragraph);
        currentLength += paragraph.length;
    });

    if (current.length) {
        semanticGroups.push({
            content: current.join('\n\n'),
            sectionTitle: currentSectionTitle
        });
    }

    const filteredGroups = semanticGroups.filter(group => {
        const lowerTitle = group.sectionTitle.toLowerCase();
        return !LOW_QUALITY_SECTIONS.some(lqs => lowerTitle.includes(lqs));
    });

    let chunks = [];
    let cursor = 0;

    filteredGroups.forEach((group, groupIndex) => {
        const normalized = normalizeWhitespace(group.content);
        if (!normalized) {
            return;
        }

        const step = Math.max(300, MAX_CHUNK_CHARS - OVERLAP_CHARS);
        for (let start = 0; start < normalized.length; start += step) {
            const content = normalized.slice(start, start + MAX_CHUNK_CHARS).trim();
            if (!content) {
                continue;
            }

            const localStart = normalized.indexOf(content, start);
            const charStart = cursor + Math.max(localStart, 0);
            const charEnd = charStart + content.length;

            chunks.push({
                content,
                tokenCount: tokenizeEstimate(content),
                charStart,
                charEnd,
                sectionTitle: group.sectionTitle,
                window: {
                    semanticGroup: groupIndex,
                    overlapFrom: Math.max(start - OVERLAP_CHARS, 0)
                }
            });
        }

        cursor += normalized.length + 2;
    });

    const maxTotalChunks = Number(process.env.MAX_TOTAL_CHUNKS_PER_DOC) || 400;
    
    // Chunk explosion protection
    if (chunks.length > maxTotalChunks) {
        logger.warn(`[Chunking] Chunk count ${chunks.length} exceeds max ${maxTotalChunks}. Dynamically merging adjacent chunks to enforce limit.`);
        const mergedChunks = [];
        const mergeFactor = Math.ceil(chunks.length / maxTotalChunks);
        
        for (let i = 0; i < chunks.length; i += mergeFactor) {
            const slice = chunks.slice(i, i + mergeFactor);
            const mergedContent = slice.map(c => c.content).join('\n\n');
            mergedChunks.push({
                ...slice[0],
                content: mergedContent,
                tokenCount: tokenizeEstimate(mergedContent),
                charEnd: slice[slice.length - 1].charEnd
            });
        }
        chunks = mergedChunks;
    }

    return chunks;
};
