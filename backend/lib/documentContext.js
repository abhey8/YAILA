export const sampleChunksForPrompt = (chunks, maxChunks = 12) => {
    if (!chunks.length || maxChunks <= 0) {
        return [];
    }

    if (chunks.length <= maxChunks) {
        return chunks;
    }

    // Filter out likely intro chunks from the start of the list before sampling
    let startOffset = 0;
    while (startOffset < Math.min(chunks.length, 6)) {
        const section = (chunks[startOffset].sectionTitle || '').toUpperCase();
        const content = (chunks[startOffset].content || '').toUpperCase();
        const isIntro = section.includes('PREFACE') || 
                        section.includes('ACKNOWLEDGMENT') || 
                        section.includes('DEDICATION') ||
                        content.includes('PUBLISHED BY') ||
                        content.includes('ALL RIGHTS RESERVED');
        
        if (isIntro) {
            startOffset += 1;
        } else {
            break;
        }
    }

    const pool = startOffset > 0 ? chunks.slice(startOffset) : chunks;
    const sampled = [];
    const usedIndexes = new Set();

    for (let position = 0; position < maxChunks; position += 1) {
        const index = Math.min(
            pool.length - 1,
            Math.floor((position * (pool.length - 1)) / Math.max(maxChunks - 1, 1))
        );

        if (!usedIndexes.has(index)) {
            usedIndexes.add(index);
            sampled.push(pool[index]);
        }
    }

    return sampled;
};

export const formatChunksForPrompt = (chunks) => chunks
    .map((chunk, index) => `Excerpt ${index + 1}:\n${chunk.content}`)
    .join('\n\n');
