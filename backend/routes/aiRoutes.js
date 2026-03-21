import express from 'express';
import {
    summarizeDocument,
    explainText,
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
router.post('/chat/collection', protect, chatDocumentCollection);
router.get('/chat/collection', protect, getCollectionChatHistory);
router.route('/chat/:id')
    .post(protect, chatDocument)
    .get(protect, getChatHistory);

export default router;
