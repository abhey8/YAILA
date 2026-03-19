import express from 'express';
import { generateFlashcards, getFlashcardsByDocument, getFavoriteFlashcards, toggleFavorite, deleteFlashcard } from '../controllers/flashcardController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/favorites', protect, getFavoriteFlashcards);
router.post('/generate/:id', protect, generateFlashcards);
router.get('/document/:id', protect, getFlashcardsByDocument);
router.route('/:id')
    .delete(protect, deleteFlashcard);
router.put('/:id/favorite', protect, toggleFavorite);

export default router;
