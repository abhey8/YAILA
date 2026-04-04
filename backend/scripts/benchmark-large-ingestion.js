import { performance } from 'node:perf_hooks';
import { env } from '../config/env.js';
import { buildChunksFromPages } from '../services/chunkingService.js';

const pageCount = Number(process.env.BENCHMARK_PAGE_COUNT || 1200);
const paragraphsPerPage = Number(process.env.BENCHMARK_PARAGRAPHS_PER_PAGE || 5);

const buildSyntheticPage = (pageNumber) => ({
    pageNumber,
    paragraphs: [
        `CHAPTER ${Math.floor((pageNumber - 1) / 40) + 1}`,
        ...Array.from({ length: paragraphsPerPage }, (_, index) => (
            `Page ${pageNumber} paragraph ${index + 1}. Boolean logic, quantifiers, proofs, derivations, and truth tables are discussed here in enough detail to create meaningful retrieval chunks for benchmarking.`
        ))
    ]
});

const buildNaiveChunks = (pages) => {
    const text = pages
        .flatMap((page) => page.paragraphs)
        .join('\n\n');

    const size = env.chunkMaxChars;
    const overlap = env.chunkOverlapChars;
    const step = Math.max(200, size - overlap);
    const chunks = [];
    for (let start = 0; start < text.length; start += step) {
        const content = text.slice(start, start + size).trim();
        if (content) {
            chunks.push(content);
        }
    }
    return chunks;
};

const simulateStreamingBuffers = (pages) => {
    let peakBufferedChars = 0;
    let currentBufferedChars = 0;

    pages.forEach((page, index) => {
        const pageChars = page.paragraphs.join('\n\n').length;
        currentBufferedChars += pageChars;
        peakBufferedChars = Math.max(peakBufferedChars, currentBufferedChars);

        if ((index + 1) % env.ingestionPageBatchSize === 0) {
            currentBufferedChars = 0;
        }
    });

    peakBufferedChars = Math.max(peakBufferedChars, currentBufferedChars);
    return peakBufferedChars;
};

const pages = Array.from({ length: pageCount }, (_, index) => buildSyntheticPage(index + 1));
const fullTextChars = pages.flatMap((page) => page.paragraphs).join('\n\n').length;

const naiveStart = performance.now();
const naiveChunks = buildNaiveChunks(pages);
const naiveElapsed = performance.now() - naiveStart;

const streamingStart = performance.now();
const streamingChunks = buildChunksFromPages(pages);
const streamingElapsed = performance.now() - streamingStart;

console.log(JSON.stringify({
    pageCount,
    paragraphsPerPage,
    legacy: {
        chunkCount: naiveChunks.length,
        peakBufferedChars: fullTextChars,
        embeddingCalls: naiveChunks.length,
        writeCalls: naiveChunks.length,
        elapsedMs: Math.round(naiveElapsed)
    },
    streaming: {
        chunkCount: streamingChunks.length,
        peakBufferedChars: simulateStreamingBuffers(pages),
        embeddingCalls: Math.ceil(streamingChunks.length / env.embeddingBatchSize),
        writeCalls: Math.ceil(streamingChunks.length / env.ingestionChunkBatchSize),
        elapsedMs: Math.round(streamingElapsed)
    }
}, null, 2));
