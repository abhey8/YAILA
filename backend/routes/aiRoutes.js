import express from 'express';
import {
    summarizeDocument,
    explainText,
    retrieveContext,
    chatDocument,
    chatDocumentCollection,
    getChatHistory,
    getCollectionChatHistory,
    getConfusionSignals
} from '../controllers/aiController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/document/:id/summary', protect, summarizeDocument);
router.get('/document/:id/confusion', protect, getConfusionSignals);
router.post('/explain', protect, explainText);
router.post('/retrieve', protect, retrieveContext);
router.post('/chat/collection', protect, chatDocumentCollection);
router.get('/chat/collection', protect, getCollectionChatHistory);
router.route('/chat/:id')
    .post(protect, chatDocument)
    .get(protect, getChatHistory);

import { env } from '../config/env.js';
import { embedTexts } from '../services/aiService.js';

router.get('/test', async (req, res) => {
    try {
        const result = await embedTexts(["Test text 1", "Test text 2"]);
        res.json({
            success: true,
            primaryProvider: env.aiPrimaryProvider,
            fallbackProvider: env.aiFallbackProvider,
            model: env.aiPrimaryProvider === 'groq' ? env.groqChatModel : env.geminiChatModel,
            length: result.length,
            sample: result[0]?.slice(0, 3) 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

export default router;
