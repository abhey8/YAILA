import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env');

dotenv.config({ path: envPath, override: true, quiet: true });

const legacyProvider = `${process.env.AI_PROVIDER || ''}`.trim().toLowerCase();
const legacyGeminiKey = `${process.env.GEMINI_API_KEY || ''}`.trim();
const inferredGroqKey = /^gsk_/i.test(legacyGeminiKey) ? legacyGeminiKey : '';
const inferredGeminiKey = /^AIza/i.test(legacyGeminiKey) ? legacyGeminiKey : '';
const normalizedPrimaryProvider = (process.env.AI_PRIMARY_PROVIDER
    || (legacyProvider === 'gemini' ? 'gemini' : 'groq')
    || 'groq')
    .trim()
    .toLowerCase();
const normalizedFallbackProvider = (process.env.AI_FALLBACK_PROVIDER
    || (normalizedPrimaryProvider === 'gemini' ? 'groq' : 'gemini')
    || 'gemini')
    .trim()
    .toLowerCase();

export const env = {
    port: Number(process.env.PORT || 5000),
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/ai-learning-assistant',
    jwtSecret: process.env.JWT_SECRET || 'change-me',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    aiPrimaryProvider: normalizedPrimaryProvider,
    aiFallbackProvider: normalizedFallbackProvider,
    geminiApiKey: `${process.env.GEMINI_API_KEY || inferredGeminiKey}`.trim(),
    geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
    geminiChatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash',
    geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    groqApiKey: `${process.env.GROQ_API_KEY || inferredGroqKey}`.trim(),
    groqBaseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    groqChatModel: process.env.GROQ_CHAT_MODEL || 'llama-3.1-8b-instant',
    aiMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 1200),
    chatMaxOutputTokens: Number(process.env.CHAT_MAX_OUTPUT_TOKENS || 420),
    lowCreditMode: process.env.LOW_CREDIT_MODE === 'true',
    embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS || 768),
    embeddingBatchSize: Number(process.env.EMBEDDING_BATCH_SIZE || 32),
    localEmbeddingFallbackEnabled: process.env.LOCAL_EMBEDDING_FALLBACK !== 'false',
    vectorStoreProvider: `${process.env.VECTOR_STORE_PROVIDER || 'mongo'}`.trim().toLowerCase(),
    vectorStoreNamespace: `${process.env.VECTOR_STORE_NAMESPACE || 'yaila'}`.trim().toLowerCase(),
    persistChunkEmbeddings: process.env.PERSIST_CHUNK_EMBEDDINGS !== 'false',
    endeeBaseUrl: `${process.env.ENDEE_BASE_URL || 'http://localhost:8080'}`.replace(/\/+$/g, ''),
    endeeAuthToken: `${process.env.ENDEE_AUTH_TOKEN || ''}`.trim(),
    endeeIndexName: `${process.env.ENDEE_INDEX_NAME || 'document-chunks'}`.trim(),
    endeeSpaceType: `${process.env.ENDEE_SPACE_TYPE || 'cosine'}`.trim(),
    endeePrecision: `${process.env.ENDEE_PRECISION || 'int16'}`.trim(),
    endeeEfSearch: Number(process.env.ENDEE_EF_SEARCH || 64),
    endeeIncludeVectors: process.env.ENDEE_INCLUDE_VECTORS === 'true',
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
    retrievalContextRadius: Number(process.env.RETRIEVAL_CONTEXT_RADIUS || 1),
    roadmapRefreshHours: Number(process.env.ROADMAP_REFRESH_HOURS || 168),
    resumeIngestionOnBoot: process.env.RESUME_INGESTION_ON_BOOT === 'true',
    aiRoutingEnabled: process.env.AI_ROUTING_ENABLED === 'true',
    aiCacheEnabled: process.env.AI_CACHE_ENABLED === 'true',
    aiQueueEnabled: process.env.AI_QUEUE_ENABLED === 'true',
    aiSummaryEnabled: process.env.AI_SUMMARY_ENABLED === 'true',
    docChunkingEnabled: process.env.DOC_CHUNKING_ENABLED !== 'false', // Default true based on usage
    docEmbeddingEnabled: process.env.DOC_EMBEDDING_ENABLED !== 'false',
    ocrEnabled: process.env.OCR_ENABLED === 'true',
    hierarchicalSummaryEnabled: process.env.HIERARCHICAL_SUMMARY === 'true',
    documentUploadMaxMb: Number(process.env.DOCUMENT_UPLOAD_MAX_MB || 100),
    ingestionPageBatchSize: Number(process.env.INGESTION_PAGE_BATCH_SIZE || 16),
    ingestionChunkBatchSize: Number(process.env.INGESTION_CHUNK_BATCH_SIZE || 24),
    ingestionWorkerConcurrency: Number(process.env.INGESTION_WORKER_CONCURRENCY || 2),
    ingestionCheckpointEnabled: process.env.INGESTION_CHECKPOINT_ENABLED !== 'false',
    ingestionPreviewChars: Number(process.env.INGESTION_PREVIEW_CHARS || 24000),
    ingestionDedupRepeatedPages: process.env.INGESTION_DEDUP_REPEATED_PAGES !== 'false',
    aiChunkSummariesEnabled: process.env.INGESTION_USE_AI_CHUNK_SUMMARIES === 'true',
    chunkSummaryBatchSize: Number(process.env.CHUNK_SUMMARY_BATCH_SIZE || 6),
    chunkSummaryMaxTokens: Number(process.env.CHUNK_SUMMARY_MAX_TOKENS || 80),
    chunkMaxChars: Number(process.env.CHUNK_MAX_CHARS || 1400),
    chunkOverlapChars: Number(process.env.CHUNK_OVERLAP_CHARS || 250),
    chunkMinChars: Number(process.env.CHUNK_MIN_CHARS || 120),
    maxTotalChunksPerDoc: Number(process.env.MAX_TOTAL_CHUNKS_PER_DOC || 400),
    chunkHeadingMaxLength: Number(process.env.CHUNK_HEADING_MAX_LENGTH || 90)
};
