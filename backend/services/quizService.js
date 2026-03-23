import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { generateJson, embedTexts } from './aiService.js';
import { recordLearningInteraction } from './analyticsService.js';
import { updateConceptMastery } from './masteryService.js';
import { createNotification } from './notificationService.js';
import { trackActivity } from './activityService.js';

const buildQuizFromConceptsPrompt = (documents, concepts, count) => `Generate a ${count}-question multiple choice quiz from the core extracted study concepts.
Documents:
${documents.map((document) => `- ${document.title || document.originalName}`).join('\n')}

Core Concepts to Test:
${concepts.map((concept) => `- ${concept.name}: ${concept.description}`).join('\n')}

Return a JSON array where each item has:
- question (testing the concept)
- options (4 strings)
- correctAnswer
- explanation
- conceptNames (1-3 concept names from the list)

Rules:
- Questions MUST be derived strictly from the provided Concepts list.
- Do not use outside knowledge.
- Focus exclusively on technical, academic, or core concept definitions and formulas.`;

const buildQuizFromChunksPrompt = (documents, chunkText, count) => `Generate a ${count}-question multiple choice quiz grounded strictly in the provided document excerpts.
Documents:
${documents.map((document) => `- ${document.title || document.originalName}`).join('\n')}

Document Excerpts:
${chunkText}

Return a JSON array where each item has:
- question
- options (4 strings)
- correctAnswer
- explanation
- conceptNames (array, can be empty)

Rules:
- Questions must be answerable from the excerpts.
- Do not use outside knowledge.
- Keep questions specific and non-repetitive.`;

export const generateAdaptiveQuiz = async (documents, userId, count = 5) => {
    const documentIds = documents.map((document) => document._id);
    const concepts = await conceptRepository.listByDocuments(documentIds);

    // Filter concepts to most important ones
    const prioritizedConcepts = [...concepts].sort((a, b) => (b.importance || 0.5) - (a.importance || 0.5));
    const targetConcepts = prioritizedConcepts.slice(0, Math.max(count * 3, 15));

    let questionsData = [];
    if (targetConcepts.length > 0) {
        questionsData = await generateJson(buildQuizFromConceptsPrompt(documents, targetConcepts, count));
    } else {
        const chunks = await chunkRepository.listByDocumentsOrdered(documentIds);
        const excerptText = chunks
            .slice(0, Math.max(count * 4, 24))
            .map((chunk, index) => `Excerpt ${index + 1} (${chunk.sectionTitle || 'Section'}): ${chunk.content}`)
            .join('\n\n');

        if (!excerptText.trim()) {
            throw new Error('Quiz cannot be generated because document content is still unavailable.');
        }
        questionsData = await generateJson(buildQuizFromChunksPrompt(documents, excerptText, count));
    }

    const conceptByName = new Map(targetConcepts.map((concept) => [concept.name.toLowerCase(), concept]));
    let questionEmbeddings = [];
    try {
        questionEmbeddings = await embedTexts(questionsData.map((item) => item.question));
    } catch (error) {
        questionEmbeddings = questionsData.map(() => []);
    }

    return Quiz.create({
        document: documents[0]._id,
        user: userId,
        sourceDocuments: documentIds,
        title: documents.length === 1
            ? `${documents[0].title} - Adaptive Concept Quiz`
            : 'Multi-Document Adaptive Concept Quiz',
        questions: questionsData.map((item, index) => ({
            question: item.question,
            options: item.options,
            correctAnswer: item.correctAnswer,
            explanation: item.explanation,
            conceptTags: (item.conceptNames || [])
                .map((name) => conceptByName.get(name.toLowerCase())?._id)
                .filter(Boolean),
            conceptEmbedding: questionEmbeddings[index] || [],
            citations: [] // Citations omitted as questions are directly mapped to pure conceptual ideas now
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

    await trackActivity({
        userId,
        documentId: quiz.document,
        type: 'quiz-attempted',
        title: 'Quiz completed',
        description: `You scored ${score}/${quiz.questions.length} on ${quiz.title}.`,
        metadata: {
            quizId: quiz._id,
            score,
            totalQuestions: quiz.questions.length,
            sourceDocuments: quiz.sourceDocuments || [quiz.document]
        }
    });

    await createNotification({
        userId,
        documentId: quiz.document,
        type: 'quiz-feedback-ready',
        title: 'Quiz feedback ready',
        message: `Your results for ${quiz.title} are ready to review.`,
        metadata: {
            quizId: quiz._id,
            attemptId: attempt._id,
            score,
            totalQuestions: quiz.questions.length
        }
    });

    return { attempt, quiz };
};
