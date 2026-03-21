import { AppError } from '../lib/errors.js';
import { sessionRepository } from '../repositories/sessionRepository.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { masteryRepository } from '../repositories/masteryRepository.js';
import { generateJson } from './aiService.js';
import { recordLearningInteraction } from './analyticsService.js';
import { updateConceptMastery } from './masteryService.js';
import { trackActivity } from './activityService.js';

const createQuestionPrompt = (concept) => `You are an active recall tutor.
Create one conceptual free-response question for this concept.
Concept: ${concept.name}
Description: ${concept.description}

Return JSON with:
- question
- hint`;

const gradeAnswerPrompt = (concept, question, answer) => `Evaluate a student's free-text answer with a strict conceptual rubric.
Concept: ${concept.name}
Description: ${concept.description}
Question: ${question}
Student answer: ${answer}

Return JSON with:
- score (0 to 1)
- feedback
- hint
- followUpQuestion`;

export const startActiveRecallSession = async ({ userId, documentId }) => {
    const weakConcepts = await masteryRepository.listWeakConcepts(userId, documentId, 0.7);
    const concept = weakConcepts[0]?.concept || (await conceptRepository.listByDocument(documentId))[0];

    if (!concept) {
        throw new AppError('No concept available for active recall', 400, 'NO_CONCEPTS_AVAILABLE');
    }

    const generated = await generateJson(createQuestionPrompt(concept));
    const session = await sessionRepository.create({
        user: userId,
        document: documentId,
        concept: concept._id,
        mode: 'active-recall',
        exchanges: [{
            question: generated.question,
            hint: generated.hint
        }]
    });

    return sessionRepository.findOwnedSession(session._id, userId);
};

export const answerActiveRecall = async ({ sessionId, userId, answer }) => {
    const session = await sessionRepository.findOwnedSession(sessionId, userId);
    if (!session || session.mode !== 'active-recall') {
        throw new AppError('Active recall session not found', 404, 'SESSION_NOT_FOUND');
    }

    const exchange = session.exchanges[session.exchanges.length - 1];
    const evaluation = await generateJson(gradeAnswerPrompt(session.concept, exchange.question, answer));

    exchange.answer = answer;
    exchange.score = Number(evaluation.score || 0);
    exchange.feedback = evaluation.feedback;
    exchange.hint = evaluation.hint;
    exchange.followUpQuestion = evaluation.followUpQuestion;

    session.masteryDelta += exchange.score - 0.5;
    if (session.exchanges.length >= 3) {
        session.status = 'completed';
        session.completedAt = new Date();
    } else {
        session.exchanges.push({
            question: evaluation.followUpQuestion,
            hint: evaluation.hint
        });
    }

    await session.save();

    await updateConceptMastery({
        userId,
        documentId: session.document,
        conceptIds: [session.concept._id],
        sourceType: 'recall',
        score: exchange.score,
        sourceId: session._id
    });

    await recordLearningInteraction({
        userId,
        documentId: session.document,
        conceptIds: [session.concept._id],
        timeSpentSeconds: 180,
        tutorSessions: 1,
        completionDelta: exchange.score * 0.03
    });

    await trackActivity({
        userId,
        documentId: session.document,
        type: 'recall-session',
        title: 'Active recall session updated',
        description: `You scored ${Math.round(exchange.score * 100)}% on an active recall response.`,
        metadata: {
            sessionId: session._id,
            conceptId: session.concept._id,
            score: exchange.score
        }
    });

    return session;
};
