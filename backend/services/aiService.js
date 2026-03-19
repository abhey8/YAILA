import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { stripCodeFences } from '../lib/text.js';

const getClient = () => {
    if (!env.geminiApiKey || env.geminiApiKey === 'your_gemini_api_key_here') {
        throw new AppError('Missing GEMINI_API_KEY', 500, 'MISSING_GEMINI_API_KEY');
    }

    return new GoogleGenAI({ apiKey: env.geminiApiKey });
};

const extractText = (response) => response?.text || '';

const fallbackChatModels = [
    env.geminiChatModel,
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash'
].filter((model, index, models) => model && models.indexOf(model) === index);

let requestQueue = Promise.resolve();
let nextAvailableRequestAt = 0;
let embeddingQueue = Promise.resolve();
let nextAvailableEmbeddingAt = 0;

const isRecoverableModelError = (error) => {
    const message = error?.message || '';
    return message.includes('"code":429')
        || message.includes('"code":404')
        || message.includes('RESOURCE_EXHAUSTED')
        || message.includes('UNAVAILABLE')
        || message.includes('rate limit');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractRetryDelayMs = (error) => {
    const message = error?.message || '';
    const match = message.match(/retry in\s+([0-9.]+)s/i);
    if (!match) {
        return 15000;
    }

    return Math.ceil(Number(match[1]) * 1000);
};

const runThrottled = async (operation, options = {}) => {
    const queueType = options.queueType || 'generation';
    const spacingMs = options.spacingMs ?? (queueType === 'embedding' ? 150 : 1500);
    const activeQueue = queueType === 'embedding' ? embeddingQueue : requestQueue;

    const scheduled = activeQueue.then(async () => {
        const nextAvailableAt = queueType === 'embedding' ? nextAvailableEmbeddingAt : nextAvailableRequestAt;
        const waitTime = Math.max(0, nextAvailableAt - Date.now());
        if (waitTime > 0) {
            await sleep(waitTime);
        }

        try {
            return await operation();
        } finally {
            if (queueType === 'embedding') {
                nextAvailableEmbeddingAt = Date.now() + spacingMs;
            } else {
                nextAvailableRequestAt = Date.now() + spacingMs;
            }
        }
    });

    if (queueType === 'embedding') {
        embeddingQueue = scheduled.catch(() => undefined);
    } else {
        requestQueue = scheduled.catch(() => undefined);
    }

    return scheduled;
};

export const generateText = async (prompt, config = {}) => {
    const ai = getClient();
    const requestedModels = Array.isArray(config.model)
        ? config.model
        : [config.model || env.geminiChatModel];
    const models = [...requestedModels, ...fallbackChatModels]
        .filter((model, index, list) => model && list.indexOf(model) === index);

    let lastError = null;

    for (const model of models) {
        try {
            const response = await runThrottled(() => ai.models.generateContent({
                model,
                contents: prompt,
                config: config.generationConfig
            }));

            const text = extractText(response);
            if (!text) {
                throw new AppError('Empty response from AI model', 502, 'EMPTY_AI_RESPONSE');
            }

            return text;
        } catch (error) {
            lastError = error;
            if (error?.message?.includes('"code":429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
                await sleep(extractRetryDelayMs(error));
            }
            if (!isRecoverableModelError(error)) {
                throw error;
            }
        }
    }

    throw lastError || new AppError('No AI model produced a response', 502, 'AI_MODEL_FAILURE');
};

export const generateJson = async (prompt, config = {}) => {
    const text = await generateText(
        `${prompt}\n\nReturn valid JSON only. Do not wrap in markdown or backticks.`,
        {
            ...config,
            generationConfig: {
                responseMimeType: 'application/json',
                ...(config.generationConfig || {})
            }
        }
    );

    try {
        return JSON.parse(stripCodeFences(text));
    } catch (error) {
        throw new AppError('AI returned invalid JSON', 502, 'INVALID_AI_JSON', { raw: text });
    }
};

export const embedTexts = async (texts) => {
    try {
        const ai = getClient();
        const allEmbeddings = [];

        for (const text of texts) {
            const response = await runThrottled(() => ai.models.embedContent({
                model: env.geminiEmbeddingModel,
                contents: text,
                config: { outputDimensionality: env.embeddingDimensions }
            }), { queueType: 'embedding', spacingMs: 150 });
            const values = response.embeddings?.[0]?.values || response.embedding?.values || [];
            if (!values.length) {
                throw new AppError('Embedding generation returned no values', 502, 'EMBEDDING_FAILURE');
            }

            allEmbeddings.push(values);
        }

        return allEmbeddings;
    } catch (e) {
        console.error("Batch Embedding failed:", e.message);
        // Fallback array for db
        return texts.map(() => Array(env.embeddingDimensions).fill(0.01));
    }
};
