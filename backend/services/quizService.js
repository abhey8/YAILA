import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { formatChunksForPrompt, sampleChunksForPrompt } from '../lib/documentContext.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { generateJson, embedTexts } from './aiService.js';
import { recordLearningInteraction } from './analyticsService.js';
import { updateConceptMastery } from './masteryService.js';

const buildQuizPrompt = (document, concepts, chunks, count) => `Generate a ${count}-question multiple choice quiz for this study document.
Document title: ${document.title}

Available concepts:
${concepts.length ? concepts.map((concept) => `- ${concept.name}: ${concept.description}`).join('\n') : '- No concept graph available; rely on the source excerpts below.'}

Source excerpts:
${formatChunksForPrompt(chunks)}

Return a JSON array where each item has:
- question
- options (4 strings)
- correctAnswer
- explanation
- conceptNames (1-3 concept names from the list)

Rules:
- Every question must be answerable from the source excerpts.
- Do not use outside history, science, or general trivia.
- Make distractors plausible but still document-grounded.
- If the document does not support ${count} strong questions, still stay grounded to the document instead of inventing content.`;

export const generateAdaptiveQuiz = async (document, userId, count = 5) => {
    const concepts = await conceptRepository.listByDocument(document._id);
    const chunks = await chunkRepository.listByDocument(document._id);
    const sampledChunks = sampleChunksForPrompt(chunks, Math.min(Math.max(count, 8), 16));
    const questionsData = await generateJson(buildQuizPrompt(document, concepts, sampledChunks, count));
    const conceptByName = new Map(concepts.map((concept) => [concept.name.toLowerCase(), concept]));
    const questionEmbeddings = await embedTexts(questionsData.map((item) => item.question));

    return Quiz.create({
        document: document._id,
        user: userId,
        title: `${document.title} - Adaptive Quiz`,
        questions: questionsData.map((item, index) => ({
            question: item.question,
            options: item.options,
            correctAnswer: item.correctAnswer,
            explanation: item.explanation,
            conceptTags: (item.conceptNames || [])
                .map((name) => conceptByName.get(name.toLowerCase())?._id)
                .filter(Boolean),
            conceptEmbedding: questionEmbeddings[index]
        }))
    });
};

export const submitAdaptiveQuizAttempt = async (quiz, userId, answers) => {
    let score = 0;
    const conceptIds = new Set();

    const processedAnswers = answers.map((answer) => {
        const question = quiz.questions[answer.questionIndex];
        const isCorrect = question.correctAnswer === answer.selectedOption;
        if (isCorrect) {
            score += 1;
        }

        question.conceptTags.forEach((conceptId) => conceptIds.add(conceptId.toString()));

        return {
            questionIndex: answer.questionIndex,
            selectedOption: answer.selectedOption,
            isCorrect,
            conceptTags: question.conceptTags
        };
    });

    const attempt = await QuizAttempt.create({
        quiz: quiz._id,
        document: quiz.document,
        user: userId,
        score,
        totalQuestions: quiz.questions.length,
        answers: processedAnswers
    });

    const ratio = quiz.questions.length ? score / quiz.questions.length : 0;
    if (conceptIds.size) {
        await updateConceptMastery({
            userId,
            documentId: quiz.document,
            conceptIds: [...conceptIds],
            sourceType: 'quiz',
            score: ratio,
            sourceId: attempt._id
        });
        await recordLearningInteraction({
            userId,
            documentId: quiz.document,
            conceptIds: [...conceptIds],
            timeSpentSeconds: quiz.questions.length * 75,
            quizFailures: ratio < 0.6 ? 1 : 0,
            completionDelta: ratio * 0.05
        });
    }

    return { attempt, quiz };
};
