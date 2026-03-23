import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { stripCodeFences } from '../lib/text.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_OPENROUTER_EMBED_MODEL = 'text-embedding-3-small';
const GEMINI_EMBED_BATCH_SIZE = 20;
const OPENROUTER_EMBED_BATCH_SIZE = 32;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeoutSignal = (timeoutMs = 35000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
};

const toAppError = (message, statusCode = 502, code = 'AI_API_FAILURE') =>
    new AppError(message, statusCode, code);

const getOpenRouterKey = () => env.openrouterApiKey || env.geminiApiKey;

const resolveProvider = () => {
    if (env.aiProvider === 'gemini') {
        return 'gemini';
    }
    if (env.aiProvider === 'openrouter') {
        return 'openrouter';
    }

    const openRouterKey = getOpenRouterKey();
    if (openRouterKey && openRouterKey.startsWith('sk-or-v1')) {
        return 'openrouter';
    }

    return 'gemini';
};

const callGemini = async (endpoint, payload, model) => {
    if (!env.geminiApiKey || env.geminiApiKey === 'your_gemini_api_key_here') {
        throw toAppError('Missing GEMINI_API_KEY', 500, 'MISSING_GEMINI_API_KEY');
    }

    const url = `${GEMINI_BASE_URL}/models/${model}:${endpoint}?key=${env.geminiApiKey}`;
    const { signal, clear } = withTimeoutSignal();
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
        });
    } catch (error) {
        clear();
        if (error.name === 'AbortError') {
            throw toAppError('AI request timed out', 504, 'AI_TIMEOUT');
        }
        throw error;
    }
    clear();

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw toAppError(data.error?.message || 'Gemini API failure', response.status, 'AI_API_FAILURE');
    }

    return data;
};

const callOpenRouter = async (endpoint, payload) => {
    const apiKey = getOpenRouterKey();
    if (!apiKey) {
        throw toAppError('Missing OPENROUTER_API_KEY', 500, 'MISSING_OPENROUTER_API_KEY');
    }

    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };

    if (env.openrouterSiteUrl) {
        headers['HTTP-Referer'] = env.openrouterSiteUrl;
    }
    if (env.openrouterAppName) {
        headers['X-Title'] = env.openrouterAppName;
    }

    const { signal, clear } = withTimeoutSignal();
    let response;
    try {
        response = await fetch(`${env.openrouterBaseUrl}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal
        });
    } catch (error) {
        clear();
        if (error.name === 'AbortError') {
            throw toAppError('AI request timed out', 504, 'AI_TIMEOUT');
        }
        throw error;
    }
    clear();

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const errorMessage = data.error?.message || data.message || 'OpenRouter API failure';
        throw toAppError(errorMessage, response.status, 'AI_API_FAILURE');
    }

    return data;
};

const fallbackGeminiModels = [
    env.geminiChatModel,
    'gemini-2.5-flash',
    'gemini-2.0-flash'
].filter((model, index, models) => model && models.indexOf(model) === index);

const fallbackOpenRouterModels = [
    env.openrouterChatModel,
    env.geminiChatModel,
    'openai/gpt-4.1-mini',
    'google/gemini-2.5-flash'
].filter((model, index, models) => model && models.indexOf(model) === index);

const extractOpenRouterText = (data) => {
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((part) => (typeof part === 'string' ? part : part?.text || ''))
            .join('')
            .trim();
    }
    return '';
};

const generateTextGemini = async (prompt, config = {}) => {
    const requestedModels = Array.isArray(config.model)
        ? config.model
        : [config.model || env.geminiChatModel];
    const models = [...requestedModels, ...fallbackGeminiModels]
        .filter((model, index, list) => model && list.indexOf(model) === index);

    let lastError = null;
    for (const model of models) {
        try {
            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { ...(config.generationConfig || {}) }
            };
            const data = await callGemini('generateContent', payload, model);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                throw toAppError('Empty response from Gemini', 502, 'EMPTY_AI_RESPONSE');
            }
            return text;
        } catch (error) {
            lastError = error;
            if (error.statusCode === 429) {
                await delay(1800);
            }
            if (error.statusCode === 400 || error.statusCode === 401 || error.statusCode === 404) {
                continue;
            }
        }
    }

    throw lastError || toAppError('No Gemini model produced a response', 502, 'AI_MODEL_FAILURE');
};

const generateTextOpenRouter = async (prompt, config = {}) => {
    const requestedModels = Array.isArray(config.model)
        ? config.model
        : [config.model || env.openrouterChatModel || env.geminiChatModel];
    const models = [...requestedModels, ...fallbackOpenRouterModels]
        .filter((model, index, list) => model && list.indexOf(model) === index);

    let lastError = null;
    for (const model of models) {
        try {
            const generationConfig = config.generationConfig || {};
            const maxTokens = config.maxTokens
                || generationConfig.maxOutputTokens
                || generationConfig.max_tokens
                || env.aiMaxOutputTokens;
            const payload = {
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: maxTokens
            };
            const data = await callOpenRouter('/chat/completions', payload);
            const text = extractOpenRouterText(data);
            if (!text) {
                throw toAppError('Empty response from OpenRouter', 502, 'EMPTY_AI_RESPONSE');
            }
            return text;
        } catch (error) {
            lastError = error;
            if (error.statusCode === 429) {
                await delay(1800);
            }
            if (error.statusCode === 400 || error.statusCode === 401 || error.statusCode === 404) {
                continue;
            }
        }
    }

    throw lastError || toAppError('No OpenRouter model produced a response', 502, 'AI_MODEL_FAILURE');
};

export const generateText = async (prompt, config = {}) => {
    return resolveProvider() === 'openrouter'
        ? generateTextOpenRouter(prompt, config)
        : generateTextGemini(prompt, config);
};

export const generateJson = async (prompt, config = {}) => {
    const generationConfig = {
        ...(config.generationConfig || {}),
        responseMimeType: 'application/json'
    };
    const text = await generateText(
        `${prompt}\n\nReturn valid JSON only. Do not wrap in markdown or backticks.`,
        {
            ...config,
            generationConfig
        }
    );

    try {
        return JSON.parse(stripCodeFences(text));
    } catch (error) {
        throw new AppError('AI returned invalid JSON', 502, 'INVALID_AI_JSON', { raw: text });
    }
};

const embedTextsGemini = async (texts) => {
    const model = env.geminiEmbeddingModel || 'gemini-embedding-001';
    const results = [];

    for (let start = 0; start < texts.length; start += GEMINI_EMBED_BATCH_SIZE) {
        const batch = texts.slice(start, start + GEMINI_EMBED_BATCH_SIZE);
        let attempts = 0;
        while (attempts < 4) {
            try {
                const payload = {
                    requests: batch.map((text) => ({
                        model: `models/${model}`,
                        content: { parts: [{ text }] }
                    }))
                };
                const data = await callGemini('batchEmbedContents', payload, model);
                const batchVectors = (data.embeddings || []).map((item) => item.values || []);
                if (batchVectors.length !== batch.length) {
                    throw toAppError('Embedding batch size mismatch', 502, 'EMBEDDING_FAILURE');
                }
                results.push(...batchVectors);
                break;
            } catch (error) {
                attempts += 1;
                if (attempts >= 4 || ![429, 500, 503].includes(error.statusCode)) {
                    throw toAppError(`AI Embedding failed: ${error.message}`, 502, 'EMBEDDING_FAILURE');
                }
                await delay(1500 * attempts);
            }
        }
    }

    return results;
};

const resolveOpenRouterEmbeddingModel = () => {
    if (env.openrouterEmbeddingModel) {
        return env.openrouterEmbeddingModel;
    }
    if (env.geminiEmbeddingModel && !env.geminiEmbeddingModel.startsWith('gemini-')) {
        return env.geminiEmbeddingModel;
    }
    return DEFAULT_OPENROUTER_EMBED_MODEL;
};

const embedTextsOpenRouter = async (texts) => {
    const model = resolveOpenRouterEmbeddingModel();
    const vectors = [];

    for (let start = 0; start < texts.length; start += OPENROUTER_EMBED_BATCH_SIZE) {
        const batch = texts.slice(start, start + OPENROUTER_EMBED_BATCH_SIZE);
        let attempts = 0;
        while (attempts < 4) {
            try {
                const data = await callOpenRouter('/embeddings', {
                    model,
                    input: batch
                });
                const ordered = (data.data || [])
                    .sort((a, b) => a.index - b.index)
                    .map((item) => item.embedding || []);
                if (ordered.length !== batch.length) {
                    throw toAppError('Embedding batch size mismatch', 502, 'EMBEDDING_FAILURE');
                }
                vectors.push(...ordered);
                break;
            } catch (error) {
                attempts += 1;
                if (attempts >= 4 || ![429, 500, 503].includes(error.statusCode)) {
                    throw toAppError(`AI Embedding failed: ${error.message}`, 502, 'EMBEDDING_FAILURE');
                }
                await delay(1500 * attempts);
            }
        }
    }

    return vectors;
};

export const embedTexts = async (texts = []) => {
    if (!Array.isArray(texts) || texts.length === 0) {
        return [];
    }

    const normalized = texts.map((text) => (typeof text === 'string' ? text : String(text || '')));
    return resolveProvider() === 'openrouter'
        ? embedTextsOpenRouter(normalized)
        : embedTextsGemini(normalized);
};
