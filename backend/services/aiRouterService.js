import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Service to route requests to the configured provider model.
 */

// Basic word count proxy for token lengths and complexity.
export const detectComplexity = (prompt, historyLength = 0) => {
    const textLength = prompt.length;
    
    // High complexity keywords
    const complexKeywords = ['analyze', 'compare', 'synthesize', 'evaluate', 'critique', 'reason', 'difference'];
    const lowerPrompt = prompt.toLowerCase();
    
    let isComplex = complexKeywords.some(kw => lowerPrompt.includes(kw));

    if (textLength > 4000 || historyLength > 10 || isComplex) {
        return 'complex';
    } else if (textLength > 500 || historyLength > 3) {
        return 'medium';
    }
    
    return 'simple';
};

/**
 * Decides the correct model to route the AI response through, handling fallbacks securely.
 */
export const routeAIRequest = (prompt, history = []) => {
    const provider = env.aiProvider === 'gemini'
        || (env.aiProvider === 'auto' && env.geminiApiKey)
        ? 'gemini'
        : 'openrouter';
    const configuredModel = provider === 'gemini'
        ? (env.geminiChatModel || 'gemini-2.5-flash')
        : (env.openrouterModel || 'anthropic/claude-3.5-sonnet');
    if (!env.aiRoutingEnabled) {
        return configuredModel;
    }

    const complexity = detectComplexity(prompt, history.length);
    logger.info('[AI Router] Model selected', { complexity, model: configuredModel });
    return configuredModel;
};
