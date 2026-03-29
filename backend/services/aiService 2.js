import { GoogleGenAI } from '@google/genai';

const getModel = () => {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

export const generateSummary = async (text) => {
    try {
        const ai = getModel();
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: `Provide a concise, structured summary of the following text using bullet points and headings. Ensure it is well-organized and covers all key information:\n\n${text}`,
        });
        return response.text;
    } catch (error) {
        console.error('Error generating summary:', error);
        throw new Error('Failed to generate summary');
    }
};

export const explainConcept = async (concept, context, mode = 'simple') => {
    try {
        const ai = getModel();
        const prompt = mode === 'simple'
            ? `Explain the concept "${concept}" simply, as if to a beginner. Use the following context if relevant:\n\n${context}`
            : `Provide a deep, detailed explanation of the concept "${concept}", including technical nuances. Use the following context if relevant:\n\n${context}`;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error('Error explaining concept:', error);
        throw new Error('Failed to explain concept');
    }
};

export const chatWithDocument = async (message, context, history = []) => {
    try {
        const ai = getModel();
        const systemPrompt = `You are a helpful AI assistant. Use the following document context to answer the user's questions. If the answer is not in the context, say you don't know based on the document.\n\nContext:\n${context}`;

        // formatting history for gemini using simple messages
        let contents = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'Understood. I will base my answers on the provided context.' }] }
        ];

        history.forEach(msg => {
            contents.push({
                role: msg.role === 'ai' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            });
        });

        contents.push({ role: 'user', parts: [{ text: message }] });

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: contents,
        });
        return response.text;
    } catch (error) {
        console.error('Error chatting with document:', error);
        throw new Error('Failed to chat with document');
    }
};

export const generateFlashcards = async (text) => {
    try {
        const ai = getModel();
        const prompt = `Extract 10 key questions and answers from the following text to create flashcards. Format the output strictly as a JSON array of objects, where each object has "question" and "answer" string properties.\n\nText:\n${text}`;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
        });
        let result = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(result);
    } catch (error) {
        console.error('Error generating flashcards:', error);
        throw new Error('Failed to generate flashcards');
    }
};

export const generateQuizItems = async (text, count = 5) => {
    try {
        const ai = getModel();
        const prompt = `Generate a ${count}-question multiple choice quiz based on the following text. Format the output strictly as a JSON array of objects. Each object should have:
    - "question" (string)
    - "options" (array of 4 strings)
    - "correctAnswer" (string, must exactly match one of the options)
    - "explanation" (string explaining why the answer is correct)
    \nText:\n${text}`;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
        });
        let result = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(result);
    } catch (error) {
        console.error('Error generating quiz:', error);
        throw new Error('Failed to generate quiz');
    }
};
