export const normalizeWhitespace = (text = '') => `${text}`
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const tokenizeEstimate = (text = '') => Math.ceil(text.length / 4);

export const slugify = (value = '') => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();

export const stripCodeFences = (value = '') => value
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

export const splitParagraphs = (text = '') => text
    .split(/\n\s*\n/g)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean);
