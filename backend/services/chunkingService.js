import { env } from '../config/env.js';
import { normalizeWhitespace, splitParagraphs, tokenizeEstimate } from '../lib/text.js';
import { logger } from '../lib/logger.js';
import { isLowValueStudyText } from '../lib/studyContent.js';

const LOW_QUALITY_SECTIONS = [
    'preface',
    'acknowledgements',
    'acknowledgments',
    'notes for students',
    'index',
    'copyright',
    'table of contents'
];

const DEFAULT_SECTION_TITLE = 'Introduction';

const HEADING_PATTERN = /^([A-Z0-9][A-Za-z0-9\s,.:;()/-]{2,120}|(?:\d+\.)+\d*\s+[A-Z][A-Za-z0-9\s,.:;()/-]{2,120})$/;

const resolveChunkConfig = () => ({
    maxChars: env.chunkMaxChars,
    overlapChars: env.chunkOverlapChars,
    minChars: env.chunkMinChars,
    maxTotalChunks: env.maxTotalChunksPerDoc,
    headingMaxLength: env.chunkHeadingMaxLength
});

const isLikelyHeading = (paragraph, config) => {
    const clean = normalizeWhitespace(paragraph);
    if (!clean || clean.length > config.headingMaxLength) {
        return false;
    }

    if (clean.split(/\s+/).length > 12) {
        return false;
    }

    return HEADING_PATTERN.test(clean) && !clean.endsWith('.');
};

const splitLongParagraph = (paragraph = '', maxChars = 1400) => {
    const clean = normalizeWhitespace(paragraph);
    if (clean.length <= maxChars) {
        return [clean];
    }

    const sentences = clean
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => normalizeWhitespace(sentence))
        .filter(Boolean);

    if (sentences.length <= 1) {
        const parts = [];
        for (let start = 0; start < clean.length; start += maxChars) {
            parts.push(clean.slice(start, start + maxChars).trim());
        }
        return parts.filter(Boolean);
    }

    const parts = [];
    let current = '';

    sentences.forEach((sentence) => {
        const candidate = current ? `${current} ${sentence}` : sentence;
        if (candidate.length > maxChars && current) {
            parts.push(current.trim());
            current = sentence;
            return;
        }
        current = candidate;
    });

    if (current.trim()) {
        parts.push(current.trim());
    }

    return parts.filter(Boolean);
};

const pickOverlapParagraphs = (paragraphs = [], overlapChars = 0) => {
    if (!paragraphs.length || overlapChars <= 0) {
        return [];
    }

    const selected = [];
    let usedChars = 0;

    for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
        const paragraph = paragraphs[index];
        if (!paragraph || paragraph.isHeading) {
            continue;
        }

        selected.unshift({
            text: paragraph.text,
            pageNumber: paragraph.pageNumber,
            isOverlap: true
        });
        usedChars += paragraph.text.length;

        if (usedChars >= overlapChars) {
            break;
        }
    }

    return selected;
};

const toChunkPayload = ({
    paragraphs,
    sectionTitle,
    chunkIndex,
    charCursor,
    semanticGroup
}) => {
    const content = normalizeWhitespace(paragraphs.map((paragraph) => paragraph.text).join('\n\n'));
    if (!content) {
        return null;
    }

    const pageStart = Math.min(...paragraphs.map((paragraph) => paragraph.pageNumber || 1));
    const pageEnd = Math.max(...paragraphs.map((paragraph) => paragraph.pageNumber || 1));
    const charStart = charCursor;
    const charEnd = charCursor + content.length;

    return {
        chunkIndex,
        content,
        tokenCount: tokenizeEstimate(content),
        charStart,
        charEnd,
        sectionTitle: sectionTitle || DEFAULT_SECTION_TITLE,
        pageStart,
        pageEnd,
        window: {
            semanticGroup,
            overlapFrom: Math.max(0, charStart - env.chunkOverlapChars)
        }
    };
};

export const createChunkSession = (options = {}) => {
    const config = resolveChunkConfig();
    let currentSectionTitle = options.currentSectionTitle || DEFAULT_SECTION_TITLE;
    let chunkIndex = Number(options.nextChunkIndex || options.chunkIndex || 0);
    let charCursor = Number(options.charCursor || 0);
    let semanticGroup = Number(options.semanticGroup || 0);
    let currentParagraphs = Array.isArray(options.pendingParagraphs)
        ? options.pendingParagraphs
            .map((paragraph) => ({
                text: normalizeWhitespace(paragraph.text || ''),
                pageNumber: Number(paragraph.pageNumber || 1),
                isHeading: Boolean(paragraph.isHeading)
            }))
            .filter((paragraph) => paragraph.text)
        : [];
    let currentLength = currentParagraphs.reduce((sum, paragraph) => sum + paragraph.text.length, 0);

    const emitCurrentChunk = (force = false) => {
        if (!currentParagraphs.length) {
            return [];
        }

        const chunk = toChunkPayload({
            paragraphs: currentParagraphs,
            sectionTitle: currentSectionTitle,
            chunkIndex,
            charCursor,
            semanticGroup
        });

        if (!chunk) {
            currentParagraphs = [];
            currentLength = 0;
            return [];
        }

        const lowerTitle = `${chunk.sectionTitle || ''}`.toLowerCase();
        if (!force && chunk.content.length < config.minChars) {
            return [];
        }

        const shouldSkip = LOW_QUALITY_SECTIONS.some((section) => lowerTitle.includes(section))
            || isLowValueStudyText(chunk.content, chunk.sectionTitle);

        const overlapParagraphs = pickOverlapParagraphs(currentParagraphs, config.overlapChars);
        currentParagraphs = overlapParagraphs;
        currentLength = currentParagraphs.reduce((sum, paragraph) => sum + paragraph.text.length, 0);
        chunkIndex += 1;
        charCursor = chunk.charEnd + 2;

        if (shouldSkip) {
            return [];
        }

        return [chunk];
    };

    const ingestParagraph = (paragraph, pageNumber) => {
        const emitted = [];

        splitLongParagraph(paragraph, config.maxChars).forEach((part) => {
            const clean = normalizeWhitespace(part);
            if (!clean) {
                return;
            }

            if (isLikelyHeading(clean, config)) {
                emitted.push(...emitCurrentChunk(true));
                currentSectionTitle = clean;
                semanticGroup += 1;
                currentParagraphs = [{
                    text: clean,
                    pageNumber,
                    isHeading: true
                }];
                currentLength = clean.length;
                return;
            }

            const nextLength = currentLength + clean.length + (currentParagraphs.length ? 2 : 0);
            if (
                currentParagraphs.length
                && currentLength >= config.minChars
                && nextLength > config.maxChars
            ) {
                emitted.push(...emitCurrentChunk(true));
            }

            currentParagraphs.push({
                text: clean,
                pageNumber,
                isHeading: false
            });
            currentLength += clean.length + 2;

            if (currentLength >= config.maxChars * 1.2) {
                emitted.push(...emitCurrentChunk(true));
            }
        });

        return emitted;
    };

    return {
        ingestPage(page = {}) {
            const pageNumber = Number(page.pageNumber || 1);
            const paragraphs = Array.isArray(page.paragraphs) ? page.paragraphs : [];
            return paragraphs.flatMap((paragraph) => ingestParagraph(paragraph, pageNumber));
        },

        flush() {
            return emitCurrentChunk(true);
        },

        exportState() {
            return {
                currentSectionTitle,
                nextChunkIndex: chunkIndex,
                charCursor,
                semanticGroup,
                pendingParagraphs: currentParagraphs.map((paragraph) => ({
                    text: paragraph.text,
                    pageNumber: paragraph.pageNumber,
                    isHeading: paragraph.isHeading
                }))
            };
        }
    };
};

export const buildChunksFromPages = (pages = [], options = {}) => {
    const session = createChunkSession(options);
    const chunks = [];

    pages.forEach((page) => {
        chunks.push(...session.ingestPage(page));
    });
    chunks.push(...session.flush());

    const config = resolveChunkConfig();
    if (chunks.length > config.maxTotalChunks) {
        logger.warn(`[Chunking] Chunk count ${chunks.length} exceeds max ${config.maxTotalChunks}. Dynamically merging adjacent chunks to enforce limit.`);
        const mergedChunks = [];
        const mergeFactor = Math.ceil(chunks.length / config.maxTotalChunks);

        for (let index = 0; index < chunks.length; index += mergeFactor) {
            const slice = chunks.slice(index, index + mergeFactor);
            const mergedContent = slice.map((chunk) => chunk.content).join('\n\n');
            mergedChunks.push({
                ...slice[0],
                content: mergedContent,
                tokenCount: tokenizeEstimate(mergedContent),
                charEnd: slice[slice.length - 1].charEnd,
                pageEnd: slice[slice.length - 1].pageEnd
            });
        }

        return mergedChunks.map((chunk, index) => ({
            ...chunk,
            chunkIndex: index
        }));
    }

    return chunks.map((chunk, index) => ({
        ...chunk,
        chunkIndex: index
    }));
};

export const buildChunks = (text) => {
    const paragraphs = splitParagraphs(text)
        .map((paragraph) => ({
            pageNumber: 1,
            paragraphs: [paragraph]
        }));

    return buildChunksFromPages(paragraphs);
};
