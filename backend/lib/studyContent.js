const LOW_VALUE_PATTERNS = [
    /this page intentionally left blank/i,
    /\bto martha\b/i,
    /\babout the author\b/i,
    /\ball rights reserved\b/i,
    /\bpublished by\b/i,
    /\bcopyright\b/i,
    /\bconnect learn succeed\b/i,
    /\bmcgraw[- ]hill\b/i
];

const LOW_VALUE_SECTION_PATTERNS = [
    /dedication/i,
    /about the author/i,
    /acknowledg/i,
    /copyright/i,
    /table of contents/i,
    /preface/i,
    /use of the book/i,
    /prerequisites/i,
    /support on the world wide web/i,
    /^exercises?$/i
];

const normalize = (value = '') => `${value}`.replace(/\s+/g, ' ').trim();
const squash = (value = '') => normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

const hasNoisyLetterSpacing = (content = '') => {
    const tokens = normalize(content).split(/\s+/).filter(Boolean);
    if (tokens.length < 8) {
        return false;
    }

    const singleLetterTokens = tokens.filter((token) => /^[a-z]$/i.test(token)).length;
    return (singleLetterTokens / tokens.length) >= 0.22;
};

const hasControlCharNoise = (content = '') => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(`${content}`);

const isFrontMatterLike = (content = '', sectionTitle = '') => {
    const squashedContent = squash(content);
    const squashedSection = squash(sectionTitle);
    return [
        'tableofcontents',
        'preface',
        'acknowledgements',
        'acknowledgments',
        'useofthebook',
        'prerequisites',
        'supportontheworldwideweb',
        'abouttheauthor',
        'copyright',
        'allrightsreserved'
    ].some((marker) => squashedContent.includes(marker) || squashedSection.includes(marker));
};

export const isLowValueStudyText = (content = '', sectionTitle = '') => {
    const normalizedContent = normalize(content);
    const normalizedSection = normalize(sectionTitle);

    if (!normalizedContent || normalizedContent.length < 12) {
        return true;
    }

    if (LOW_VALUE_SECTION_PATTERNS.some((pattern) => pattern.test(normalizedSection))) {
        return true;
    }

    if (hasControlCharNoise(content) || hasNoisyLetterSpacing(normalizedContent) || isFrontMatterLike(normalizedContent, normalizedSection)) {
        return true;
    }

    return LOW_VALUE_PATTERNS.some((pattern) => pattern.test(normalizedContent) || pattern.test(normalizedSection));
};

export const filterStudyWorthChunks = (chunks = []) => chunks.filter((chunk) => !isLowValueStudyText(chunk?.content || '', chunk?.sectionTitle || ''));

export const isLowValueConcept = (concept) => {
    const name = concept?.name || concept?.label || '';
    const description = concept?.description || '';
    const normalizedName = normalize(name);
    if (!normalizedName || normalizedName.length < 3) {
        return true;
    }

    if (
        /^exercises?( for section)?$/i.test(normalizedName)
        || /^summary of chapter/i.test(normalizedName)
        || /^table of contents$/i.test(normalizedName)
        || /^use of the book$/i.test(normalizedName)
        || /^prerequisites?$/i.test(normalizedName)
        || /^support on the world wide web$/i.test(normalizedName)
        || /^about the author$/i.test(normalizedName)
        || /^copyright$/i.test(normalizedName)
    ) {
        return true;
    }

    if ((normalizedName.match(/\b[a-z0-9]\b/gi) || []).length >= 4) {
        return true;
    }

    return isLowValueStudyText(`${name} ${description}`, name);
};

export const filterStudyWorthConcepts = (concepts = []) => concepts.filter((concept) => {
    if (isLowValueConcept(concept)) {
        return false;
    }

    if (Array.isArray(concept?.chunkRefs) && concept.chunkRefs.length === 0) {
        return false;
    }

    return true;
});
