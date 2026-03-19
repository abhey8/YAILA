import { normalizeWhitespace, splitParagraphs, tokenizeEstimate } from '../lib/text.js';

const MAX_CHUNK_CHARS = 1400;
const OVERLAP_CHARS = 250;

export const buildChunks = (text) => {
    const paragraphs = splitParagraphs(text);
    const semanticGroups = [];
    let current = [];
    let currentLength = 0;

    paragraphs.forEach((paragraph) => {
        if (currentLength + paragraph.length > MAX_CHUNK_CHARS && current.length) {
            semanticGroups.push(current.join('\n\n'));
            current = [paragraph];
            currentLength = paragraph.length;
            return;
        }

        current.push(paragraph);
        currentLength += paragraph.length;
    });

    if (current.length) {
        semanticGroups.push(current.join('\n\n'));
    }

    const chunks = [];
    let cursor = 0;

    semanticGroups.forEach((group, groupIndex) => {
        const normalized = normalizeWhitespace(group);
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
                window: {
                    semanticGroup: groupIndex,
                    overlapFrom: Math.max(start - OVERLAP_CHARS, 0)
                }
            });
        }

        cursor += normalized.length + 2;
    });

    return chunks;
};
