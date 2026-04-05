const normalizeWhitespace = (value = '') => `${value}`.toLowerCase().replace(/\s+/g, ' ').trim();

const REPLACEMENTS = [
    [/\bqs\b/gi, ' questions '],
    [/\bqns\b/gi, ' questions '],
    [/\bqn\b/gi, ' question '],
    [/\bfrm\b/gi, ' from '],
    [/\bfr\b/gi, ' from '],
    [/\bdoc\b/gi, ' document '],
    [/\bdocs\b/gi, ' documents '],
    [/\bwht\b/gi, ' what '],
    [/\bwhch\b/gi, ' which '],
    [/\bgve\b/gi, ' give '],
    [/\bgiv\b/gi, ' give '],
    [/\bgimme\b/gi, ' give me '],
    [/\bsmry\b/gi, ' summary '],
    [/\bsmrize\b/gi, ' summarize '],
    [/\bsummrize\b/gi, ' summarize '],
    [/\bsumrize\b/gi, ' summarize '],
    [/\bsummry\b/gi, ' summary '],
    [/\bsumry\b/gi, ' summary '],
    [/\bsmrz\b/gi, ' summarize '],
    [/\bchptr\b/gi, ' chapter '],
    [/\bchaptr\b/gi, ' chapter '],
    [/\bchp\b/gi, ' chapter '],
    [/\bimp\b/gi, ' important '],
    [/\bmst\b/gi, ' most '],
    [/\bthory\b/gi, ' theory '],
    [/\bthoery\b/gi, ' theory '],
    [/\bquestons\b/gi, ' questions '],
    [/\bqstns\b/gi, ' questions '],
    [/\bqstn\b/gi, ' question '],
    [/\bwhats\b/gi, ' what is '],
    [/\br\b/gi, ' are '],
    [/\bpls\b/gi, ' please ']
];

const SOCIAL_PATTERN = /^(hi|hello|hey|yo|hola|namaste|good (morning|afternoon|evening))[\s!,.?]*$/i;
const CAPABILITY_PATTERN = /(what can you do|can you help|are you smart|who are you|what are you|tell me about yourself|how can you help)/i;
const EXPLICIT_GENERAL_PATTERN = /(general question|not from (the )?(document|pdf|book)|off[- ]?topic|just chat|casual chat|without document|in general)\b/i;
const DOC_SIGNAL_PATTERN = /\b(document|documents|pdf|book|chapter|section|uploaded|material|materials|notes|application|form)\b|from this|according to|this file|this chapter|this book/i;

const QUESTION_GENERATION_PATTERNS = [
    /(ask|give|generate|create|make|quiz|test).*(question|questions|mcq|mcqs|quiz|viva)/i,
    /\b(question|questions|quiz|viva)\s+me\b/i,
    /\b(theory|practice|viva|important)\s+questions?\b/i,
    /\bask\s+questions?\s+from\b/i,
    /\bpractice\s+questions?\b/i
];

const OVERVIEW_PATTERNS = [
    /\bwhat (is|does).*(document|book|chapter|pdf).*(about|cover)\b/i,
    /\bwhat .* (document|book|chapter|pdf) is about\b/i,
    /\bwhat this (document|book|chapter|pdf) is about\b/i,
    /\bwhat (topics|concepts|parts)\b/i,
    /\bkey concepts\b/i,
    /\bimportant parts\b/i,
    /\bimportant topics\b/i,
    /\boverview\b/i,
    /\bsummary\b/i,
    /\bsummarize\b/i,
    /\brevision guide\b/i
];

const STUDY_GUIDANCE_PATTERNS = [
    /\bwhat should i study\b/i,
    /\bhow should i study\b/i,
    /\bstudy guide\b/i,
    /\bstudy plan\b/i,
    /\broadmap\b/i,
    /\bwhat do i study\b/i,
    /\bwhich parts matter\b/i,
    /\bquick revision\b/i
];

const EXPLANATION_PATTERNS = [
    /\bexplain\b/i,
    /\bwhat is\b/i,
    /\bmeaning of\b/i,
    /\bhelp me understand\b/i,
    /\bintuition\b/i,
    /\bwhy\b/i,
    /\bhow does\b/i
];

const TRANSFORM_PATTERNS = [
    /\brewrite\b/i,
    /\brephrase\b/i,
    /\bconvert\b/i,
    /\bturn .* into\b/i,
    /\bextract\b/i,
    /\blist\b/i,
    /\borganize\b/i
];

const FACTUAL_QA_PATTERNS = [
    /\bwhat\b/i,
    /\bwhich\b/i,
    /\bwho\b/i,
    /\bwhere\b/i,
    /\bfill\b/i,
    /\beligibility\b/i,
    /\bcriteria\b/i
];

const countPattern = /\b([1-9]|1[0-9]|20)\b/;

export const normalizeChatText = (message = '') => {
    let text = `${message}`.toLowerCase();
    REPLACEMENTS.forEach(([pattern, replacement]) => {
        text = text.replace(pattern, replacement);
    });

    return normalizeWhitespace(text);
};

export const extractRequestedQuestionCount = (message = '') => {
    const normalized = normalizeChatText(message);
    const match = normalized.match(countPattern);
    if (!match) {
        return null;
    }

    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
};

export const detectQuestionStyle = (message = '') => {
    const normalized = normalizeChatText(message);
    if (/\bmcq|mcqs|multiple choice\b/i.test(normalized)) {
        return 'mcq';
    }
    if (/\bviva\b/i.test(normalized)) {
        return 'viva';
    }
    if (/\btheory\b/i.test(normalized)) {
        return 'theory';
    }
    if (/\bpractice\b/i.test(normalized)) {
        return 'practice';
    }
    return 'general';
};

export const wantsAnswerKey = (message = '') => /\b(with answers?|answer key|show answers?|include answers?)\b/i.test(normalizeChatText(message));

export const detectChatIntent = ({
    message = '',
    hasDocumentContext = false
} = {}) => {
    const normalized = normalizeChatText(message);
    const hasDocSignal = DOC_SIGNAL_PATTERN.test(normalized);

    if (SOCIAL_PATTERN.test(normalized)) {
        return {
            intentClass: 'social',
            normalizedMessage: normalized,
            hasDocSignal,
            requestedQuestionCount: extractRequestedQuestionCount(normalized),
            questionStyle: detectQuestionStyle(normalized),
            wantsAnswerKey: wantsAnswerKey(normalized)
        };
    }

    if (EXPLICIT_GENERAL_PATTERN.test(normalized) || CAPABILITY_PATTERN.test(normalized)) {
        return {
            intentClass: 'generic_chat',
            normalizedMessage: normalized,
            hasDocSignal,
            requestedQuestionCount: extractRequestedQuestionCount(normalized),
            questionStyle: detectQuestionStyle(normalized),
            wantsAnswerKey: wantsAnswerKey(normalized)
        };
    }

    if (QUESTION_GENERATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return {
            intentClass: 'question_generation',
            normalizedMessage: normalized,
            hasDocSignal,
            requestedQuestionCount: extractRequestedQuestionCount(normalized),
            questionStyle: detectQuestionStyle(normalized),
            wantsAnswerKey: wantsAnswerKey(normalized)
        };
    }

    if (STUDY_GUIDANCE_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return {
            intentClass: 'study_guidance',
            normalizedMessage: normalized,
            hasDocSignal,
            requestedQuestionCount: extractRequestedQuestionCount(normalized),
            questionStyle: detectQuestionStyle(normalized),
            wantsAnswerKey: wantsAnswerKey(normalized)
        };
    }

    if (OVERVIEW_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return {
            intentClass: 'overview_summary',
            normalizedMessage: normalized,
            hasDocSignal,
            requestedQuestionCount: extractRequestedQuestionCount(normalized),
            questionStyle: detectQuestionStyle(normalized),
            wantsAnswerKey: wantsAnswerKey(normalized)
        };
    }

    if (TRANSFORM_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return {
            intentClass: 'transform_request',
            normalizedMessage: normalized,
            hasDocSignal,
            requestedQuestionCount: extractRequestedQuestionCount(normalized),
            questionStyle: detectQuestionStyle(normalized),
            wantsAnswerKey: wantsAnswerKey(normalized)
        };
    }

    if (EXPLANATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return {
            intentClass: hasDocumentContext || hasDocSignal ? 'explanation' : 'generic_chat',
            normalizedMessage: normalized,
            hasDocSignal,
            requestedQuestionCount: extractRequestedQuestionCount(normalized),
            questionStyle: detectQuestionStyle(normalized),
            wantsAnswerKey: wantsAnswerKey(normalized)
        };
    }

    if (FACTUAL_QA_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return {
            intentClass: hasDocumentContext || hasDocSignal ? 'factual_doc_qa' : 'generic_chat',
            normalizedMessage: normalized,
            hasDocSignal,
            requestedQuestionCount: extractRequestedQuestionCount(normalized),
            questionStyle: detectQuestionStyle(normalized),
            wantsAnswerKey: wantsAnswerKey(normalized)
        };
    }

    return {
        intentClass: hasDocumentContext ? 'fallback_unknown' : 'generic_chat',
        normalizedMessage: normalized,
        hasDocSignal,
        requestedQuestionCount: extractRequestedQuestionCount(normalized),
        questionStyle: detectQuestionStyle(normalized),
        wantsAnswerKey: wantsAnswerKey(normalized)
    };
};

export const shouldUseOverviewContext = (intentClass = '') => [
    'overview_summary',
    'study_guidance',
    'question_generation',
    'transform_request'
].includes(intentClass);

export const allowsGeneralFallback = (intentClass = '') => [
    'generic_chat',
    'fallback_unknown'
].includes(intentClass);

export const shouldReturnNotFound = (intentClass = '') => [
    'factual_doc_qa',
    'explanation'
].includes(intentClass);

export const isTaskIntent = (intentClass = '') => [
    'question_generation',
    'overview_summary',
    'study_guidance',
    'transform_request'
].includes(intentClass);
