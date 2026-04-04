import express from 'express';
import { registerUser, loginUser, guestLogin, getUserProfile, updateUserProfile, uploadProfilePhoto } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { imageUpload } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/guest', guestLogin);
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.post('/profile/photo', protect, imageUpload.single('image'), uploadProfilePhoto);

export default router;
