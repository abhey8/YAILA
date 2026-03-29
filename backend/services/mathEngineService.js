const MAX_EXPRESSION_LENGTH = 60;
const LARGE_NUMBER_MESSAGE = "That's a very large number. Try a smaller expression.";
const INVALID_EXPRESSION_MESSAGE = 'I can only solve safe numeric expressions using +, -, *, /, ** and parentheses.';

export const normalizePowerSyntax = (input = '') => `${input}`
    .replace(/\bto the power of\b/gi, '**')
    .replace(/\bto the power\b/gi, '**')
    .replace(/\^/g, '**')
    .replace(/\s+/g, ' ')
    .trim();

const tokenizeExpression = (expression = '') => expression.match(/\d*\.?\d+|\*\*|[+\-*/()]/g) || [];

const isSafeExpression = (expression = '') => {
    if (!expression || expression.length > MAX_EXPRESSION_LENGTH) {
        return false;
    }
    if (/[a-z]/i.test(expression)) {
        return false;
    }

    const compact = expression.replace(/\s+/g, '');
    if (!compact) {
        return false;
    }
    if (/\/\*|\*\/|\/\//.test(compact)) {
        return false;
    }

    const tokens = tokenizeExpression(compact);
    if (!tokens.length || tokens.join('') !== compact) {
        return false;
    }

    let balance = 0;
    for (const char of compact) {
        if (char === '(') balance += 1;
        if (char === ')') balance -= 1;
        if (balance < 0) return false;
    }
    return balance === 0;
};

export const evaluateMathExpression = (input = '') => {
    const normalized = normalizePowerSyntax(input);
    if (!isSafeExpression(normalized)) {
        return INVALID_EXPRESSION_MESSAGE;
    }

    const compact = normalized.replace(/\s+/g, '');
    try {
        const result = Function(`"use strict"; return (${compact});`)();
        const rendered = `${result}`;
        if (rendered.length > 120) {
            return LARGE_NUMBER_MESSAGE;
        }
        return rendered;
    } catch {
        return INVALID_EXPRESSION_MESSAGE;
    }
};

