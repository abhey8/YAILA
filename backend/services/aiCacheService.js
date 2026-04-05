import crypto from 'crypto';
import AICache from '../models/AICache.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Service to handle caching of AI responses to reduce API costs.
 * Redis is not natively available in this basic layer, so Mongo fulfills 
 * the requirement perfectly with a strict 6-hour TTL index.
 */

const stableSerialize = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => stableSerialize(item));
    }
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((acc, key) => {
            acc[key] = stableSerialize(value[key]);
            return acc;
        }, {});
    }
    return value ?? null;
};

// Basic MD5 hash since cryptographic security isn't needed for cache keys, just uniqueness.
// The key includes user/document/provider/mode dimensions to prevent cross-session leakage.
export const generateCacheKey = (payload, historyStr = '') => {
    if (typeof payload === 'string') {
        return crypto.createHash('md5').update(payload + historyStr).digest('hex');
    }

    const serialized = JSON.stringify(stableSerialize(payload || {}));
    return crypto.createHash('md5').update(serialized).digest('hex');
};

export const getCachedResponse = async (cacheKey) => {
    if (!env.aiCacheEnabled) return null;
    
    try {
        const cached = await AICache.findOne({ cacheKey }).lean();
        if (cached) {
            logger.info('[AI Cache] Hit', { cacheKey });
            return cached.response;
        }
    } catch (err) {
        logger.warn('[AI Cache] Read failed', { error: err.message });
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
        logger.warn('[AI Cache] Write failed', { error: err.message });
    }
};
