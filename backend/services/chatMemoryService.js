const truncateWords = (text = '', limit = 28) => {
    const words = `${text}`.trim().split(/\s+/).filter(Boolean);
    if (words.length <= limit) {
        return words.join(' ');
    }
    return `${words.slice(0, limit).join(' ')} ...`;
};

const dedupeOrdered = (items = []) => {
    const seen = new Set();
    return items.filter((item) => {
        const key = `${item}`;
        if (!key || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const summarizeMessage = (message = '', role = 'user') => {
    const compact = truncateWords(message, role === 'user' ? 20 : 28);
    return compact.replace(/\s+/g, ' ').trim();
};

export const buildRollingSummary = ({
    existingSummary = '',
    messages = []
} = {}) => {
    const recent = messages.slice(-10);
    const recentUserGoals = dedupeOrdered(
        recent
            .filter((item) => item.role === 'user')
            .slice(-4)
            .map((item) => summarizeMessage(item.content, 'user'))
    );
    const recentTutorReplies = dedupeOrdered(
        recent
            .filter((item) => item.role === 'ai')
            .slice(-3)
            .map((item) => summarizeMessage(item.content, 'ai'))
    );
    const citedSections = dedupeOrdered(
        recent.flatMap((item) => (item.citations || []).map((citation) => {
            const section = `${citation.sectionTitle || ''}`.trim();
            const documentTitle = `${citation.documentTitle || ''}`.trim();
            if (!section && !documentTitle) {
                return '';
            }
            return section ? `${documentTitle}: ${section}` : documentTitle;
        }))
    ).slice(0, 5);

    const lines = [
        existingSummary ? `Previous context: ${truncateWords(existingSummary, 45)}` : '',
        recentUserGoals.length ? `Recent user goals: ${recentUserGoals.join(' | ')}` : '',
        recentTutorReplies.length ? `Recent tutor support: ${recentTutorReplies.join(' | ')}` : '',
        citedSections.length ? `Relevant sections: ${citedSections.join(' | ')}` : ''
    ].filter(Boolean);

    return truncateWords(lines.join('\n'), 120);
};

export const mergeConversationHistory = ({
    persistedMessages = [],
    requestHistory = []
} = {}) => {
    const normalized = [...persistedMessages, ...requestHistory]
        .filter((item) => item && item.role && item.content)
        .map((item) => ({
            role: item.role,
            content: `${item.content}`.trim()
        }));

    const deduped = [];
    for (const item of normalized) {
        const last = deduped[deduped.length - 1];
        if (last && last.role === item.role && last.content === item.content) {
            continue;
        }
        deduped.push(item);
    }

    return deduped.slice(-12);
};
