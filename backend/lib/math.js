export const cosineSimilarity = (vectorA = [], vectorB = []) => {
    if (!vectorA.length || !vectorB.length || vectorA.length !== vectorB.length) {
        return 0;
    }

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let index = 0; index < vectorA.length; index += 1) {
        dot += vectorA[index] * vectorB[index];
        magA += vectorA[index] ** 2;
        magB += vectorB[index] ** 2;
    }

    if (!magA || !magB) {
        return 0;
    }

    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
