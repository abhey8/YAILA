import { env } from '../config/env.js';

const tokenize = (text = '') => `${text}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2);

const hashToken = (value = '') => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const addHashedWeight = (vector, token, weight) => {
    const hash = hashToken(token);
    const sign = (hashToken(`${token}:sign`) & 1) === 0 ? 1 : -1;
    const index = hash % vector.length;
    vector[index] += sign * weight;
};

const addCharacterGrams = (vector, token, weight) => {
    if (token.length < 5) {
        return;
    }
    for (let index = 0; index <= token.length - 3; index += 1) {
        addHashedWeight(vector, `gram:${token.slice(index, index + 3)}`, weight * 0.35);
    }
};

const normalizeVector = (vector) => {
    let magnitude = 0;
    for (let index = 0; index < vector.length; index += 1) {
        magnitude += vector[index] ** 2;
    }

    if (!magnitude) {
        return Array.from(vector);
    }

    const divisor = Math.sqrt(magnitude);
    return Array.from(vector, (value) => Number((value / divisor).toFixed(6)));
};

const embedSingleText = (text, dimensions) => {
    const vector = new Float32Array(dimensions);
    const tokens = tokenize(text);
    if (!tokens.length) {
        return Array.from(vector);
    }

    const frequency = new Map();
    tokens.forEach((token) => {
        frequency.set(token, (frequency.get(token) || 0) + 1);
    });

    frequency.forEach((count, token) => {
        const weight = 1 + Math.log1p(count);
        addHashedWeight(vector, token, weight);
        addCharacterGrams(vector, token, weight);
    });

    return normalizeVector(vector);
};

export const buildLocalEmbeddings = (texts = [], dimensions = env.embeddingDimensions || 768) => {
    const safeDimensions = Math.max(128, Number(dimensions) || 768);
    return texts.map((text) => embedSingleText(typeof text === 'string' ? text : String(text || ''), safeDimensions));
};
