import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { embedTexts } from '../services/aiService.js';

test('embedTexts falls back to local embeddings when Gemini is unavailable', async () => {
    const snapshot = {
        geminiApiKey: env.geminiApiKey,
        localEmbeddingFallbackEnabled: env.localEmbeddingFallbackEnabled
    };

    env.geminiApiKey = '';
    env.localEmbeddingFallbackEnabled = true;

    try {
        const vectors = await embedTexts(['logic gates', 'boolean algebra']);
        assert.equal(vectors.length, 2);
        assert.ok(Array.isArray(vectors[0]));
        assert.ok(vectors[0].length > 0);
    } finally {
        Object.assign(env, snapshot);
    }
});
