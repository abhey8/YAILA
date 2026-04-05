import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCacheKey } from '../services/aiCacheService.js';

test('generateCacheKey isolates cache entries across documents, users, models, and modes', () => {
    const basePayload = {
        version: 'chat-v3',
        prompt: 'what is this document about',
        history: 'USER: what is this document about',
        documentIds: ['doc-a'],
        userId: 'user-1',
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        intentClass: 'overview_summary',
        questionStyle: 'general'
    };

    const same = generateCacheKey(basePayload);
    const differentDoc = generateCacheKey({ ...basePayload, documentIds: ['doc-b'] });
    const differentUser = generateCacheKey({ ...basePayload, userId: 'user-2' });
    const differentModel = generateCacheKey({ ...basePayload, model: 'gemini-2.5-flash' });
    const differentMode = generateCacheKey({ ...basePayload, intentClass: 'question_generation' });

    assert.equal(generateCacheKey(basePayload), same);
    assert.notEqual(same, differentDoc);
    assert.notEqual(same, differentUser);
    assert.notEqual(same, differentModel);
    assert.notEqual(same, differentMode);
});
