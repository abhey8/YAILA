import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export const extractTextFromImage = async (filePath) => {
    if (!env.ocrEnabled) {
        throw new Error("OCR is currently disabled. Enable OCR_ENABLED in .env.");
    }

    try {
        const tesseract = await import('tesseract.js');
        logger.info(`[OCR Service] Beginning text extraction for image: ${filePath}`);
        
        const { data: { text } } = await tesseract.recognize(filePath, 'eng', {
            logger: m => console.log(`[Tesseract] ${m.status}: ${Math.round(m.progress * 100)}%`)
        });
        
        logger.info(`[OCR Service] Successfully extracted ${text.length} characters.`);
        return text;
    } catch (error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
            logger.error(`[OCR Service] tesseract.js is not installed locally.`);
            throw new Error(`OCR processing failed: 'tesseract.js' is required. Please install it using 'npm install tesseract.js' (you may need to fix npm permissions first).`);
        }
        logger.error(`[OCR Service] Failed to process image: ${error.message}`);
        throw new Error(`OCR Processing Failed: ${error.message}`);
    }
};
