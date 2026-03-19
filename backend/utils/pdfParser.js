import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export const extractTextFromPDF = async (filePath) => {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return {
            text: data.text || '',
            pageCount: data.numpages || 0
        };
    } catch (error) {
        console.error("Error reading PDF:", error);
        throw new Error('Failed to extract text from PDF');
    }
};
