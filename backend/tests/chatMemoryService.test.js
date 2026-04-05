import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRollingSummary, mergeConversationHistory } from '../services/chatMemoryService.js';

test('mergeConversationHistory keeps recent continuity without duplicate adjacent turns', () => {
    const merged = mergeConversationHistory({
        persistedMessages: [
            { role: 'user', content: 'Summarize chapter 3' },
            { role: 'ai', content: 'Chapter 3 covers pumping lemma basics.' },
            { role: 'user', content: 'Summarize chapter 3' }
        ],
        requestHistory: [
            { role: 'user', content: 'Summarize chapter 3' },
            { role: 'ai', content: 'Chapter 3 covers pumping lemma basics.' },
            { role: 'user', content: 'Ask me practice questions from it' }
        ]
    });

    assert.deepEqual(merged.slice(-3), [
        { role: 'user', content: 'Summarize chapter 3' },
        { role: 'ai', content: 'Chapter 3 covers pumping lemma basics.' },
        { role: 'user', content: 'Ask me practice questions from it' }
    ]);
});

test('buildRollingSummary keeps recent goals, answers, and cited sections in bounded form', () => {
    const summary = buildRollingSummary({
        existingSummary: 'Working through chapter summaries for automata theory.',
        messages: [
            {
                role: 'user',
                content: 'Summarize the important parts of chapter 3 for me',
                citations: [{ documentTitle: 'Automata', sectionTitle: 'Pumping Lemma' }]
            },
            {
                role: 'ai',
                content: 'Chapter 3 focuses on regular languages, pumping lemma, and closure properties.',
                citations: [{ documentTitle: 'Automata', sectionTitle: 'Regular Languages' }]
            },
            {
                role: 'user',
                content: 'Now ask me viva questions from the same chapter'
            }
        ]
    });

    assert.match(summary, /Recent user goals:/);
    assert.match(summary, /Recent tutor support:/);
    assert.match(summary, /Relevant sections:/);
    assert.match(summary, /viva questions/i);
});
