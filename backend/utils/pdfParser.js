import { pathToFileURL } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { logger } from '../lib/logger.js';
import { normalizeWhitespace } from '../lib/text.js';

const LINE_Y_TOLERANCE = 2.4;
const MAX_PARAGRAPH_LINES = 12;
const WORD_GAP_THRESHOLD = 4;

const toTextItem = (item) => ({
    raw: `${item?.str || ''}`.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''),
    text: `${item?.str || ''}`.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''),
    x: Number(item?.transform?.[4] || 0),
    y: Number(item?.transform?.[5] || 0),
    width: Number(item?.width || 0)
});

const finalizeLine = (line) => ({
    y: line.y,
    text: normalizeWhitespace(line.text)
});

const groupItemsIntoLines = (items = []) => {
    const normalized = items
        .map(toTextItem)
        .filter((item) => item.raw);

    if (!normalized.length) {
        return [];
    }

    normalized.sort((left, right) => {
        if (Math.abs(right.y - left.y) > LINE_Y_TOLERANCE) {
            return right.y - left.y;
        }
        return left.x - right.x;
    });

    const lines = [];
    let currentLine = null;

    normalized.forEach((item) => {
        if (!currentLine || Math.abs(currentLine.y - item.y) > LINE_Y_TOLERANCE) {
            if (currentLine?.parts?.length) {
                lines.push(finalizeLine(currentLine));
            }
            currentLine = {
                y: item.y,
                lastRight: item.x + item.width,
                parts: [item.text],
                text: /^\s+$/.test(item.text) ? '' : item.text
            };
            return;
        }

        const gap = item.x - currentLine.lastRight;
        const rawText = item.text;
        const isWhitespace = /^\s+$/.test(rawText);
        const normalizedText = rawText.replace(/\s+/g, ' ');

        currentLine.parts.push(rawText);
        if (isWhitespace) {
            if (currentLine.text && !currentLine.text.endsWith(' ')) {
                currentLine.text += ' ';
            }
        } else {
            const shouldInsertSpace = currentLine.text
                && !currentLine.text.endsWith(' ')
                && gap > WORD_GAP_THRESHOLD
                && !/^[,.;:!?)]/.test(normalizedText);
            currentLine.text += `${shouldInsertSpace ? ' ' : ''}${normalizedText}`;
        }
        currentLine.lastRight = item.x + item.width;
    });

    if (currentLine?.parts?.length) {
        lines.push(finalizeLine(currentLine));
    }

    return lines.filter((line) => line.text);
};

const median = (values = []) => {
    if (!values.length) {
        return 12;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
};

const linesToParagraphs = (lines = []) => {
    if (!lines.length) {
        return [];
    }

    const gaps = [];
    for (let index = 1; index < lines.length; index += 1) {
        const gap = Math.abs(lines[index - 1].y - lines[index].y);
        if (gap > 0.5) {
            gaps.push(gap);
        }
    }

    const baselineGap = median(gaps);
    const paragraphBreakThreshold = baselineGap * 1.8;
    const paragraphs = [];
    let buffer = [];
    let pageStartY = null;

    const flush = () => {
        if (!buffer.length) {
            return;
        }
        paragraphs.push({
            text: normalizeWhitespace(buffer.join(' ')),
            y: pageStartY ?? 0
        });
        buffer = [];
        pageStartY = null;
    };

    lines.forEach((line, index) => {
        const previous = lines[index - 1];
        const gap = previous ? Math.abs(previous.y - line.y) : 0;
        const forceBreak = buffer.length > 0 && (
            gap > paragraphBreakThreshold
            || buffer.length >= MAX_PARAGRAPH_LINES
            || /^[-•*]/.test(line.text)
        );

        if (forceBreak) {
            flush();
        }

        if (!pageStartY) {
            pageStartY = line.y;
        }

        buffer.push(line.text);
    });

    flush();
    return paragraphs.filter((paragraph) => paragraph.text);
};

export const openPdfDocument = async (filePath) => {
    const loadingTask = getDocument({
        url: pathToFileURL(filePath).href,
        isEvalSupported: false,
        useSystemFonts: true,
        disableFontFace: true
    });

    const pdf = await loadingTask.promise;
    return {
        pdf,
        pageCount: pdf.numPages || 0,
        async close() {
            await loadingTask.destroy();
        }
    };
};

export const extractPdfPage = async (pdf, pageNumber) => {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = groupItemsIntoLines(textContent.items || []);
    const paragraphs = linesToParagraphs(lines);
    const text = paragraphs.map((paragraph) => paragraph.text).join('\n\n').trim();

    return {
        pageNumber,
        text,
        lines: lines.map((line) => line.text),
        paragraphs: paragraphs.map((paragraph) => paragraph.text),
        charCount: text.length
    };
};

export const iteratePdfPages = async function* (filePath, options = {}) {
    const startPage = Math.max(1, Number(options.startPage) || 1);
    const opened = await openPdfDocument(filePath);
    try {
        for (let pageNumber = startPage; pageNumber <= opened.pageCount; pageNumber += 1) {
            yield extractPdfPage(opened.pdf, pageNumber);
        }
    } finally {
        await opened.close();
    }
};

export const getPdfPageCount = async (filePath) => {
    const opened = await openPdfDocument(filePath);
    try {
        return opened.pageCount;
    } finally {
        await opened.close();
    }
};

export const extractTextFromPDF = async (filePath) => {
    try {
        let pageCount = 0;
        const parts = [];
        for await (const pagePromise of iteratePdfPages(filePath)) {
            const page = await pagePromise;
            pageCount = Math.max(pageCount, page.pageNumber);
            if (page.text) {
                parts.push(page.text);
            }
        }
        return {
            text: parts.join('\n\n').trim(),
            pageCount
        };
    } catch (error) {
        logger.warn('[PDF Parser] Failed to extract text', { error: error.message });
        throw new Error('Failed to extract text from PDF');
    }
};
