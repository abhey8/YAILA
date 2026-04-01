import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { env } from '../../config/env.js';

const normalizeContent = (content) => {
    if (typeof content === 'string') {
        return content.trim();
    }
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') return part;
                if (part && typeof part.text === 'string') return part.text;
                return '';
            })
            .join('')
            .trim();
    }
    return '';
};

export const withTimeout = (promise, ms = 5000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise
        .then((value) => {
            clearTimeout(timer);
            resolve(value);
        })
        .catch((error) => {
            clearTimeout(timer);
            reject(error);
        });
});

export const retry = async (fn, retries = 2) => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
};

let groqClient = null;
let geminiClient = null;
const normalizeGroqBaseUrl = (value = '') => `${value}`
    .trim()
    .replace(/\/openai\/v1\/?$/i, '')
    .replace(/\/+$/g, '');

const getGeminiClient = () => {
    if (!geminiClient) {
        geminiClient = new GoogleGenAI({ apiKey: env.geminiApiKey });
    }
    return geminiClient;
};

const getGroqClient = () => {
    if (!groqClient) {
        const config = { apiKey: env.groqApiKey };
        const customBaseUrl = normalizeGroqBaseUrl(env.groqBaseUrl);
        config.baseURL = customBaseUrl || 'https://api.groq.com';
        groqClient = new Groq(config);
    }
    return groqClient;
};

const normalizeMessageText = (value) => {
    if (typeof value === 'string') {
        return value.trim();
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeMessageText(item)).filter(Boolean).join('\n').trim();
    }
    if (value && typeof value === 'object') {
        if (typeof value.text === 'string') {
            return value.text.trim();
        }
        if (typeof value.content === 'string') {
            return value.content.trim();
        }
    }
    return '';
};

const convertMessagesToGeminiPayload = (messages = []) => {
    const systemInstructions = [];
    const contents = [];

    messages.forEach((message) => {
        const text = normalizeMessageText(message?.content);
        if (!text) {
            return;
        }

        if (message.role === 'system') {
            systemInstructions.push(text);
            return;
        }

        contents.push({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text }]
        });
    });

    return {
        contents: contents.length ? contents : [{ role: 'user', parts: [{ text: '' }] }],
        systemInstruction: systemInstructions.join('\n\n').trim() || undefined
    };
};

export const callGemini = async (messages, options = {}) => {
    if (!env.geminiApiKey) {
        throw new Error('Missing GEMINI_API_KEY');
    }

    const model = options.model || env.geminiChatModel;
    const payload = convertMessagesToGeminiPayload(messages);
    const response = await retry(
        () => withTimeout(
            getGeminiClient().models.generateContent({
                model,
                contents: payload.contents,
                config: {
                    systemInstruction: payload.systemInstruction,
                    maxOutputTokens: options.maxTokens,
                    responseMimeType: options.responseMimeType,
                    temperature: options.temperature
                }
            }),
            options.timeoutMs || 12000
        ),
        2
    );

    const content = normalizeContent(response?.text || response?.candidates?.[0]?.content?.parts);
    if (!content) {
        throw new Error('Empty response from Gemini');
    }
    return { content, provider: 'gemini' };
};

export const callGroq = async (messages, options = {}) => {
    if (!env.groqApiKey) {
        throw new Error('Missing GROQ_API_KEY');
    }
    const model = options.model || env.groqChatModel;
    const response = await retry(
        () => withTimeout(
            getGroqClient().chat.completions.create({
                model,
                messages,
                max_tokens: options.maxTokens
            }),
            options.timeoutMs || 22000
        ),
        2
    );
    const content = normalizeContent(response?.choices?.[0]?.message?.content);
    if (!content) {
        throw new Error('Empty response from Groq');
    }
    return { content, provider: 'groq' };
};

const providerCallers = {
    gemini: callGemini,
    groq: callGroq
};

export const generateWithFallback = async (messages, options = {}) => {
    const orderedProviders = [env.aiPrimaryProvider, env.aiFallbackProvider]
        .map((provider) => `${provider || ''}`.trim().toLowerCase())
        .filter(Boolean)
        .filter((provider, index, list) => providerCallers[provider] && list.indexOf(provider) === index);

    let lastError;
    for (const provider of orderedProviders) {
        try {
            return await providerCallers[provider](messages, options[provider] || { maxTokens: options.maxTokens });
        } catch (error) {
            lastError = error;
            console.error({
                provider,
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    if (lastError) {
        throw new Error(lastError.message || 'All providers failed');
    }

    throw new Error('No AI providers configured');
};
