import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { stripCodeFences } from '../lib/text.js';

const REQUEST_TIMEOUT_MS = 15000;
const OPENROUTER_EMBEDDING_BATCH_SIZE = 32;
const GEMINI_EMBEDDING_BATCH_SIZE = 20;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeParseJson = (raw) => {
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
};

const resolveProvider = () => {
    if (env.aiProvider === 'gemini') return 'gemini';
    if (env.aiProvider === 'openrouter') return 'openrouter';
    if (env.geminiApiKey) return 'gemini';
    return 'openrouter';
};

const callWithTimeout = async (url, options, providerLabel) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const raw = await response.text();
        const data = safeParseJson(raw);
        if (!response.ok) {
            const errorMessage = data?.error?.message || data?.message || `${providerLabel} API failure`;
            console.error(`[${providerLabel}] Provider error:`, { status: response.status, message: errorMessage });
            throw new AppError(errorMessage, response.status, 'AI_API_FAILURE');
        }
        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[${providerLabel}] Timeout`);
            throw new AppError('AI request timed out', 504, 'AI_TIMEOUT');
        }
        if (error instanceof AppError) throw error;
        console.error(`[${providerLabel}] Request error:`, error.message);
        throw new AppError(error.message || `${providerLabel} request failed`, 502, 'AI_API_FAILURE');
    } finally {
        clearTimeout(timeout);
    }
};

const callOpenRouter = (endpoint, payload) => {
    if (!env.openrouterApiKey) {
        throw new AppError('Missing OPENROUTER_API_KEY', 500, 'MISSING_OPENROUTER_API_KEY');
    }
    const headers = {
        Authorization: `Bearer ${env.openrouterApiKey}`,
        'Content-Type': 'application/json'
    };
    if (env.openrouterSiteUrl) headers['HTTP-Referer'] = env.openrouterSiteUrl;
    if (env.openrouterAppName) headers['X-Title'] = env.openrouterAppName;

    return callWithTimeout(
        `${env.openrouterBaseUrl}${endpoint}`,
        { method: 'POST', headers, body: JSON.stringify(payload) },
        'OpenRouter'
    );
};

const callGemini = (endpoint, payload, model) => {
    if (!env.geminiApiKey) {
        throw new AppError('Missing GEMINI_API_KEY', 500, 'MISSING_GEMINI_API_KEY');
    }
    const url = `${env.geminiBaseUrl}/models/${model}:${endpoint}?key=${env.geminiApiKey}`;
    return callWithTimeout(
        url,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
        'Gemini'
    );
};

const extractOpenRouterText = (data) => {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
        return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('').trim();
    }
    return '';
};

const extractGeminiText = (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

export const generateText = async (prompt, config = {}) => {
    const provider = resolveProvider();
    const generationConfig = config.generationConfig || {};
    const maxTokens = config.maxTokens
        || generationConfig.maxOutputTokens
        || generationConfig.max_tokens
        || env.aiMaxOutputTokens
        || 1200;

    if (provider === 'gemini') {
        const model = config.model || env.geminiChatModel;
        const data = await callGemini('generateContent', {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: maxTokens,
                temperature: generationConfig.temperature
            }
        }, model);
        const text = extractGeminiText(data);
        if (!text) throw new AppError('Empty AI response', 502, 'EMPTY_AI_RESPONSE');
        return text;
    }

    const model = config.model || env.openrouterModel;
    const data = await callOpenRouter('/chat/completions', {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens
    });
    const text = extractOpenRouterText(data);
    if (!text) throw new AppError('Empty AI response', 502, 'EMPTY_AI_RESPONSE');
    return text;
};

export const generateJson = async (prompt, config = {}) => {
    const text = await generateText(
        `${prompt}\n\nReturn valid JSON only. Do not wrap in markdown or backticks.`,
        config
    );
    try {
        return JSON.parse(stripCodeFences(text));
    } catch {
        console.error('[AI] Invalid JSON response');
        throw new AppError('AI returned invalid JSON', 502, 'INVALID_AI_JSON', { raw: text });
    }
};

const embedTextsGemini = async (texts) => {
    const model = env.geminiEmbeddingModel || 'gemini-embedding-001';
    const vectors = [];
    for (let start = 0; start < texts.length; start += GEMINI_EMBEDDING_BATCH_SIZE) {
        const batch = texts.slice(start, start + GEMINI_EMBEDDING_BATCH_SIZE);
        let attempts = 0;
        while (attempts < 3) {
            try {
                const data = await callGemini('batchEmbedContents', {
                    requests: batch.map((text) => ({
                        model: `models/${model}`,
                        content: { parts: [{ text }] }
                    }))
                }, model);
                const batchVectors = (data.embeddings || []).map((item) => item.values || []);
                if (batchVectors.length !== batch.length) {
                    throw new AppError('Embedding response size mismatch', 502, 'EMBEDDING_FAILURE');
                }
                vectors.push(...batchVectors);
                break;
            } catch (error) {
                attempts += 1;
                if (attempts >= 3 || ![429, 500, 503].includes(error.statusCode)) throw error;
                await delay(1000 * attempts);
            }
        }
    }
    return vectors;
};

const embedTextsOpenRouter = async (texts) => {
    const model = env.openrouterEmbeddingModel || 'text-embedding-3-small';
    const vectors = [];
    for (let start = 0; start < texts.length; start += OPENROUTER_EMBEDDING_BATCH_SIZE) {
        const batch = texts.slice(start, start + OPENROUTER_EMBEDDING_BATCH_SIZE);
        let attempts = 0;
        while (attempts < 3) {
            try {
                const data = await callOpenRouter('/embeddings', { model, input: batch });
                const ordered = (data.data || [])
                    .sort((a, b) => (a.index || 0) - (b.index || 0))
                    .map((item) => item.embedding || []);
                if (ordered.length !== batch.length) {
                    throw new AppError('Embedding response size mismatch', 502, 'EMBEDDING_FAILURE');
                }
                vectors.push(...ordered);
                break;
            } catch (error) {
                attempts += 1;
                if (attempts >= 3 || ![429, 500, 503].includes(error.statusCode)) throw error;
                await delay(1200 * attempts);
            }
        }
    }
    return vectors;
};

export const embedTexts = async (texts = []) => {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const normalizedTexts = texts.map((text) => (typeof text === 'string' ? text : String(text || '')));
    return resolveProvider() === 'gemini'
        ? embedTextsGemini(normalizedTexts)
        : embedTextsOpenRouter(normalizedTexts);
};

