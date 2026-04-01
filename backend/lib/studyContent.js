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
    /preface/i
];

const normalize = (value = '') => `${value}`.replace(/\s+/g, ' ').trim();

export const isLowValueStudyText = (content = '', sectionTitle = '') => {
    const normalizedContent = normalize(content);
    const normalizedSection = normalize(sectionTitle);

    if (!normalizedContent || normalizedContent.length < 12) {
        return true;
    }

    if (LOW_VALUE_SECTION_PATTERNS.some((pattern) => pattern.test(normalizedSection))) {
        return true;
    }

    return LOW_VALUE_PATTERNS.some((pattern) => pattern.test(normalizedContent) || pattern.test(normalizedSection));
};

export const filterStudyWorthChunks = (chunks = []) => chunks.filter((chunk) => !isLowValueStudyText(chunk?.content || '', chunk?.sectionTitle || ''));

export const isLowValueConcept = (concept) => {
    const name = concept?.name || concept?.label || '';
    const description = concept?.description || '';
    return isLowValueStudyText(`${name} ${description}`, name);
};

export const filterStudyWorthConcepts = (concepts = []) => concepts.filter((concept) => !isLowValueConcept(concept));
