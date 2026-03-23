import fs from 'fs';
import { createRequire } from 'module';
import { logger } from '../lib/logger.js';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export const extractTextFromPDF = async (filePath) => {
    try {
        const dataBuffer = await fs.promises.readFile(filePath);
        const data = await pdfParse(dataBuffer);
        return {
            text: data.text || '',
            pageCount: data.numpages || 0
        };
    } catch (error) {
        logger.warn('[PDF Parser] Failed to extract text', { error: error.message });
        throw new Error('Failed to extract text from PDF');
    }
};
