export const sampleChunksForPrompt = (chunks, maxChunks = 12) => {
    if (!chunks.length || maxChunks <= 0) {
        return [];
    }

    if (chunks.length <= maxChunks) {
        return chunks;
    }

    const sampled = [];
    const usedIndexes = new Set();

    for (let position = 0; position < maxChunks; position += 1) {
        const index = Math.min(
            chunks.length - 1,
            Math.floor((position * (chunks.length - 1)) / Math.max(maxChunks - 1, 1))
        );

        if (!usedIndexes.has(index)) {
            usedIndexes.add(index);
            sampled.push(chunks[index]);
        }
    }

    return sampled;
};

export const formatChunksForPrompt = (chunks) => chunks
    .map((chunk, index) => `Excerpt ${index + 1}:\n${chunk.content}`)
    .join('\n\n');
