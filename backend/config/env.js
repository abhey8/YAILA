import dotenv from 'dotenv';

dotenv.config({ override: true });

export const env = {
    port: Number(process.env.PORT || 5000),
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/ai-learning-assistant',
    jwtSecret: process.env.JWT_SECRET || 'change-me',
    aiProvider: (process.env.AI_PROVIDER || 'auto').toLowerCase(),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiChatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash',
    geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    openrouterChatModel: process.env.OPENROUTER_CHAT_MODEL || '',
    openrouterEmbeddingModel: process.env.OPENROUTER_EMBEDDING_MODEL || 'text-embedding-3-small',
    openrouterAppName: process.env.OPENROUTER_APP_NAME || 'AI Learning Platform',
    openrouterSiteUrl: process.env.OPENROUTER_SITE_URL || '',
    aiMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 1200),
    embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS || 768),
    retrievalTopK: Number(process.env.RETRIEVAL_TOP_K || 6),
    roadmapRefreshHours: Number(process.env.ROADMAP_REFRESH_HOURS || 168),
    resumeIngestionOnBoot: process.env.RESUME_INGESTION_ON_BOOT === 'true',
    aiRoutingEnabled: process.env.AI_ROUTING_ENABLED === 'true',
    aiCacheEnabled: process.env.AI_CACHE_ENABLED === 'true',
    aiQueueEnabled: process.env.AI_QUEUE_ENABLED === 'true',
    aiSummaryEnabled: process.env.AI_SUMMARY_ENABLED === 'true',
    docChunkingEnabled: process.env.DOC_CHUNKING_ENABLED !== 'false', // Default true based on usage
    docEmbeddingEnabled: process.env.DOC_EMBEDDING_ENABLED !== 'false',
    ocrEnabled: process.env.OCR_ENABLED === 'true',
    hierarchicalSummaryEnabled: process.env.HIERARCHICAL_SUMMARY === 'true'
};
