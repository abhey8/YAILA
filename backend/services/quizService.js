import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { generateJson, embedTexts } from './aiService.js';
import { recordLearningInteraction } from './analyticsService.js';
import { updateConceptMastery } from './masteryService.js';
import { createNotification } from './notificationService.js';
import { trackActivity } from './activityService.js';
import { filterStudyWorthConcepts } from '../lib/studyContent.js';

const DIFFICULTY_GUIDANCE = {
    easy: 'Keep questions direct, definition-based, and single-step.',
    medium: 'Mix conceptual understanding with applied interpretation.',
    hard: 'Use deeper reasoning, multi-concept linkage, and fair distractors.'
};

const MAX_GENERATION_ATTEMPTS = 3;
const SEMANTIC_DUPLICATE_THRESHOLD = 0.72;

const buildQuizFromConceptsPrompt = (documents, concepts, count, difficulty, existingQuestions = []) => `Generate ${count} high-quality MCQs grounded strictly in the provided study concepts.
Documents:
${documents.map((document) => `- ${document.title || document.originalName}`).join('\n')}

Core concepts:
${concepts.map((concept) => `- ${concept.name}: ${concept.description}`).join('\n')}

Return JSON array only. Each item:
- question
- options (array of 4 strings)
- correctAnswer (must exactly match one option)
- explanation
- conceptNames (array with 1-3 concept names)

Rules:
- No outside knowledge.
- No repeated questions or near-duplicates.
- Cover varied concepts across the list.
- Ignore dedications, blank pages, front matter, and author biography content.
- Difficulty: ${difficulty.toUpperCase()}
- ${DIFFICULTY_GUIDANCE[difficulty]}
${existingQuestions.length ? `- Do not repeat these questions:\n${existingQuestions.map((q) => `  * ${q}`).join('\n')}` : ''}`;

const buildQuizFromChunksPrompt = (documents, chunkText, count, difficulty, existingQuestions = []) => `Generate ${count} MCQs grounded strictly in these document excerpts.
Documents:
${documents.map((document) => `- ${document.title || document.originalName}`).join('\n')}

Excerpts:
${chunkText}

Return JSON array only. Each item:
- question
- options (array of 4 strings)
- correctAnswer (must exactly match one option)
- explanation
- conceptNames (array, can be empty)

Rules:
- Questions must be answerable directly from excerpts.
- No outside knowledge.
- Avoid repeated or near-duplicate questions.
- Maintain concept/topic variety.
- Ignore dedications, blank pages, front matter, and author biography content.
- Difficulty: ${difficulty.toUpperCase()}
- ${DIFFICULTY_GUIDANCE[difficulty]}
${existingQuestions.length ? `- Do not repeat these questions:\n${existingQuestions.map((q) => `  * ${q}`).join('\n')}` : ''}`;

const normalizeQuestions = (rawQuestions, maxCount) => {
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
        .slice(0, maxCount)
        .map((item) => {
            const question = `${item.question}`.replace(/\s+/g, ' ').trim();
            const options = item.options
                .map((option) => `${option}`.replace(/\s+/g, ' ').trim())
                .filter(Boolean)
                .slice(0, 4);
            const uniqueOptions = [...new Set(options)];
            if (uniqueOptions.length < 4) {
                return null;
            }
            const correctAnswer = uniqueOptions.includes(item.correctAnswer) ? `${item.correctAnswer}`.trim() : uniqueOptions[0];
            const explanation = `${item.explanation || ''}`.replace(/\s+/g, ' ').trim();
            const conceptNames = Array.isArray(item.conceptNames)
                ? item.conceptNames.map((name) => `${name}`.trim()).filter(Boolean).slice(0, 3)
                : [];

            return {
                question,
                options: uniqueOptions,
                correctAnswer,
                explanation,
                conceptNames
            };
        })
        .filter((item) => item && item.question && item.options.length === 4 && item.correctAnswer);
};

const tokenize = (value = '') => `${value}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);

const jaccardSimilarity = (left = '', right = '') => {
    const leftTokens = new Set(tokenize(left));
    const rightTokens = new Set(tokenize(right));
    if (!leftTokens.size || !rightTokens.size) {
        return 0;
    }
    let overlap = 0;
    leftTokens.forEach((token) => {
        if (rightTokens.has(token)) {
            overlap += 1;
        }
    });
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union ? overlap / union : 0;
};

const dedupeSemantically = (questions = [], threshold = SEMANTIC_DUPLICATE_THRESHOLD) => {
    const deduped = [];
    for (const candidate of questions) {
        const duplicate = deduped.some((existing) => jaccardSimilarity(existing.question, candidate.question) >= threshold);
        if (!duplicate) {
            deduped.push(candidate);
        }
    }
    return deduped;
};

const enforceConceptVariety = (questions = [], desiredCount = 5) => {
    if (questions.length <= desiredCount) {
        return questions;
    }

    const buckets = new Map();
    questions.forEach((question, index) => {
        const key = question.conceptNames?.[0]?.toLowerCase() || `__unscoped_${index}`;
        const list = buckets.get(key) || [];
        list.push(question);
        buckets.set(key, list);
    });

    const orderedBuckets = [...buckets.values()].sort((a, b) => b.length - a.length);
    const selected = [];
    let round = 0;
    while (selected.length < desiredCount) {
        let added = false;
        for (const bucket of orderedBuckets) {
            if (bucket[round]) {
                selected.push(bucket[round]);
                added = true;
                if (selected.length >= desiredCount) {
                    break;
                }
            }
        }
        if (!added) {
            break;
        }
        round += 1;
    }

    return selected.slice(0, desiredCount);
};

const balanceCorrectAnswerPositions = (questions = []) => questions.map((question, index) => {
    const targetIndex = index % 4;
    const options = [...question.options];
    const correctAnswer = options.includes(question.correctAnswer) ? question.correctAnswer : options[0];
    const wrongOptions = options.filter((option) => option !== correctAnswer);
    const balancedOptions = [...wrongOptions];
    balancedOptions.splice(targetIndex, 0, correctAnswer);

    return {
        ...question,
        options: balancedOptions.slice(0, 4),
        correctAnswer
    };
});

const estimateQuizMaxTokens = (count, difficulty) => {
    const perQuestion = difficulty === 'hard' ? 280 : (difficulty === 'medium' ? 220 : 180);
    return Math.min(6500, Math.max(1200, 500 + count * perQuestion));
};

export const generateAdaptiveQuiz = async (documents, userId, options = {}) => {
    const count = Math.min(20, Math.max(5, Number(options.count) || 5));
    const difficulty = ['easy', 'medium', 'hard'].includes(options.difficulty) ? options.difficulty : 'medium';
    const documentIds = documents.map((document) => document._id);
    const concepts = filterStudyWorthConcepts(await conceptRepository.listByDocuments(documentIds));
    const chunks = await chunkRepository.listByDocumentsOrdered(documentIds);
    const excerptText = chunks
        .slice(0, Math.max(count * 4, 24))
        .map((chunk, index) => `Excerpt ${index + 1} (${chunk.sectionTitle || 'Section'}): ${(chunk.summary || chunk.content || '').replace(/\s+/g, ' ').trim().slice(0, 320)}`)
        .join('\n\n');

    if (!concepts.length && !excerptText.trim()) {
        throw new AppError('Quiz cannot be generated because document content is unavailable', 400, 'QUIZ_SOURCE_EMPTY');
    }

    const prioritizedConcepts = [...concepts].sort((a, b) => (b.importance || 0.5) - (a.importance || 0.5));
    const targetConcepts = prioritizedConcepts.slice(0, Math.max(count * 3, 18));
    const generationConfig = {
        maxTokens: estimateQuizMaxTokens(count, difficulty)
    };

    let collected = [];
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
        const existingQuestions = collected.map((item) => item.question).slice(0, 24);
        try {
            const payload = targetConcepts.length
                ? await generateJson(
                    buildQuizFromConceptsPrompt(documents, targetConcepts, count, difficulty, existingQuestions),
                    generationConfig
                )
                : await generateJson(
                    buildQuizFromChunksPrompt(documents, excerptText, count, difficulty, existingQuestions),
                    generationConfig
                );

            const normalized = normalizeQuestions(payload, count * 2);
            collected = dedupeSemantically([...collected, ...normalized]).slice(0, count * 2);
            if (collected.length >= count) {
                break;
            }
        } catch (error) {
            lastError = error;
            logger.warn('[Quiz] Generation attempt failed', {
                attempt,
                userId: userId.toString(),
                reason: error.message
            });
        }
    }

    if (!collected.length) {
        throw new AppError('Quiz generation failed', 502, 'QUIZ_GENERATION_FAILED', {
            requested: count,
            generated: 0,
            reason: lastError?.message || 'No quiz items generated'
        });
    }

    let finalQuestions = enforceConceptVariety(collected, count);
    finalQuestions = dedupeSemantically(finalQuestions).slice(0, count);
    finalQuestions = balanceCorrectAnswerPositions(finalQuestions);

    if (finalQuestions.length < count) {
        throw new AppError('Quiz generation did not meet uniqueness/coverage requirements', 502, 'QUIZ_LOW_QUALITY_OUTPUT', {
            requested: count,
            generated: finalQuestions.length
        });
    }

    const conceptByName = new Map(concepts.map((concept) => [concept.name.toLowerCase(), concept]));
    let questionEmbeddings = [];
    try {
        questionEmbeddings = await embedTexts(finalQuestions.map((item) => item.question));
    } catch (error) {
        logger.warn('[Quiz] Question embedding generation failed', {
            reason: error.message,
            userId: userId.toString()
        });
        questionEmbeddings = finalQuestions.map(() => []);
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
        questions: finalQuestions.map((item, index) => ({
            question: item.question,
            options: item.options,
            correctAnswer: item.correctAnswer,
            explanation: item.explanation,
            conceptTags: (item.conceptNames || [])
                .map((name) => conceptByName.get(name.toLowerCase())?._id)
                .filter(Boolean),
            conceptEmbedding: questionEmbeddings[index] || [],
            citations: []
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
