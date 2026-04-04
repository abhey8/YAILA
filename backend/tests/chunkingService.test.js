import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { buildChunksFromPages, createChunkSession } from '../services/chunkingService.js';

const withChunkEnv = async (overrides, fn) => {
    const snapshot = {
        chunkMaxChars: env.chunkMaxChars,
        chunkOverlapChars: env.chunkOverlapChars,
        chunkMinChars: env.chunkMinChars,
        maxTotalChunksPerDoc: env.maxTotalChunksPerDoc,
        chunkHeadingMaxLength: env.chunkHeadingMaxLength
    };

    Object.assign(env, overrides);
    try {
        await fn();
    } finally {
        Object.assign(env, snapshot);
    }
};

test('buildChunksFromPages preserves section and page metadata', async () => {
    await withChunkEnv({
        chunkMaxChars: 180,
        chunkOverlapChars: 40,
        chunkMinChars: 80,
        maxTotalChunksPerDoc: 20
    }, async () => {
        const pages = [
            {
                pageNumber: 1,
                paragraphs: [
                    'BOOLEAN ALGEBRA',
                    'Boolean algebra studies algebraic structures for logic, proofs, and circuit design.',
                    'A literal is a variable or its negation and can be combined into clauses for reasoning.'
                ]
            },
            {
                pageNumber: 2,
                paragraphs: [
                    'KARNAUGH MAPS',
                    'Karnaugh maps simplify Boolean functions by grouping neighboring cells with shared truth assignments.',
                    'They help reduce redundant terms and make digital logic implementations easier to design.'
                ]
            }
        ];

        const chunks = buildChunksFromPages(pages);
        assert.ok(chunks.length >= 2);
        assert.equal(chunks[0].sectionTitle, 'BOOLEAN ALGEBRA');
        assert.equal(chunks[0].pageStart, 1);
        assert.ok(chunks.some((chunk) => chunk.pageEnd >= 2));
        assert.ok(chunks.every((chunk) => chunk.tokenCount > 0));
    });
});

test('chunk session can resume from exported state without resetting indexes', async () => {
    await withChunkEnv({
        chunkMaxChars: 140,
        chunkOverlapChars: 30,
        chunkMinChars: 70,
        maxTotalChunksPerDoc: 20
    }, async () => {
        const firstSession = createChunkSession();
        const emittedBeforeCheckpoint = firstSession.ingestPage({
            pageNumber: 1,
            paragraphs: [
                'PREDICATE LOGIC',
                'Predicate logic extends propositional logic with variables, domains, and quantifiers.',
                'It allows reasoning about all objects or some objects in a domain.'
            ]
        });
        const checkpoint = firstSession.exportState();

        const resumedSession = createChunkSession(checkpoint);
        const emittedAfterCheckpoint = resumedSession.ingestPage({
            pageNumber: 2,
            paragraphs: [
                'NORMAL FORMS',
                'Conjunctive normal form and disjunctive normal form reorganize formulas into standard structures.',
                'These normal forms make proofs, satisfiability checks, and derivations more systematic.'
            ]
        });
        const trailing = resumedSession.flush();

        const allChunks = [
            ...emittedBeforeCheckpoint,
            ...emittedAfterCheckpoint,
            ...trailing
        ];

        assert.ok(allChunks.length >= 2);
        const chunkIndexes = allChunks.map((chunk) => chunk.chunkIndex);
        assert.deepEqual(chunkIndexes, [...new Set(chunkIndexes)].sort((left, right) => left - right));
        assert.ok(Math.max(...chunkIndexes) >= emittedBeforeCheckpoint.length);
    });
});
