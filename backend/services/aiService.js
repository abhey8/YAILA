import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { stripCodeFences } from '../lib/text.js';

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_BATCH_SIZE = 32;
const REQUEST_TIMEOUT_MS = 15000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getAuthHeaders = () => {
    if (!env.openrouterApiKey) {
        throw new AppError('Missing OPENROUTER_API_KEY', 500, 'MISSING_OPENROUTER_API_KEY');
    }

    const headers = {
        Authorization: `Bearer ${env.openrouterApiKey}`,
        'Content-Type': 'application/json'
    };

    if (env.openrouterSiteUrl) {
        headers['HTTP-Referer'] = env.openrouterSiteUrl;
    }
    if (env.openrouterAppName) {
        headers['X-Title'] = env.openrouterAppName;
    }

    return headers;
};

const safeParseJson = (raw) => {
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
};

const callOpenRouter = async (endpoint, payload) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${env.openrouterBaseUrl}${endpoint}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        const raw = await response.text();
        const data = safeParseJson(raw);
        if (!response.ok) {
            const errorMessage = data?.error?.message || data?.message || 'OpenRouter API failure';
            console.error('[OpenRouter] Provider error:', {
                status: response.status,
                endpoint,
                message: errorMessage
            });
            throw new AppError(errorMessage, response.status, 'AI_API_FAILURE');
        }

        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('[OpenRouter] Timeout error:', { endpoint });
            throw new AppError('AI request timed out', 504, 'AI_TIMEOUT');
        }
        if (error instanceof AppError) {
            throw error;
        }
        console.error('[OpenRouter] Request error:', { endpoint, message: error.message });
        throw new AppError(error.message || 'OpenRouter request failed', 502, 'AI_API_FAILURE');
    } finally {
        clearTimeout(timeout);
    }
};

const extractAssistantText = (data) => {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
        return content.trim();
    }
    if (Array.isArray(content)) {
        return content
            .map((part) => (typeof part === 'string' ? part : part?.text || ''))
            .join('')
            .trim();
    }
    return '';
};

export const generateText = async (prompt, config = {}) => {
    const generationConfig = config.generationConfig || {};
    const model = config.model || env.openrouterModel;
    const maxTokens = config.maxTokens
        || generationConfig.maxOutputTokens
        || generationConfig.max_tokens
        || env.aiMaxOutputTokens
        || 1200;

    const data = await callOpenRouter('/chat/completions', {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens
    });

    const text = extractAssistantText(data);
    if (!text) {
        throw new AppError('Empty AI response', 502, 'EMPTY_AI_RESPONSE');
    }

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
        console.error('[OpenRouter] Invalid JSON response');
        throw new AppError('AI returned invalid JSON', 502, 'INVALID_AI_JSON', { raw: text });
    }
};

export const embedTexts = async (texts = []) => {
    if (!Array.isArray(texts) || texts.length === 0) {
        return [];
    }

    const model = env.openrouterEmbeddingModel || DEFAULT_EMBEDDING_MODEL;
    const normalizedTexts = texts.map((text) => (typeof text === 'string' ? text : String(text || '')));
    const vectors = [];

    for (let start = 0; start < normalizedTexts.length; start += EMBEDDING_BATCH_SIZE) {
        const batch = normalizedTexts.slice(start, start + EMBEDDING_BATCH_SIZE);
        let attempts = 0;

        while (attempts < 3) {
            try {
                const data = await callOpenRouter('/embeddings', {
                    model,
                    input: batch
                });

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
                if (attempts >= 3 || ![429, 500, 503].includes(error.statusCode)) {
                    throw error instanceof AppError
                        ? error
                        : new AppError(`Embedding failed: ${error.message}`, 502, 'EMBEDDING_FAILURE');
                }
                await delay(1200 * attempts);
            }
        }
    }

    return vectors;
};
