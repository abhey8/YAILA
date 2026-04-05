import { env } from '../config/env.js';
import { detectChatIntent, normalizeChatText } from './chatIntentService.js';

const MODE_PATTERNS = [
    {
        mode: 'step_by_step_problem_solving',
        pattern: /(step by step|solve|calculate|evaluate|show steps|find the value)/i
    },
    {
        mode: 'derivation_proof_reasoning',
        pattern: /(prove|proof|derive|derivation|show that|hence|theorem|lemma)/i
    },
    {
        mode: 'summarization',
        pattern: /(summarize|summary|tl;dr|key points|main ideas)/i
    },
    {
        mode: 'question_generation',
        pattern: /(generate|create|make|ask|give|quiz|test).*(question|questions|quiz|mcq|viva)|practice questions?|\b(theory|viva|important)\s+questions?\b/i
    },
    {
        mode: 'comparison_of_concepts',
        pattern: /(compare|difference|differentiate|vs|versus|contrast)/i
    },
    {
        mode: 'revision_recall_practice',
        pattern: /(revise|revision|recall|flashcard|quick test|self test|practice recall)/i
    },
    {
        mode: 'conceptual_explanation',
        pattern: /(explain|what is|meaning|concept|intuition|understand)/i
    }
];

const modeConfig = (mode) => {
    const base = {
        vectorCandidatePool: env.retrievalVectorCandidatePool,
        lexicalCandidatePool: env.retrievalLexicalCandidatePool,
        mergedCandidatePool: env.retrievalMergedCandidatePool,
        rerankPoolSize: env.retrievalRerankPoolSize,
        finalContextSize: env.retrievalFinalContextSize,
        maxPerSection: env.retrievalMaxPerSection,
        maxPerWindow: env.retrievalMaxPerWindow,
        nearDuplicateThreshold: env.retrievalNearDuplicateThreshold
    };

    if (mode === 'summarization') {
        return {
            ...base,
            finalContextSize: 3,
            rerankPoolSize: Math.max(12, base.rerankPoolSize - 2)
        };
    }

    if (mode === 'revision_recall_practice') {
        return {
            ...base,
            finalContextSize: 3,
            rerankPoolSize: Math.max(12, base.rerankPoolSize - 2)
        };
    }

    if (mode === 'question_generation') {
        return {
            ...base,
            finalContextSize: 3,
            rerankPoolSize: Math.max(10, base.rerankPoolSize - 4),
            maxPerSection: 1
        };
    }

    if (mode === 'comparison_of_concepts') {
        return {
            ...base,
            finalContextSize: 4,
            maxPerSection: 1
        };
    }

    if (mode === 'derivation_proof_reasoning') {
        return {
            ...base,
            finalContextSize: 4,
            rerankPoolSize: Math.max(18, base.rerankPoolSize)
        };
    }

    return base;
};

const modeAnswerPolicy = (mode) => {
    if (mode === 'step_by_step_problem_solving') {
        return ['Given', 'Steps', 'Result', 'Quick check'];
    }
    if (mode === 'derivation_proof_reasoning') {
        return ['Claim', 'Premises', 'Derivation/Proof', 'Conclusion'];
    }
    if (mode === 'summarization') {
        return ['Topic map', 'Key points', 'Takeaways'];
    }
    if (mode === 'question_generation') {
        return ['Questions grouped by difficulty'];
    }
    if (mode === 'comparison_of_concepts') {
        return ['Concept A', 'Concept B', 'Similarities', 'Differences', 'When to use'];
    }
    if (mode === 'revision_recall_practice') {
        return ['Recall prompt', 'Hint', 'Answer', 'Common mistake'];
    }
    return ['Core idea', 'Why it works', 'Example', 'Quick check'];
};

const modePromptBehavior = (mode) => {
    if (mode === 'step_by_step_problem_solving') {
        return 'Give explicit numbered steps and avoid skipping reasoning jumps.';
    }
    if (mode === 'derivation_proof_reasoning') {
        return 'Use a rigorous logical chain with premises linked to evidence.';
    }
    if (mode === 'summarization') {
        return 'Compress without losing key definitions and distinctions.';
    }
    if (mode === 'question_generation') {
        return 'Produce cognitively varied practice prompts anchored to evidence.';
    }
    if (mode === 'comparison_of_concepts') {
        return 'Contrast concepts directly with clear boundaries and overlap.';
    }
    if (mode === 'revision_recall_practice') {
        return 'Prefer active recall framing with concise hints.';
    }
    return 'Explain concept first, then reinforce with one grounded example.';
};

export const routePedagogicalMode = ({ message = '', history = [] }) => {
    const text = normalizeChatText(message);
    const intent = detectChatIntent({ message, hasDocumentContext: true });
    const intentModeMap = {
        overview_summary: 'summarization',
        study_guidance: 'summarization',
        question_generation: 'question_generation',
        transform_request: 'conceptual_explanation',
        explanation: 'conceptual_explanation',
        factual_doc_qa: 'conceptual_explanation'
    };
    const matched = MODE_PATTERNS.find((entry) => entry.pattern.test(text));
    const mode = intentModeMap[intent.intentClass] || matched?.mode || 'conceptual_explanation';

    return {
        mode,
        confidence: matched ? 0.82 : 0.6,
        retrievalPolicy: modeConfig(mode),
        answerStructure: modeAnswerPolicy(mode),
        promptBehavior: modePromptBehavior(mode),
        historyDepth: Math.min(6, Math.max(2, history.length || 0))
    };
};
