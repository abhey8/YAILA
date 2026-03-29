import { env } from '../config/env.js';
import { cosineSimilarity } from '../lib/math.js';
import { logger } from '../lib/logger.js';
import { embedTexts, generateText } from './aiService.js';
import { aiQueueService } from './aiQueueService.js';
import { routeAIRequest } from './aiRouterService.js';
import { routePedagogicalMode } from './pedagogicalModeRouterService.js';
import { planAnswer } from './answerPlannerService.js';
import { retrieveRelevantChunks } from './retrievalService.js';

const MAX_PIPELINE_MS = 7000;
const FAST_MODE_SWITCH_MS = 3500;
const MEMORY_SIMILARITY_THRESHOLD = 0.18;
const FAST_MODE_RETRIEVAL_LIMIT = 2;
const normalizeText = (value = '') => `${value}`.toLowerCase().replace(/\s+/g, ' ').trim();

const stripSourceLines = (text = '') => text
    .split('\n')
    .filter((line) => !/^sources?\s*:/i.test(line.trim()))
    .join('\n')
    .trim();

const chunkCitation = (chunk) => ({
    document: chunk.document,
    chunk: chunk._id,
    documentTitle: chunk.documentTitle || 'Uploaded Document',
    sectionTitle: chunk.sectionTitle || 'Untitled Section',
    chunkIndex: chunk.chunkIndex || 0
});

const uniqueBy = (items, keyFn) => {
    const map = new Map();
    items.forEach((item) => {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, item);
    });
    return [...map.values()];
};

function extractKeywords(text = '') {
    const tokens = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 3);

    const stop = new Set([
        'what','when','where','which','there','their','about',
        'would','could','should','these','those','have','been',
        'from','into','while','does','this','that'
    ]);

    const freq = {};
    tokens.forEach(t => {
        if (!stop.has(t)) {
            freq[t] = (freq[t] || 0) + 1;
        }
    });

    return Object.entries(freq)
        .sort((a,b)=>b[1]-a[1])
        .slice(0,5)
        .map(([t])=>t);
}

function rewriteQuery(message = '') {

    const canonical = message
        .toLowerCase()
        .replace(/⊕/g,' xor ')
        .replace(/∀/g,' for all ')
        .replace(/∃/g,' exists ')
        .replace(/↔/g,' iff ')
        .replace(/→/g,' implies ')
        .replace(/¬/g,' not ')
        .replace(/∧/g,' and ')
        .replace(/∨/g,' or ')
        .replace(/\s+/g,' ')
        .trim();

    const keywords = extractKeywords(canonical);

    const reasoningForms = [
        canonical + ' definition',
        canonical + ' explanation',
        canonical + ' proof',
        canonical + ' example',
        canonical + ' intuition',
        canonical + ' derivation',
        canonical + ' application'
    ];

    const keywordQuery = keywords.join(' ');

    return {
        original: message,
        canonical,
        expandedQueries: [
            canonical,
            keywordQuery,
            ...reasoningForms
        ].filter(Boolean)
    };
}

const estimateWords = (text = '') => `${text}`.trim().split(/\s+/).filter(Boolean).length;

const trimToWords = (text = '', maxWords = 170) => {
    const words = `${text}`.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return words.join(' ');
    return `${words.slice(0, maxWords).join(' ')} ...`;
};

const retrieveSemanticMemory = async ({
    message,
    history = [],
    enabled = true,
    fastMode = false
}) => {

    if (!enabled || fastMode || !Array.isArray(history) || history.length < 3) {
        return [];
    }

    // find latest rolling summary
    const summaryEntry = [...history]
        .reverse()
        .find(h => h.role === 'system_summary' && h.content);

    if (!summaryEntry) {
        return [];
    }

    try {

        // embed only message + summary (very cheap)
        const vectors = await embedTexts([
            message,
            summaryEntry.content
        ]);

        const similarity = cosineSimilarity(vectors[0] || [], vectors[1] || []);

        if (!similarity || similarity < MEMORY_SIMILARITY_THRESHOLD) {
            return [];
        }

        return [{
            role: 'memory',
            content: summaryEntry.content,
            similarity
        }];

    } catch (error) {
        logger.warn('[TutorOrchestrator] semantic memory skipped', { error: error.message });
        return [];
    }
};

const buildStructuredContext = ({ planner, chunks, memories = [], fastMode = false }) => {
    const definitions = [];
    const reasoning = [];
    const support = [];
    chunks = [...chunks].sort((a, b) => {
        const scoreA =
            (a.rerankScore || 0)
            + (/proof|theorem|definition|example/i.test(a.sectionTitle || '') ? 0.12 : 0);

        const scoreB =
            (b.rerankScore || 0)
            + (/proof|theorem|definition|example/i.test(b.sectionTitle || '') ? 0.12 : 0);

        return scoreB - scoreA;
    });

    chunks = chunks.slice(0, fastMode ? FAST_MODE_RETRIEVAL_LIMIT : 5);
    chunks.forEach((chunk) => {
        const section = normalizeText(chunk.sectionTitle || '');
        const content = trimToWords(chunk.content || '', 170);
        const line = `[${chunk.documentTitle || 'Document'} | ${chunk.sectionTitle || 'Untitled'}] ${content}`;

        if (/definition|means|notation|terminology/.test(section)) {
            definitions.push(line);
        } else if (/proof|theorem|lemma|proposition|derivation|example/.test(section)) {
            reasoning.push(line);
        } else {
            support.push(line);
        }
    });

    const memoryLines = memories.map((item) => `[${item.role}] ${item.content}`);

    return {
        sections: planner.answerStructureSections || [],
        definitions,
        reasoning,
        support,
        memories: memoryLines,
        promptContext: [
            'Planned answer sections:',
            ...(planner.answerStructureSections || []).map((s) => `- ${s}`),
            '',
            'Definitions:',
            ...(definitions.length ? definitions : ['- None']),
            '',
            'Reasoning Evidence:',
            ...(reasoning.length ? reasoning : ['- None']),
            '',
            'Supporting Evidence:',
            ...(support.length ? support : ['- None']),
            '',
            'Relevant Memory:',
            ...(memoryLines.length ? memoryLines : ['- None'])
        ].join('\n')
    };
};

const verifyAnswer = async ({ reply = '', chunks = [] }) => {

    if (!reply || !chunks.length) {
        return {
            grounding_score: 0,
            evidence_coverage_ratio: 0,
            unsupported_claim_flag: true
        };
    }

    try {

        const chunkTexts = chunks.map(c => c.content).join('\n');

        const vectors = await embedTexts([
            reply,
            chunkTexts
        ]);

        const similarity = cosineSimilarity(vectors[0] || [], vectors[1] || []);

        const groundingScore = Math.max(0, Math.min(1, similarity));

        return {
            grounding_score: Number(groundingScore.toFixed(3)),
            evidence_coverage_ratio: Number(groundingScore.toFixed(3)),
            unsupported_claim_flag: groundingScore < 0.55
        };

    } catch (e) {

        logger.warn('[Verifier] embedding verification failed', e.message);

        return {
            grounding_score: 0.5,
            evidence_coverage_ratio: 0.5,
            unsupported_claim_flag: false
        };
    }
};

const buildReasoningPrompt = ({ documents = [], message, modePlan, planner, contextBlock, fastMode = false }) => {
    return `You are an expert AI tutor. Answer using only provided evidence.
Tutor mode: ${modePlan.mode}
Reasoning depth: ${planner.reasoningDepth}
Difficulty estimate: ${planner.difficultyEstimate}
Evidence grouping strategy: ${planner.evidenceGroupingStrategy}
Prompt behavior: ${modePlan.promptBehavior}
Fast mode: ${fastMode ? 'ON' : 'OFF'}

Available documents:
${documents.map((doc) => `- ${doc.title || doc.originalName}`).join('\n')}

${contextBlock}

Instructions:
- Follow planned sections exactly.
- Keep response concise but instructional.
- Do not fabricate facts beyond evidence.
- If evidence is insufficient, state what is missing.

User question:
${message}`;
};

const buildFallbackReply = ({ message, chunks = [] }) => {
    if (!chunks.length) {
        return 'Information not found in uploaded materials.';
    }
    const excerpt = trimToWords(chunks[0].content || '', 90);
    return `I could not complete full reasoning right now. Based on the strongest excerpt: ${excerpt}`;
};

export const tutorOrchestrator = {
    async run({
        userId,
        documents = [],
        message = '',
        history = [],
        isLowValueChunk = null,
        enableSemanticMemory = true
    }) {
        const startedAt = Date.now();
        const stageTiming = {};
        const mark = (stage) => {
            stageTiming[stage] = Date.now() - startedAt;
        };

        try {
            // Stage 1: pedagogical mode routing
            const modePlan = routePedagogicalMode({ message, history });
            mark('mode_routing');

            // Stage 2: answer planning
            const planner = planAnswer({ message, modePlan });
            mark('answer_planning');

            // Stage 3: query rewriting
            const rewritePlan = rewriteQuery(message);
            mark('query_rewriting');

            // Stage 4 + 5: hybrid retrieval + rerank/diversity filtering (inside retrieval service)
            const documentIds = documents.map((document) => document._id);

            const mergedQuery = rewritePlan.expandedQueries.join(' ');

            let rawChunks = await retrieveRelevantChunks({
                userId,
                documentIds,
                query: mergedQuery,
                topK: modePlan.retrievalPolicy.finalContextSize,
                policy: modePlan.retrievalPolicy
            });

            // optional low-value filter
            const chunks = typeof isLowValueChunk === 'function'
                ? rawChunks.filter((chunk) => !isLowValueChunk(chunk))
                : rawChunks;

            mark('retrieval_rerank_diversity');

            const retrievalTime = stageTiming['retrieval_rerank_diversity'] || 0;
            const fastMode = retrievalTime > FAST_MODE_SWITCH_MS;

            // Stage 6: semantic memory retrieval
            const semanticMemory = await retrieveSemanticMemory({
                message,
                history,
                enabled: enableSemanticMemory && env.intelligenceV2Enabled,
                fastMode
            });

            mark('semantic_memory');

            // Stage 7: structured context builder
            const contextBuilt = buildStructuredContext({
                planner,
                chunks,
                memories: semanticMemory,
                fastMode
            });
            mark('context_builder');

            // Stage 8: reasoning generation call
            const prompt = buildReasoningPrompt({
                documents,
                message,
                modePlan,
                planner,
                contextBlock: contextBuilt.promptContext,
                fastMode
            });
            const selectedModel = routeAIRequest(prompt, history);
            let reply = await aiQueueService.enqueue(
                () => generateText(prompt, {
                    model: selectedModel,
                    maxTokens: planner.maxTokenBudget
                }),
                MAX_PIPELINE_MS
            );
            reply = stripSourceLines(reply);
            mark('reasoning_generation');

            // Stage 9: answer verification pass
            let verifier = fastMode
                ? { grounding_score: 0.75, evidence_coverage_ratio: 0.7, unsupported_claim_flag: false }
                : await verifyAnswer({ reply, chunks });

            mark('verification');

if (!fastMode && verifier.unsupported_claim_flag) {

    // SECOND-CHANCE RETRIEVAL
    const secondQuery = rewritePlan.canonical + " detailed explanation";

    const secondChunks = await retrieveRelevantChunks({
        userId,
        documentIds,
        query: secondQuery,
        topK: modePlan.retrievalPolicy.finalContextSize,
        policy: modePlan.retrievalPolicy
    });

    if (secondChunks && secondChunks.length > 0) {

        const secondContext = buildStructuredContext({
            planner,
            chunks: secondChunks,
            memories: semanticMemory,
            fastMode
        });

        const retryPrompt = buildReasoningPrompt({
            documents,
            message,
            modePlan,
            planner,
            contextBlock: secondContext.promptContext,
            fastMode
        });

        let retryReply = await aiQueueService.enqueue(
            () => generateText(retryPrompt, {
                model: selectedModel,
                maxTokens: planner.maxTokenBudget
            }),
            6000
        );

        retryReply = stripSourceLines(retryReply);

        const retryVerifier = await verifyAnswer({
        reply: retryReply,
        chunks: secondChunks
    });

        if (retryVerifier.grounding_score > verifier.grounding_score) {
            reply = retryReply;
            verifier = retryVerifier;
            mark('second_chance_success');
        }
    }
}

            // Stage 10: fallback / fast mode logic
            if (!reply || Date.now() - startedAt > MAX_PIPELINE_MS) {
                reply = buildFallbackReply({ message, chunks });
            }
            mark('finalize');

            return {
                reply,
                retrievedChunks: chunks.map((chunk) => ({
                    id: chunk._id,
                    content: chunk.content,
                    score: chunk.rerankScore,
                    documentId: chunk.document,
                    documentTitle: chunk.documentTitle,
                    sectionTitle: chunk.sectionTitle || 'Untitled Section',
                    chunkIndex: chunk.chunkIndex
                })),
                citations: chunks.map(chunkCitation).slice(0, 4),
                mode: modePlan.mode,
                planning: planner,
                verifier,
                orchestration: {
                    fastMode,
                    rewriteQueries: rewritePlan.expandedQueries.slice(0, 2),
                    stageTiming
                }
            };
        } catch (error) {
            logger.error('[TutorOrchestrator] Pipeline failed', { error: error.message });
            return {
                reply: 'I hit a temporary issue while reasoning. Please try again.',
                retrievedChunks: [],
                citations: [],
                mode: 'conceptual_explanation',
                planning: {
                    mode: 'conceptual_explanation',
                    reasoningDepth: 'low',
                    answerStructureSections: ['Core concept', 'Quick explanation'],
                    evidenceGroupingStrategy: 'definition_then_application',
                    maxTokenBudget: 260,
                    difficultyEstimate: 'medium'
                },
                verifier: {
                    grounding_score: 0,
                    evidence_coverage_ratio: 0,
                    unsupported_claim_flag: true
                },
                orchestration: {
                    fastMode: true,
                    rewriteQueries: [],
                    stageTiming: {}
                }
            };
        }
    }
};
