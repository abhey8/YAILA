import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import { startRoadmapRegenerationJob } from './jobs/roadmapRegenerationJob.js';
import { resumeIncompleteIngestion } from './services/documentProcessingService.js';
import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import flashcardRoutes from './routes/flashcardRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import graphRoutes from './routes/graphRoutes.js';
import roadmapRoutes from './routes/roadmapRoutes.js';
import conceptRoutes from './routes/conceptRoutes.js';
import recallRoutes from './routes/recallRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/flashcards', flashcardRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/roadmaps', roadmapRoutes);
app.use('/api/concepts', conceptRoutes);
app.use('/api/recall', recallRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'API is healthy' });
});

app.use(notFound);
app.use(errorHandler);

process.env.MONGOMS_DOWNLOAD_DIR = path.join(process.cwd(), '.mongo-bin');
process.env.MONGOMS_RUNTIME_DIR = path.join(process.cwd(), '.mongo-runtime');
process.env.TMPDIR = path.join(process.cwd(), '.mongo-tmp');

const connectDB = async () => {
    try {
        let mongoUri = env.mongoUri;

        try {
            await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
            logger.info('Connected to MongoDB', { mode: 'configured-instance' });
        } catch (err) {
            logger.warn('Primary MongoDB unavailable, falling back to in-memory server');
            const mongoServer = await MongoMemoryServer.create();
            mongoUri = mongoServer.getUri();
            await mongoose.connect(mongoUri);
            logger.info('Connected to MongoDB', { mode: 'memory-server' });
        }

        app.listen(env.port, () => {
            logger.info('Server started', { port: env.port });
        });
        startRoadmapRegenerationJob();
        resumeIncompleteIngestion().catch((error) => {
            logger.error('Failed to resume pending document ingestion', { error: error.message });
        });
    } catch (error) {
        logger.error('Error connecting to MongoDB', { error: error.message });
    }
};

connectDB();
