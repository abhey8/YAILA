import express from 'express';
import { getDocumentGraph } from '../controllers/graphController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/document/:id', protect, getDocumentGraph);

export default router;
