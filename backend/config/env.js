import dotenv from 'dotenv';

dotenv.config({ override: true });

export const env = {
    port: Number(process.env.PORT || 5000),
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/ai-learning-assistant',
    jwtSecret: process.env.JWT_SECRET || 'change-me',
    aiProvider: (process.env.AI_PROVIDER || 'auto').toLowerCase(),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    geminiChatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash',
    geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    openrouterModel: process.env.OPENROUTER_MODEL || process.env.OPENROUTER_CHAT_MODEL || 'anthropic/claude-3.5-sonnet',
    openrouterEmbeddingModel: process.env.OPENROUTER_EMBEDDING_MODEL || 'text-embedding-3-small',
    openrouterAppName: process.env.OPENROUTER_APP_NAME || 'AI Learning Platform',
    openrouterSiteUrl: process.env.OPENROUTER_SITE_URL || '',
    aiMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 1200),
    chatMaxOutputTokens: Number(process.env.CHAT_MAX_OUTPUT_TOKENS || 420),
    lowCreditMode: process.env.LOW_CREDIT_MODE !== 'false',
    embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS || 768),
    retrievalTopK: Number(process.env.RETRIEVAL_TOP_K || 6),
    intelligenceV2Enabled: process.env.INTELLIGENCE_V2_ENABLED === 'true',
    retrievalVectorCandidatePool: Number(process.env.RETRIEVAL_VECTOR_CANDIDATE_POOL || 24),
    retrievalLexicalCandidatePool: Number(process.env.RETRIEVAL_LEXICAL_CANDIDATE_POOL || 24),
    retrievalMergedCandidatePool: Number(process.env.RETRIEVAL_MERGED_CANDIDATE_POOL || 36),
    retrievalRerankPoolSize: Number(process.env.RETRIEVAL_RERANK_POOL_SIZE || 16),
    retrievalFinalContextSize: Number(process.env.RETRIEVAL_FINAL_CONTEXT_SIZE || 4),
    retrievalMaxPerSection: Number(process.env.RETRIEVAL_MAX_PER_SECTION || 2),
    retrievalMaxPerWindow: Number(process.env.RETRIEVAL_MAX_PER_WINDOW || 3),
    retrievalNearDuplicateThreshold: Number(process.env.RETRIEVAL_NEAR_DUPLICATE_THRESHOLD || 0.88),
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
