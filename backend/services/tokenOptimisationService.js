import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Service to optimise exact prompt payloads to adhere to token limitations,
 * reduce costs by stripping redundancies, and keep chat context snappy.
 */

// Basic limits depending upon what models support. Using a high soft cap to avoid hard truncations blindly.
const MAX_HISTORY_ITEMS = 6; 
const MAX_WORD_COUNT = 800; // Arbitrary high fallback string length roughly equals token sizing

/**
 * Builds an optimal prompt history string by pruning out older elements 
 * and removing verbose system messages or extremely lengthy user inputs.
 */
export const buildOptimisedContext = (historyArray = []) => {
    if (!env.aiSummaryEnabled || !historyArray || historyArray.length === 0) {
        return historyArray.map(item => `${item.role.toUpperCase()}: ${item.content}`).join('\n');
    }

    // Sort to keep newest items and map to exact string
    const recent = historyArray.slice(-MAX_HISTORY_ITEMS);
    
    return recent.map(item => {
        let text = item.content || '';
        // If content is ridiculously long, optionally chunk words out
        const words = text.split(/\s+/);
        if (words.length > MAX_WORD_COUNT) {
            text = words.slice(0, MAX_WORD_COUNT).join(' ') + '... [Content truncated for memory]';
        }
        return `${item.role.toUpperCase()}: ${text}`;
    }).join('\n');
};

/**
 * Ensures the context payload stays within strict token limits by pruning lowest-relevance chunks.
 */
export const pruneRetrievedChunks = (chunks) => {
    const maxTokens = Number(process.env.MAX_CONTEXT_TOKENS) || 8000;
    
    // Quick token estimate multiplier
    const estimateTokens = (text) => text ? Math.ceil(text.split(/\s+/).length * 1.3) : 0;
    
    // Sort chunks by rerankScore descending to prioritize relevance
    const sortedChunks = [...chunks].sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));
    
    let currentTokens = 0;
    const prunedChunks = [];

    for (const chunk of sortedChunks) {
        const chunkTokens = estimateTokens(chunk.content);
        if (currentTokens + chunkTokens > maxTokens) {
            logger.info('[TokenGuard] Context limit reached', { currentTokens, maxTokens });
            break;
        }
        currentTokens += chunkTokens;
        prunedChunks.push(chunk);
    }
    
    // Maintain original chronological ordering (assuming original array was ordered by chunkIndex or document flow)
    return chunks.filter(c => prunedChunks.includes(c));
};
