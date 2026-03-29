const normalizeText = (value = '') => `${value}`.toLowerCase().replace(/\s+/g, ' ').trim();

const countSignals = (text, patterns) => patterns.reduce((acc, pattern) => (pattern.test(text) ? acc + 1 : acc), 0);

const estimateReasoningDepth = (text, mode) => {
    const complexitySignals = countSignals(text, [
        /\bprove\b|\bproof\b|\bderive\b|\bderivation\b/,
        /\bcompare\b|\bcontrast\b|\bdifferentiate\b/,
        /\bwhy\b|\bhow\b|\bexplain\b/,
        /\bstep\b|\bsolve\b|\bcalculate\b/,
        /\btherefore\b|\bhence\b|\biff\b/,
        /∀|∃|⊕|↔|→|¬|∧|∨/
    ]);

    if (mode === 'derivation_proof_reasoning' || complexitySignals >= 3 || text.length > 220) {
        return 'high';
    }
    if (complexitySignals >= 1 || text.length > 100) {
        return 'medium';
    }
    return 'low';
};

const estimateDifficulty = (text, reasoningDepth) => {
    if (reasoningDepth === 'high') return 'hard';
    if (reasoningDepth === 'medium') return 'medium';
    return /\bdefine\b|\bwhat is\b|\bmeaning\b/.test(text) ? 'easy' : 'medium';
};

const sectionPolicyForMode = (mode) => {
    if (mode === 'step_by_step_problem_solving') {
        return ['Given', 'Approach', 'Step-by-step solution', 'Final answer', 'Quick validation'];
    }
    if (mode === 'derivation_proof_reasoning') {
        return ['Claim', 'Known premises', 'Derivation/proof steps', 'Conclusion'];
    }
    if (mode === 'summarization') {
        return ['Topic map', 'Core ideas', 'Important caveats', 'Quick recap'];
    }
    if (mode === 'question_generation') {
        return ['Question set', 'Difficulty tags', 'Answer key'];
    }
    if (mode === 'comparison_of_concepts') {
        return ['Concept A', 'Concept B', 'Similarities', 'Differences', 'When to use'];
    }
    if (mode === 'revision_recall_practice') {
        return ['Recall prompts', 'Hints', 'Answers', 'Common mistakes'];
    }
    return ['Core concept', 'Why it matters', 'Grounded example', 'Quick check'];
};

const evidenceGroupingForMode = (mode) => {
    if (mode === 'derivation_proof_reasoning') return 'premise_chain';
    if (mode === 'comparison_of_concepts') return 'contrastive_pairs';
    if (mode === 'question_generation') return 'concept_clusters';
    if (mode === 'revision_recall_practice') return 'definition_to_recall_prompt';
    return 'definition_then_application';
};

const maxTokenBudgetByDepth = (depth, mode) => {
    if (mode === 'question_generation') return 560;
    if (depth === 'high') return 520;
    if (depth === 'medium') return 380;
    return 260;
};

export const planAnswer = ({ message = '', modePlan = null }) => {
    const text = normalizeText(message);
    const mode = modePlan?.mode || 'conceptual_explanation';
    const reasoningDepth = estimateReasoningDepth(text, mode);
    const difficultyEstimate = estimateDifficulty(text, reasoningDepth);
    const answerStructureSections = sectionPolicyForMode(mode);
    const evidenceGroupingStrategy = evidenceGroupingForMode(mode);
    const maxTokenBudget = maxTokenBudgetByDepth(reasoningDepth, mode);

    return {
        mode,
        reasoningDepth,
        answerStructureSections,
        evidenceGroupingStrategy,
        maxTokenBudget,
        difficultyEstimate
    };
};

