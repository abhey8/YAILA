import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Service to intelligently route queries to the most cost-effective and capable AI model.
 * Gemini Flash-Lite for simple queries.
 * Gemini Flash for standard document context.
 * Gemini Pro for complex reasoning.
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
    if (!env.aiRoutingEnabled) {
        return env.openrouterChatModel || env.geminiChatModel || 'gemini-2.5-flash';
    }

    const openRouterConfigured = (env.openrouterApiKey || env.geminiApiKey || '').startsWith('sk-or-v1')
        || env.aiProvider === 'openrouter';
    if (openRouterConfigured) {
        return env.openrouterChatModel || env.geminiChatModel || 'openai/gpt-4.1-mini';
    }

    const complexity = detectComplexity(prompt, history.length);
    
    switch (complexity) {
        case 'complex':
            logger.info('[AI Router] Model selected', { complexity, model: 'gemini-2.5-pro' });
            return 'gemini-2.5-pro';
        case 'simple':
            logger.info('[AI Router] Model selected', { complexity, model: 'gemini-2.5-flash' });
            // Assuming Flash-Lite is available, else fallback to standard flash.
            return 'gemini-2.5-flash'; 
        case 'medium':
        default:
            logger.info('[AI Router] Model selected', { complexity: 'medium', model: 'gemini-2.5-flash' });
            return 'gemini-2.5-flash';
    }
};
