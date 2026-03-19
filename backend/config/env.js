import dotenv from 'dotenv';

dotenv.config();

export const env = {
    port: Number(process.env.PORT || 5000),
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/ai-learning-assistant',
    jwtSecret: process.env.JWT_SECRET || 'change-me',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiChatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash-lite',
    geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS || 768),
    retrievalTopK: Number(process.env.RETRIEVAL_TOP_K || 6),
    roadmapRefreshHours: Number(process.env.ROADMAP_REFRESH_HOURS || 168)
};
