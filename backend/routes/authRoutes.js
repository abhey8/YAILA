import express from 'express';
import { registerUser, loginUser, getUserProfile, updateUserProfile, uploadProfilePhoto } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { imageUpload } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.post('/profile/photo', protect, (req, res) => res.json({ msg: "I ACTUALLY MET THIS ROUTE" }));

export default router;
