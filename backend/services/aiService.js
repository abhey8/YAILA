import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { stripCodeFences } from '../lib/text.js';
import { GoogleGenAI } from '@google/genai';
import { generateWithFallback } from './ai/providers.js';
import { buildLocalEmbeddings } from './localEmbeddingService.js';

const REQUEST_TIMEOUT_MS = 15000;
const GEMINI_EMBEDDING_BATCH_SIZE = 32;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stripTrailingCommas = (value = '') => value.replace(/,\s*([}\]])/g, '$1');

const extractBalancedJsonSnippet = (text = '') => {
    const source = `${text}`;
    const starts = [];
    for (let i = 0; i < source.length; i += 1) {
        const char = source[i];
        if (char === '{' || char === '[') {
            starts.push(i);
        }
    }

    for (const start of starts) {
        const stack = [];
        let inString = false;
        let escape = false;

        for (let i = start; i < source.length; i += 1) {
            const char = source[i];
            if (escape) {
                escape = false;
                continue;
            }
            if (char === '\\') {
                escape = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
                continue;
            }
            if (inString) {
                continue;
            }
            if (char === '{' || char === '[') {
                stack.push(char);
                continue;
            }
            if (char === '}' || char === ']') {
                const top = stack.pop();
                if (!top) {
                    break;
                }
                if ((top === '{' && char !== '}') || (top === '[' && char !== ']')) {
                    break;
                }
                if (stack.length === 0) {
                    return source.slice(start, i + 1);
                }
            }
        }
    }

    return '';
};

const parseJsonFromModelText = (rawText = '') => {
    const stripped = stripCodeFences(rawText).trim();
    const candidates = [
        stripped,
        stripTrailingCommas(stripped),
        extractBalancedJsonSnippet(stripped),
        stripTrailingCommas(extractBalancedJsonSnippet(stripped))
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch {}
    }

    return null;
};

let geminiClient = null;
const getGeminiClient = () => {
    if (!geminiClient) {
        geminiClient = new GoogleGenAI({ apiKey: env.geminiApiKey });
    }
    return geminiClient;
};

const callGeminiWithTimeout = async (operation) => {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new AppError('AI request timed out', 504, 'AI_TIMEOUT')), REQUEST_TIMEOUT_MS);
    });

    try {
        return await Promise.race([operation, timeout]);
    } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(error.message || 'Gemini request failed', error.status || 502, 'AI_API_FAILURE');
    } finally {
        clearTimeout(timer);
    }
};

const resolveProviderForModel = (model) => {
    const normalized = `${model || ''}`.trim().toLowerCase();
    if (!normalized) {
        return env.aiPrimaryProvider;
    }
    if (normalized.includes('gemini')) {
        return 'gemini';
    }
    if (normalized.includes('llama') || normalized.includes('mixtral') || normalized.includes('qwen') || normalized.includes('groq')) {
        return 'groq';
    }
    return env.aiPrimaryProvider;
};

export const generateText = async (prompt, config = {}) => {
    const generationConfig = config.generationConfig || {};
    const maxTokens = config.maxTokens
        || generationConfig.maxOutputTokens
        || generationConfig.max_tokens
        || env.aiMaxOutputTokens
        || 1200;

    const messages = Array.isArray(prompt)
        ? prompt
        : [{ role: 'user', content: String(prompt || '') }];

    try {
        const providerOptions = {
            maxTokens,
            responseMimeType: config.responseMimeType,
            temperature: generationConfig.temperature
        };
        if (config.model) {
            const resolvedProvider = resolveProviderForModel(config.model);
            if (resolvedProvider === 'groq') {
                providerOptions.groq = {
                    model: config.model,
                    maxTokens,
                    temperature: generationConfig.temperature
                };
            } else {
                providerOptions.gemini = {
                    model: config.model,
                    maxTokens,
                    responseMimeType: config.responseMimeType,
                    temperature: generationConfig.temperature
                };
            }
        }

        const response = await generateWithFallback(messages, providerOptions);
        if (!response?.content) {
            throw new AppError('Empty AI response', 502, 'EMPTY_AI_RESPONSE');
        }
        return response.content;
    } catch (error) {
        throw new AppError(error.message || 'AI generation failed', 502, 'AI_API_FAILURE');
    }
};

export const generateJson = async (prompt, config = {}) => {
    const strictMessages = [
        {
            role: 'system',
            content: 'Return strictly valid JSON only. Do not use markdown, code fences, or commentary.'
        },
        {
            role: 'user',
            content: `${prompt}\n\nReturn valid JSON only. Do not wrap in markdown or backticks.`
        }
    ];
    const jsonConfig = {
        ...config,
        responseMimeType: 'application/json',
        generationConfig: {
            ...(config.generationConfig || {}),
            temperature: 0.1
        }
    };
    const firstText = await generateText(strictMessages, jsonConfig);
    const firstParsed = parseJsonFromModelText(firstText);
    if (firstParsed !== null) {
        return firstParsed;
    }

    const retryText = await generateText(
        [
            {
                role: 'system',
                content: 'Return strictly valid JSON only. Your response must start with { or [ and end with } or ].'
            },
            {
                role: 'user',
                content: `${prompt}\n\nIMPORTANT: Output must start with { or [ and end with } or ]. Do not include any prose.`
            }
        ],
        jsonConfig
    );
    const retryParsed = parseJsonFromModelText(retryText);
    if (retryParsed !== null) {
        return retryParsed;
    }

    throw new AppError('AI returned invalid JSON', 502, 'INVALID_AI_JSON', {
        raw: retryText || firstText
    });
};

export const embedTexts = async (texts = []) => {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const normalizedTexts = texts.map((text) => (typeof text === 'string' ? text : String(text || '')));
    const model = env.geminiEmbeddingModel || 'gemini-embedding-001';
    const vectors = [];

    const shouldFallbackToLocal = (error) => env.localEmbeddingFallbackEnabled && (
        !env.geminiApiKey
        || /gemini/i.test(error.message || '')
        || /google/i.test(error.message || '')
        || /missing gemini_api_key/i.test(error.message || '')
        || /quota/i.test(error.message || '')
        || /rate limit/i.test(error.message || '')
        || /timed out/i.test(error.message || '')
        || [401, 402, 403, 429, 500, 502, 503, 504].includes(error.statusCode)
    );

    try {
        if (!env.geminiApiKey) {
            throw new AppError('Missing GEMINI_API_KEY', 500, 'MISSING_GEMINI_API_KEY');
        }

        for (let start = 0; start < normalizedTexts.length; start += GEMINI_EMBEDDING_BATCH_SIZE) {
            const batch = normalizedTexts.slice(start, start + GEMINI_EMBEDDING_BATCH_SIZE);
            let attempts = 0;
            while (attempts < 3) {
                try {
                    const data = await callGeminiWithTimeout(
                        getGeminiClient().models.embedContent({
                            model,
                            contents: batch,
                            config: {
                                outputDimensionality: env.embeddingDimensions || 768
                            }
                        })
                    );
                    const ordered = (data.embeddings || [])
                        .map((item) => item?.values || []);
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
    } catch (error) {
        if (!shouldFallbackToLocal(error)) {
            throw error;
        }

        return buildLocalEmbeddings(normalizedTexts);
    }
};
