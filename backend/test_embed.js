import { embedTexts } from './services/aiService.js';
import dotenv from 'dotenv';
dotenv.config({ override: true });

async function test() {
    try {
        console.log("Testing embeddings with key: " + process.env.GEMINI_API_KEY.slice(0, 10));
        const res = await embedTexts(["This is a test"]);
        console.log("Success! Length:", res.length);
    } catch (e) {
        console.error("Failed:", e);
    }
}
test();
