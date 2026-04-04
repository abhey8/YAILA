import test from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '@msgpack/msgpack';
import { env } from '../config/env.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { createEndeeVectorStore } from '../services/vectorStores/endeeVectorStore.js';
import { createMongoVectorStore } from '../services/vectorStores/mongoVectorStore.js';

test('Endee vector store creates an index, inserts vectors, and hydrates search results', async () => {
    const snapshot = {
        endeeBaseUrl: env.endeeBaseUrl,
        endeeAuthToken: env.endeeAuthToken,
        endeeIndexName: env.endeeIndexName,
        vectorStoreNamespace: env.vectorStoreNamespace,
        endeeEfSearch: env.endeeEfSearch,
        endeeIncludeVectors: env.endeeIncludeVectors
    };
    const originalFetch = global.fetch;
    const originalFindByVectorIds = chunkRepository.findByVectorIds;

    env.endeeBaseUrl = 'http://endee.test';
    env.endeeAuthToken = '';
    env.endeeIndexName = 'chunks';
    env.vectorStoreNamespace = 'test';
    env.endeeEfSearch = 24;
    env.endeeIncludeVectors = false;

    const calls = [];
    global.fetch = async (url, options = {}) => {
        calls.push({ url, options });

        if (url.endsWith('/info')) {
            return new Response(JSON.stringify({ error: 'Index not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (url.endsWith('/create')) {
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (url.endsWith('/vector/insert')) {
            const payload = JSON.parse(options.body);
            assert.equal(payload.length, 1);
            assert.equal(payload[0].id, 'doc-1:0');
            return new Response('', { status: 200 });
        }

        if (url.endsWith('/search')) {
            const payload = JSON.parse(options.body);
            assert.equal(payload.k, 3);
            assert.ok(payload.filter.includes('documentId'));

            const body = Buffer.from(encode({
                results: [{
                    similarity: 0.93,
                    id: 'doc-1:0',
                    meta: new TextEncoder().encode(JSON.stringify({
                        documentId: 'doc-1',
                        userId: 'user-1',
                        chunkIndex: 0,
                        sectionTitle: 'Logic',
                        pageStart: 4,
                        pageEnd: 4
                    })),
                    filter: '',
                    norm: 1,
                    vector: []
                }]
            }));

            return new Response(body, {
                status: 200,
                headers: { 'Content-Type': 'application/msgpack' }
            });
        }

        throw new Error(`Unexpected URL ${url}`);
    };

    chunkRepository.findByVectorIds = async () => [{
        vectorId: 'doc-1:0',
        document: 'doc-1',
        user: 'user-1',
        chunkIndex: 0,
        content: 'Biconditional means if and only if.',
        summary: 'Definition of biconditional',
        keywords: ['biconditional'],
        sectionTitle: 'Logic',
        pageStart: 4,
        pageEnd: 4,
        sourceName: 'logic.pdf'
    }];

    try {
        const store = createEndeeVectorStore({ fallbackStore: createMongoVectorStore() });
        await store.upsertChunks([{
            vectorId: 'doc-1:0',
            document: 'doc-1',
            user: 'user-1',
            chunkIndex: 0,
            content: 'Biconditional means if and only if.',
            summary: 'Definition of biconditional',
            keywords: ['biconditional'],
            sectionTitle: 'Logic',
            pageStart: 4,
            pageEnd: 4,
            sourceName: 'logic.pdf',
            tokenCount: 12,
            embedding: [0.1, 0.2, 0.3]
        }]);

        const results = await store.search({
            userId: 'user-1',
            documentIds: ['doc-1'],
            queryEmbedding: [0.1, 0.2, 0.3],
            topK: 3
        });

        assert.equal(results.length, 1);
        assert.equal(results[0].semanticScore, 0.93);
        assert.equal(results[0].sectionTitle, 'Logic');
        assert.ok(calls.some((call) => call.url.endsWith('/create')));
        assert.ok(calls.some((call) => call.url.endsWith('/search')));
    } finally {
        Object.assign(env, snapshot);
        global.fetch = originalFetch;
        chunkRepository.findByVectorIds = originalFindByVectorIds;
    }
});
