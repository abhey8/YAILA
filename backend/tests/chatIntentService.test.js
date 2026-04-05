import test from 'node:test';
import assert from 'node:assert/strict';
import {
    detectChatIntent,
    normalizeChatText,
    shouldReturnNotFound,
    shouldUseOverviewContext
} from '../services/chatIntentService.js';
import { routePedagogicalMode } from '../services/pedagogicalModeRouterService.js';

test('normalizeChatText expands common study shorthand and typos', () => {
    assert.equal(normalizeChatText('ask qs frm the doc'), 'ask questions from the document');
    assert.equal(normalizeChatText('summrize this chptr'), 'summarize this chapter');
    assert.equal(normalizeChatText('wht do i study frm this'), 'what do i study from this');
});

test('detectChatIntent classifies typo-heavy practice prompts as question generation', () => {
    const result = detectChatIntent({
        message: 'gve theory qns frm the doc',
        hasDocumentContext: true
    });

    assert.equal(result.intentClass, 'question_generation');
    assert.equal(result.questionStyle, 'theory');
    assert.equal(shouldUseOverviewContext(result.intentClass), true);
});

test('detectChatIntent routes overview and study-guide prompts safely', () => {
    assert.equal(
        detectChatIntent({ message: 'what should I study from this', hasDocumentContext: true }).intentClass,
        'study_guidance'
    );
    assert.equal(
        detectChatIntent({ message: 'what are the key concepts in this doc', hasDocumentContext: true }).intentClass,
        'overview_summary'
    );
});

test('detectChatIntent preserves factual doc QA and not-found policy only for answer-style queries', () => {
    const factual = detectChatIntent({
        message: 'what do i have to fill in this application',
        hasDocumentContext: true
    });
    const generation = detectChatIntent({
        message: 'ask me practice questions from this pdf',
        hasDocumentContext: true
    });

    assert.equal(factual.intentClass, 'factual_doc_qa');
    assert.equal(shouldReturnNotFound(factual.intentClass), true);
    assert.equal(shouldReturnNotFound(generation.intentClass), false);
});

test('pedagogical mode router maps normalized question prompts into question generation mode', () => {
    const modePlan = routePedagogicalMode({
        message: 'ask qs frm the doc',
        history: []
    });

    assert.equal(modePlan.mode, 'question_generation');
});
