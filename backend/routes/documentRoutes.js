import express from 'express';
import { uploadDocument, getUserDocuments, getDocumentById, deleteDocument } from '../controllers/documentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.route('/')
    .post(protect, upload.single('file'), uploadDocument)
    .get(protect, getUserDocuments);

router.route('/:id')
    .get(protect, getDocumentById)
    .delete(protect, deleteDocument);

export default router;
