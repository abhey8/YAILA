import crypto from 'crypto';
import AICache from '../models/AICache.js';
import { env } from '../config/env.js';

/**
 * Service to handle caching of AI responses to reduce API costs.
 * Redis is not natively available in this basic layer, so Mongo fulfills 
 * the requirement perfectly with a strict 6-hour TTL index.
 */

// Basic MD5 hash since cryptographic security isn't needed for cache keys, just uniqueness
export const generateCacheKey = (prompt, historyStr = '') => {
    return crypto.createHash('md5').update(prompt + historyStr).digest('hex');
};

export const getCachedResponse = async (cacheKey) => {
    if (!env.aiCacheEnabled) return null;
    
    try {
        const cached = await AICache.findOne({ cacheKey }).lean();
        if (cached) {
            console.log(`[AI Cache Hit] Reusing generated response for key: ${cacheKey}`);
            return cached.response;
        }
    } catch (err) {
        console.error("AI Cache read failed, proceeding without cache:", err.message);
    }
    
    return null;
};

export const setCachedResponse = async (cacheKey, response) => {
    if (!env.aiCacheEnabled) return;
    
    try {
        await AICache.findOneAndUpdate(
            { cacheKey },
            { $set: { response, promptHash: cacheKey } },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (err) {
        console.error("AI Cache Write Failed:", err.message);
    }
};
