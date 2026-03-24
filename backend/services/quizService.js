import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { generateJson, embedTexts } from './aiService.js';
import { recordLearningInteraction } from './analyticsService.js';
import { updateConceptMastery } from './masteryService.js';
import { createNotification } from './notificationService.js';
import { trackActivity } from './activityService.js';

const DIFFICULTY_GUIDANCE = {
    easy: 'Keep questions direct, definition-based, and single-step.',
    medium: 'Mix conceptual understanding with applied interpretation.',
    hard: 'Use deeper reasoning, multi-concept linkage, and tricky distractors that remain fair and document-grounded.'
};

const buildQuizFromConceptsPrompt = (documents, concepts, count, difficulty) => `Generate a ${count}-question multiple choice quiz from the core extracted study concepts.
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
- Focus exclusively on technical, academic, or core concept definitions and formulas.
- Difficulty level: ${difficulty.toUpperCase()}
- ${DIFFICULTY_GUIDANCE[difficulty]}`;

const buildQuizFromChunksPrompt = (documents, chunkText, count, difficulty) => `Generate a ${count}-question multiple choice quiz grounded strictly in the provided document excerpts.
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
- Keep questions specific and non-repetitive.
- Difficulty level: ${difficulty.toUpperCase()}
- ${DIFFICULTY_GUIDANCE[difficulty]}`;

const normalizeQuestions = (rawQuestions, fallbackCount) => {
    if (!Array.isArray(rawQuestions)) {
        return [];
    }

    return rawQuestions
        .filter((item) =>
            item
            && typeof item.question === 'string'
            && Array.isArray(item.options)
            && item.options.length >= 4
            && typeof item.correctAnswer === 'string'
        )
        .slice(0, fallbackCount)
        .map((item) => {
            const options = item.options
                .map((opt) => `${opt}`.trim())
                .filter(Boolean)
                .slice(0, 4);
            const correct = options.includes(item.correctAnswer) ? item.correctAnswer : options[0];

            return {
                question: `${item.question}`.trim(),
                options,
                correctAnswer: correct,
                explanation: `${item.explanation || ''}`.trim(),
                conceptNames: Array.isArray(item.conceptNames)
                    ? item.conceptNames.map((name) => `${name}`.trim()).filter(Boolean).slice(0, 3)
                    : []
            };
        });
};

const estimateQuizMaxTokens = (count, difficulty) => {
    const perQuestion = difficulty === 'hard' ? 320 : (difficulty === 'medium' ? 240 : 190);
    return Math.min(9000, Math.max(1500, 600 + count * perQuestion));
};

const shuffleArray = (items) => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

const fallbackQuizFromConcepts = (concepts, count) => {
    if (!concepts.length) {
        return [];
    }

    const questions = [];
    for (let index = 0; index < count; index += 1) {
        const concept = concepts[index % concepts.length];
        const distractors = concepts
            .filter((item) => item._id.toString() !== concept._id.toString())
            .slice(0, 3)
            .map((item) => `${item.name}: ${item.description}`);
        const correct = `${concept.name}: ${concept.description}`;
        const fillerDistractors = [
            `A broad overview statement that does not define ${concept.name}.`,
            `An unrelated interpretation that is not supported for ${concept.name}.`,
            `A partially true statement missing the key meaning of ${concept.name}.`
        ];
        const options = shuffleArray([correct, ...distractors, ...fillerDistractors]).slice(0, 4);

        questions.push({
            question: `Which option best describes the concept "${concept.name}" from the uploaded material?`,
            options,
            correctAnswer: options.includes(correct) ? correct : options[0],
            explanation: concept.description,
            conceptNames: [concept.name]
        });
    }
    return questions;
};

const fallbackQuizFromChunks = (chunks, count) => {
    if (!chunks.length) {
        return [];
    }
    const cleaned = chunks.map((chunk) => ({
        sectionTitle: chunk.sectionTitle || 'this section',
        snippet: (chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 180)
    })).filter((entry) => entry.snippet.length > 30);

    if (!cleaned.length) {
        return [];
    }

    const questions = [];
    for (let index = 0; index < count; index += 1) {
        const target = cleaned[index % cleaned.length];
        const distractorSnippets = cleaned
            .filter((entry, idx) => idx !== (index % cleaned.length))
            .slice(0, 3)
            .map((entry) => entry.snippet);
        const correct = target.snippet;
        const fillerDistractors = [
            `The excerpt does not support this statement about ${target.sectionTitle}.`,
            `This option generalizes beyond what ${target.sectionTitle} states.`,
            `This statement contradicts the provided excerpt from ${target.sectionTitle}.`
        ];
        const options = shuffleArray([correct, ...distractorSnippets, ...fillerDistractors]).slice(0, 4);
        questions.push({
            question: `According to ${target.sectionTitle}, which statement is supported by the document?`,
            options,
            correctAnswer: options.includes(correct) ? correct : options[0],
            explanation: `This statement comes directly from ${target.sectionTitle}.`,
            conceptNames: []
        });
    }

    return questions;
};

export const generateAdaptiveQuiz = async (documents, userId, options = {}) => {
    const count = Math.min(20, Math.max(5, Number(options.count) || 5));
    const difficulty = ['easy', 'medium', 'hard'].includes(options.difficulty) ? options.difficulty : 'medium';
    const documentIds = documents.map((document) => document._id);
    const concepts = await conceptRepository.listByDocuments(documentIds);
    const chunks = await chunkRepository.listByDocumentsOrdered(documentIds);

    // Filter concepts to most important ones
    const prioritizedConcepts = [...concepts].sort((a, b) => (b.importance || 0.5) - (a.importance || 0.5));
    const targetConcepts = prioritizedConcepts.slice(0, Math.max(count * 3, 15));

    let questionsData = [];
    const generationConfig = {
        maxTokens: estimateQuizMaxTokens(count, difficulty)
    };

    try {
        if (targetConcepts.length > 0) {
            questionsData = await generateJson(
                buildQuizFromConceptsPrompt(documents, targetConcepts, count, difficulty),
                generationConfig
            );
        } else {
        const excerptText = chunks
            .slice(0, Math.max(count * 4, 24))
            .map((chunk, index) => `Excerpt ${index + 1} (${chunk.sectionTitle || 'Section'}): ${chunk.content}`)
            .join('\n\n');

        if (!excerptText.trim()) {
            throw new Error('Quiz cannot be generated because document content is still unavailable.');
        }
            questionsData = await generateJson(
                buildQuizFromChunksPrompt(documents, excerptText, count, difficulty),
                generationConfig
            );
        }
    } catch (error) {
        questionsData = targetConcepts.length
            ? fallbackQuizFromConcepts(targetConcepts, count)
            : fallbackQuizFromChunks(chunks, count);
    }

    let normalizedQuestions = normalizeQuestions(questionsData, count);
    if (normalizedQuestions.length < count) {
        const retryPrompt = `Generate exactly ${count - normalizedQuestions.length} additional unique questions.
Return JSON array only.
Avoid repeating any of these existing questions:
${normalizedQuestions.map((q) => `- ${q.question}`).join('\n')}`;
        try {
            const retryQuestions = await generateJson(
                `${buildQuizFromConceptsPrompt(documents, targetConcepts.length ? targetConcepts : concepts.slice(0, 20), count - normalizedQuestions.length, difficulty)}\n\n${retryPrompt}`,
                generationConfig
            );
            normalizedQuestions = normalizeQuestions([...normalizedQuestions, ...(Array.isArray(retryQuestions) ? retryQuestions : [])], count);
        } catch (error) {
            const fallbackRemainder = (targetConcepts.length
                ? fallbackQuizFromConcepts(targetConcepts, count)
                : fallbackQuizFromChunks(chunks, count))
                .slice(0, count - normalizedQuestions.length);
            normalizedQuestions = normalizeQuestions([...normalizedQuestions, ...fallbackRemainder], count);
        }
    }

    if (!normalizedQuestions.length) {
        throw new Error('Quiz generation failed. Please retry.');
    }

    const conceptByName = new Map(targetConcepts.map((concept) => [concept.name.toLowerCase(), concept]));
    let questionEmbeddings = [];
    try {
        questionEmbeddings = await embedTexts(normalizedQuestions.map((item) => item.question));
    } catch (error) {
        questionEmbeddings = normalizedQuestions.map(() => []);
    }

    return Quiz.create({
        document: documents[0]._id,
        user: userId,
        sourceDocuments: documentIds,
        config: {
            count,
            difficulty
        },
        title: documents.length === 1
            ? `${documents[0].title} - Adaptive Concept Quiz`
            : 'Multi-Document Adaptive Concept Quiz',
        questions: normalizedQuestions.map((item, index) => ({
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
