import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { generateJson, embedTexts } from './aiService.js';
import { recordLearningInteraction } from './analyticsService.js';
import { updateConceptMastery } from './masteryService.js';
import { createNotification } from './notificationService.js';
import { trackActivity } from './activityService.js';

const buildQuizPrompt = (documents, concepts, chunks, count) => `Generate a ${count}-question multiple choice quiz from the uploaded study materials.
Documents:
${documents.map((document) => `- ${document.title || document.originalName}`).join('\n')}

Available concepts:
${concepts.length ? concepts.map((concept) => `- ${concept.name}: ${concept.description}`).join('\n') : '- Use only the source excerpts below.'}

Source excerpts:
${chunks.map((chunk, index) => `Excerpt ${index + 1}
Document: ${chunk.documentTitle}
Section: ${chunk.sectionTitle || 'Untitled Section'}
${chunk.content}`).join('\n\n')}

Return a JSON array where each item has:
- question
- options (4 strings)
- correctAnswer
- explanation
- conceptNames (1-3 concept names from the list)

Rules:
- Every question must be answerable from the source excerpts only.
- Use multiple documents when relevant.
- Do not use outside knowledge.
- Keep explanations specific to the provided excerpts.`;

const lexicalScore = (needle, haystack) => {
    const tokens = (needle.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
    if (!tokens.length) {
        return 0;
    }

    const lowered = haystack.toLowerCase();
    const matches = tokens.filter((token) => lowered.includes(token)).length;
    return matches / tokens.length;
};

const toCitation = (chunk) => ({
    document: chunk.document,
    chunk: chunk._id,
    documentTitle: chunk.documentTitle,
    sectionTitle: chunk.sectionTitle || 'Untitled Section'
});

const selectQuestionCitations = (question, chunks) => chunks
    .map((chunk) => ({
        chunk,
        score: lexicalScore(question, `${chunk.content} ${chunk.summary || ''}`)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((entry) => toCitation(entry.chunk));

export const generateAdaptiveQuiz = async (documents, userId, count = 5) => {
    const documentIds = documents.map((document) => document._id);
    const [concepts, chunks] = await Promise.all([
        conceptRepository.listByDocuments(documentIds),
        chunkRepository.listByDocumentsOrdered(documentIds)
    ]);
    const chunkPool = chunks.slice(0, Math.min(Math.max(count * 4, 12), 24)).map((chunk) => ({
        ...chunk.toObject(),
        documentTitle: documents.find((document) => document._id.toString() === chunk.document.toString())?.title
            || documents.find((document) => document._id.toString() === chunk.document.toString())?.originalName
            || 'Uploaded Document'
    }));
    const questionsData = await generateJson(buildQuizPrompt(documents, concepts, chunkPool, count));
    const conceptByName = new Map(concepts.map((concept) => [concept.name.toLowerCase(), concept]));
    const questionEmbeddings = await embedTexts(questionsData.map((item) => item.question));

    return Quiz.create({
        document: documents[0]._id,
        user: userId,
        sourceDocuments: documentIds,
        title: documents.length === 1
            ? `${documents[0].title} - Adaptive Quiz`
            : 'Multi-Document Adaptive Quiz',
        questions: questionsData.map((item, index) => ({
            question: item.question,
            options: item.options,
            correctAnswer: item.correctAnswer,
            explanation: item.explanation,
            conceptTags: (item.conceptNames || [])
                .map((name) => conceptByName.get(name.toLowerCase())?._id)
                .filter(Boolean),
            conceptEmbedding: questionEmbeddings[index],
            citations: selectQuestionCitations(item.question, chunkPool)
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
