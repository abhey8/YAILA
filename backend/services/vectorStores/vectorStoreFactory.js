import { env } from '../../config/env.js';
import { createMongoVectorStore } from './mongoVectorStore.js';
import { createEndeeVectorStore } from './endeeVectorStore.js';

let cachedStore = null;

export const getVectorStore = () => {
    if (cachedStore) {
        return cachedStore;
    }

    const mongoStore = createMongoVectorStore();

    cachedStore = env.vectorStoreProvider === 'endee'
        ? createEndeeVectorStore({ fallbackStore: mongoStore })
        : mongoStore;

    return cachedStore;
};

export const resetVectorStoreCache = () => {
    cachedStore = null;
};
