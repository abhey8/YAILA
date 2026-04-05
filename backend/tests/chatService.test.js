import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ChatHistory from '../models/ChatHistory.js';
import { env } from '../config/env.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { chatWithDocuments } from '../services/chatService.js';
import { tutorOrchestrator } from '../services/tutorOrchestratorService.js';

const makeObjectId = () => new mongoose.Types.ObjectId();

test('chatWithDocuments routes typo-heavy question requests into tutor orchestration with overview context', async (t) => {
    const previousCacheEnabled = env.aiCacheEnabled;
    env.aiCacheEnabled = false;
    t.after(() => {
        env.aiCacheEnabled = previousCacheEnabled;
    });

    const documentId = makeObjectId();
    const userId = makeObjectId();
    const savedSessions = [];
    let orchestratorArgs = null;

    t.mock.method(ChatHistory, 'findOne', async () => null);
    t.mock.method(ChatHistory.prototype, 'save', async function saveMock() {
        savedSessions.push(this);
        return this;
    });
    t.mock.method(conceptRepository, 'listByDocuments', async () => []);
    t.mock.method(tutorOrchestrator, 'run', async (args) => {
        orchestratorArgs = args;
        return {
            reply: '1. Explain the pumping lemma.\n2. Distinguish DFA and NFA.',
            retrievedChunks: [],
            citations: []
        };
    });

    const result = await chatWithDocuments({
        documents: [{
            _id: documentId,
            title: 'Automata',
            summary: 'This book introduces regular languages, automata, pumping lemma, and Turing machines.',
            chunkCount: 42,
            ingestionStatus: 'completed'
        }],
        userId,
        message: 'gve theory qns frm the doc',
        history: []
    });

    assert.equal(orchestratorArgs.intentClass, 'question_generation');
    assert.equal(orchestratorArgs.taskHints.questionStyle, 'theory');
    assert.equal(orchestratorArgs.taskHints.normalizedMessage, 'give theory questions from the document');
    assert.match(orchestratorArgs.overviewContext.summaryContext, /regular languages/i);
    assert.equal(result.debug.intent, 'question_generation');
    assert.equal(savedSessions[0].messages.length, 2);
    assert.match(savedSessions[0].rollingSummary, /gve theory qns frm the doc/i);
});

test('chatWithDocuments carries rolling summary and recent turns into follow-up study guidance', async (t) => {
    const previousCacheEnabled = env.aiCacheEnabled;
    env.aiCacheEnabled = false;
    t.after(() => {
        env.aiCacheEnabled = previousCacheEnabled;
    });

    const documentId = makeObjectId();
    const userId = makeObjectId();
    let orchestratorArgs = null;
    const existingSession = new ChatHistory({
        document: documentId,
        user: userId,
        sourceDocuments: [documentId],
        rollingSummary: 'Recent user goals: summarize chapter 3 | Recent tutor support: Chapter 3 covers pumping lemma',
        messages: [
            { role: 'user', content: 'summarize chapter 3', citations: [] },
            {
                role: 'ai',
                content: 'Chapter 3 covers pumping lemma and regular languages.',
                citations: [{ documentTitle: 'Automata', sectionTitle: 'Pumping Lemma', chunkIndex: 14 }]
            }
        ]
    });

    t.mock.method(ChatHistory, 'findOne', async () => existingSession);
    t.mock.method(ChatHistory.prototype, 'save', async function saveMock() {
        return this;
    });
    t.mock.method(conceptRepository, 'listByDocuments', async () => []);
    t.mock.method(tutorOrchestrator, 'run', async (args) => {
        orchestratorArgs = args;
        return {
            reply: 'Focus first on finite automata, then regular expressions, then the pumping lemma.',
            retrievedChunks: [],
            citations: []
        };
    });

    const result = await chatWithDocuments({
        documents: [{
            _id: documentId,
            title: 'Automata',
            summary: 'Covers finite automata, regular expressions, context-free grammars, and Turing machines.',
            chunkCount: 50,
            ingestionStatus: 'completed'
        }],
        userId,
        message: 'wht do i study frm this',
        history: []
    });

    assert.equal(orchestratorArgs.intentClass, 'study_guidance');
    assert.match(orchestratorArgs.rollingSummary, /summarize chapter 3/i);
    assert.equal(orchestratorArgs.history.length, 2);
    assert.equal(result.debug.intent, 'study_guidance');
    assert.match(existingSession.rollingSummary, /wht do i study frm this/i);
});

test('chatWithDocuments returns processing status instead of crashing when a document is still indexing', async (t) => {
    const previousCacheEnabled = env.aiCacheEnabled;
    env.aiCacheEnabled = false;
    t.after(() => {
        env.aiCacheEnabled = previousCacheEnabled;
    });

    t.mock.method(ChatHistory, 'findOne', async () => null);

    const result = await chatWithDocuments({
        documents: [{
            _id: makeObjectId(),
            title: 'Large PDF',
            summary: '',
            chunkCount: 0,
            ingestionStatus: 'processing'
        }],
        userId: makeObjectId(),
        message: 'what is this document about',
        history: []
    });

    assert.equal(result.status, 'DOCUMENT_STILL_PROCESSING');
    assert.match(result.reply, /still being analyzed/i);
});
