import { chunkRepository } from '../repositories/chunkRepository.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { generateText } from './aiService.js';
import { filterStudyWorthChunks, filterStudyWorthConcepts } from '../lib/studyContent.js';
import { logger } from '../lib/logger.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { selectPromptExcerpts } from '../lib/promptSources.js';

const inFlightSummaries = new Set();

const isSummaryTooShort = (text = '') => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean).length;
    return words < 140 || lines < 5;
};

const cleanSummaryFormatting = (text = '') => text
    .replace(/\r/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[=-]{3,}\s*$/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[\t ]*\+\s+/gm, '- ')
    .replace(/^\s*[*•]\s+/gm, '- ')
    .replace(/\t+/g, '  ')
    .replace(/[ ]{3,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const buildStructuredSummaryFallback = (document, chunks, concepts = []) => {
    const safeChunks = filterStudyWorthChunks(chunks).slice(0, 24);
    const sectionTitles = [...new Set(
        safeChunks
            .map((chunk) => `${chunk.sectionTitle || ''}`.trim())
            .filter((title) => title && title.toLowerCase() !== 'untitled section')
    )].slice(0, 8);
    const keywords = [...new Set(
        safeChunks.flatMap((chunk) => Array.isArray(chunk.keywords) ? chunk.keywords : [])
    )].slice(0, 12);
    const conceptNames = concepts.map((concept) => concept.name).slice(0, 12);
    const methodChunks = safeChunks
        .filter((chunk) => /(proof|theorem|example|method|algorithm|rule|law)/i.test(`${chunk.sectionTitle || ''} ${chunk.summary || chunk.content || ''}`))
        .slice(0, 5);
    const overviewChunks = safeChunks.slice(0, 4);
    const reviseChunks = safeChunks
        .slice(0, 6)
        .sort((left, right) => (right.tokenCount || 0) - (left.tokenCount || 0))
        .slice(0, 4);

    return [
        'Overview:',
        ...overviewChunks.map((chunk) => `- ${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 220)}`),
        '',
        'Main Topics:',
        ...(sectionTitles.length ? sectionTitles.map((title) => `- ${title}`) : ['- Key sections are still being identified from the document content.']),
        '',
        'Key Concepts and Definitions:',
        ...(conceptNames.length ? conceptNames.map((name) => `- ${name}`) : keywords.map((keyword) => `- ${keyword}`)),
        '',
        'Important Methods, Proofs, or Examples:',
        ...(methodChunks.length ? methodChunks.map((chunk) => `- ${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 220)}`) : ['- No explicit method/proof/example section was confidently extracted from the current chunks.']),
        '',
        'What to Revise First:',
        ...(reviseChunks.length ? reviseChunks.map((chunk) => `- Review ${chunk.sectionTitle || 'this section'}: ${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 180)}`) : [`- Start with the most central ideas in ${document.title}.`])
    ].join('\n').trim();
};

const buildPrompt = ({ document, chunks, concepts }) => {
    const chunkSummaries = chunks
        .slice(0, 26)
        .map((chunk) => `- ${chunk.sectionTitle || 'Section'} (pages ${chunk.pageStart || 1}-${chunk.pageEnd || chunk.pageStart || 1}): ${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 260)}`)
        .join('\n');

    const conceptList = concepts
        .slice(0, 14)
        .map((concept) => `- ${concept.name}: ${`${concept.description || ''}`.replace(/\s+/g, ' ').trim().slice(0, 120)}`)
        .join('\n');

    return `You are an expert tutor creating a high-quality study guide from a textbook or course document.
Document title: ${document.title || document.originalName}

Use the section summaries and concept list below to build a broad, useful, study-ready summary.

Write these exact sections:
1. Overview
2. Main Topics Covered
3. Core Concepts and Definitions
4. Important Methods, Theorems, or Applications
5. How to Study This Document

Requirements:
- Make the answer detailed and meaningful.
- Cover the breadth of the document, not just one section.
- Mention the real math topics, themes, methods, and applications visible in the source.
- Use clear plain text only.
- Do not use markdown symbols like ** or #.
- Use short headings and concise bullets or short paragraphs.
- Prefer the strongest academic topics, definitions, methods, and proof ideas over front matter or administrative material.

Section summaries:
${chunkSummaries}

Concept list:
${conceptList || 'No concept list available.'}`;
};

export const generateDocumentSummary = async (document, { force = false } = {}) => {
    if (!document) {
        throw new Error('Document is required');
    }

    if (document.summary && !force) {
        if (document.summaryStatus !== 'ready') {
            document.summaryStatus = 'ready';
            document.summaryError = null;
            document.summaryUpdatedAt = document.summaryUpdatedAt || new Date();
            await documentRepository.save(document);
        }
        return document.summary;
    }

    const chunkSource = document.chunkCount > 80
        ? await chunkRepository.sampleByDocument(document._id, 42)
        : await chunkRepository.listByDocument(document._id);
    const chunks = selectPromptExcerpts({
        candidates: filterStudyWorthChunks(chunkSource),
        maxChunks: 26,
        maxPerSection: 2,
        maxPerDocument: 26
    });
    if (!chunks.length) {
        throw new Error('Summary source content is not available yet');
    }

    const concepts = filterStudyWorthConcepts(await conceptRepository.listByDocument(document._id));

    let summary = '';
    try {
        summary = await generateText(buildPrompt({ document, chunks, concepts }), { maxTokens: 720 });

        if (isSummaryTooShort(summary)) {
            summary = await generateText(`Improve the summary below.
Keep the same 5 sections, but make it more complete, more readable, and more grounded in the document.
Use plain text only.

Current summary:
${summary}

Reference concept list:
${concepts.slice(0, 14).map((concept) => `- ${concept.name}`).join('\n')}`, { maxTokens: 760 });
        }
    } catch (error) {
        logger.warn('[Summary] Falling back to structured summary', {
            documentId: document._id.toString(),
            error: error.message
        });
        summary = buildStructuredSummaryFallback(document, chunks, concepts);
    }

    summary = cleanSummaryFormatting(summary);
    if (isSummaryTooShort(summary)) {
        summary = buildStructuredSummaryFallback(document, chunks, concepts);
    }

    document.summary = summary;
    document.summaryStatus = 'ready';
    document.summaryError = null;
    document.summaryUpdatedAt = new Date();
    await documentRepository.save(document);

    return summary;
};

const processSummaryJob = async (documentId, options = {}) => {
    const key = `${documentId}`;
    if (inFlightSummaries.has(key)) {
        return;
    }

    inFlightSummaries.add(key);
    try {
        const document = await documentRepository.findById(documentId);
        if (!document || document.ingestionStatus !== 'completed') {
            return;
        }

        document.summaryStatus = 'generating';
        document.summaryError = null;
        await documentRepository.save(document);

        await generateDocumentSummary(document, options);
    } catch (error) {
        const document = await documentRepository.findById(documentId);
        if (document) {
            document.summaryStatus = 'failed';
            document.summaryError = error.message;
            await documentRepository.save(document);
        }
        logger.warn('[Summary] Background summary generation failed', {
            documentId: `${documentId}`,
            error: error.message
        });
    } finally {
        inFlightSummaries.delete(key);
    }
};

export const scheduleDocumentSummary = (documentId, options = {}) => {
    setImmediate(() => {
        processSummaryJob(documentId, options).catch((error) => {
            logger.warn('[Summary] Failed to start background summary generation', {
                documentId: `${documentId}`,
                error: error.message
            });
        });
    });
};

export const resumePendingSummaries = async () => {
    const documents = await documentRepository.listDocumentsNeedingSummary();
    documents.forEach((document) => {
        scheduleDocumentSummary(document._id);
    });
};
