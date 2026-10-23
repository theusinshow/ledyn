import { beforeEach, describe, expect, it } from 'vitest';
import { BUILT_IN_TRAINING_BLUEPRINTS } from '@/content/training/catalog';
import {
  evaluateQuizAttempt,
  findMissingQuestionAnswers,
  formatQuizScorePercent,
  verifyQuestionSetIntegrity,
} from '@/domain/comprehension/quiz';
import { db } from '@/infrastructure/db/database';
import {
  abandonQuizAttempt,
  commitPreparedDocument,
  deleteDocumentTransactional,
  ensureTrainingCatalogSeeded,
  listSessionsHistory,
  listTrainingCatalogOverview,
  loadQuizAttemptBundle,
  loadReaderDocumentBundle,
  preparePastedTextDraft,
  prepareTrainingForReading,
  saveQuizDraftAnswer,
  saveReadingCheckpoint,
  saveSessionReflection,
  startOrResumeQuizAttempt,
  submitQuizAttempt,
} from '@/infrastructure/db/repositories';
import { FX_01_TEXT } from '../fixtures/corpus';

describe('F4 Integration — Catálogo de Treino, Quiz, Reflexão e Histórico (AC-19 a AC-23)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('AC-19 / FX-10: semeia 3 treinos originais em PT-BR (300-600 palavras), 4 questões/4 opções, evidência literal UTF-16 e reviewStatus pendente de revisão humana', async () => {
    expect(BUILT_IN_TRAINING_BLUEPRINTS).toHaveLength(3);

    await ensureTrainingCatalogSeeded();
    // Idempotência da semeadura
    await ensureTrainingCatalogSeeded();

    const overview = await listTrainingCatalogOverview();
    expect(overview).toHaveLength(3);

    for (const item of overview) {
      const { document, content, questionSet } = item.bundle;
      expect(document.isTraining).toBe(true);
      expect(content.tokenCount).toBeGreaterThanOrEqual(300);
      expect(content.tokenCount).toBeLessThanOrEqual(600);
      expect(questionSet.questions).toHaveLength(4);
      expect(questionSet.reviewStatus).toBe(
        'technical_verified_pending_human',
      );

      // Verificação técnica estrita de offsets UTF-16 e integridade
      expect(() =>
        verifyQuestionSetIntegrity(questionSet, content),
      ).not.toThrow();

      for (const q of questionSet.questions) {
        expect(q.options).toHaveLength(4);
        const sliced = content.normalizedText.slice(
          q.sourceStartOffset,
          q.sourceEndOffset,
        );
        expect(sliced).toBe(q.sourceQuote);
      }
    }

    // Mutação de offset deve ser rejeitada por verifyQuestionSetIntegrity
    const first = overview[0]!.bundle;
    const brokenSet = {
      ...first.questionSet,
      questions: first.questionSet.questions.map((q, idx) =>
        idx === 0 ? { ...q, sourceStartOffset: q.sourceStartOffset + 1 } : q,
      ),
    };
    expect(() =>
      verifyQuestionSetIntegrity(brokenSet, first.content),
    ).toThrowError(/não coincide com os offsets UTF-16/i);
  });

  it('AC-20: calcula pontuação determinística (4/4 = 100%, 3/4 = 75%) e bloqueia envio incompleto identificando questões faltantes', async () => {
    await ensureTrainingCatalogSeeded();
    const overview = await listTrainingCatalogOverview();
    const { questionSet } = overview[0]!.bundle;
    const [q1, q2, q3, q4] = questionSet.questions;

    // Respostas incompletas (faltando questões 2 e 4)
    const partialAnswers: Record<string, string> = {
      [q1!.id]: q1!.correctOptionId,
      [q3!.id]: q3!.correctOptionId,
    };

    const missing = findMissingQuestionAnswers(
      questionSet.questions,
      partialAnswers,
    );
    expect(missing).toEqual([
      { index: 2, questionId: q2!.id },
      { index: 4, questionId: q4!.id },
    ]);

    expect(() =>
      evaluateQuizAttempt(questionSet, partialAnswers),
    ).toThrowError(/Questão 2, Questão 4/);

    // 4/4 corretas -> 100%
    const allCorrectAnswers: Record<string, string> = {
      [q1!.id]: q1!.correctOptionId,
      [q2!.id]: q2!.correctOptionId,
      [q3!.id]: q3!.correctOptionId,
      [q4!.id]: q4!.correctOptionId,
    };
    const eval100 = evaluateQuizAttempt(questionSet, allCorrectAnswers);
    expect(eval100.correctCount).toBe(4);
    expect(eval100.totalCount).toBe(4);
    expect(eval100.scorePercent).toBe(100);
    expect(formatQuizScorePercent(eval100.correctCount, eval100.totalCount)).toBe(
      '4/4 · 100%',
    );

    // 3/4 corretas -> 75%
    const wrongOptionQ4 = q4!.options.find(
      (opt) => opt.id !== q4!.correctOptionId,
    )!;
    const threeCorrectAnswers: Record<string, string> = {
      ...allCorrectAnswers,
      [q4!.id]: wrongOptionQ4.id,
    };
    const eval75 = evaluateQuizAttempt(questionSet, threeCorrectAnswers);
    expect(eval75.correctCount).toBe(3);
    expect(eval75.totalCount).toBe(4);
    expect(eval75.scorePercent).toBe(75);
    expect(formatQuizScorePercent(eval75.correctCount, eval75.totalCount)).toBe(
      '3/4 · 75%',
    );
  });

  it('AC-21: persiste rascunho de respostas sem revelar gabarito, garante submissão idempotente, marca repeated em nova sessão e suporta abandono sem 0%', async () => {
    const trainingDocId = BUILT_IN_TRAINING_BLUEPRINTS[0]!.documentId;
    await prepareTrainingForReading(trainingDocId);
    const training = await loadReaderDocumentBundle(trainingDocId, 'tab-quiz-1');
    expect(training.questionSet).not.toBeNull();

    const session1Id = 'session-quiz-1';
    await saveReadingCheckpoint({
      sessionId: session1Id,
      documentId: training.document.id,
      contentVersionId: training.content.id,
      ownerId: 'tab-quiz-1',
      startedAt: new Date().toISOString(),
      snapshot: {
        status: 'completed',
        mode: 'rsvp',
        cursor: {
          contentVersionId: training.content.id,
          tokenIndex: training.content.tokenCount,
        },
        currentToken: null,
        tokenCount: training.content.tokenCount,
        wpm: 250,
        punctuationPauseEnabled: true,
        activeMs: 11500,
        presentedCount: training.content.tokenCount,
        coverageRanges: [[0, training.content.tokenCount - 1]],
        modeSegments: [
          {
            mode: 'rsvp',
            startedAtActiveMs: 0,
            endedAtActiveMs: 11500,
          },
        ],
        settingsChanges: [],
        lastPauseReason: null,
        resumeRewindTokens: 0,
      },
      sessionStatusOverride: 'completed',
    });

    const attempt1 = await startOrResumeQuizAttempt(
      session1Id,
      training.document.id,
    );
    expect(attempt1.status).toBe('draft');
    expect(attempt1.repeated).toBe(false);
    expect(attempt1.correctCount).toBeNull();

    // Retomar tentativa na mesma sessão retorna o mesmo registro
    const resumedAttempt1 = await startOrResumeQuizAttempt(
      session1Id,
      training.document.id,
    );
    expect(resumedAttempt1.id).toBe(attempt1.id);

    const [q1, q2, q3, q4] = training.questionSet!.questions;

    // Salva rascunho parcial (simulando antes de reload)
    await saveQuizDraftAnswer(attempt1.id, q1!.id, q1!.correctOptionId);
    await saveQuizDraftAnswer(attempt1.id, q2!.id, q2!.correctOptionId);

    const reloadedDraft = await loadQuizAttemptBundle(attempt1.id);
    expect(reloadedDraft.attempt.status).toBe('draft');
    expect(reloadedDraft.attempt.correctCount).toBeNull();
    expect(reloadedDraft.attempt.answers).toEqual({
      [q1!.id]: q1!.correctOptionId,
      [q2!.id]: q2!.correctOptionId,
    });

    // Tentar submeter incompleto lança QUIZ_INCOMPLETE
    await expect(submitQuizAttempt(attempt1.id)).rejects.toThrowError(
      /Questão 3, Questão 4/,
    );

    // Completa as respostas restantes (3 corretas de 4 -> 75%)
    const wrongOpt4 = q4!.options.find((o) => o.id !== q4!.correctOptionId)!;
    await saveQuizDraftAnswer(attempt1.id, q3!.id, q3!.correctOptionId);
    await saveQuizDraftAnswer(attempt1.id, q4!.id, wrongOpt4.id);

    const submitted = await submitQuizAttempt(attempt1.id);
    expect(submitted.status).toBe('submitted');
    expect(submitted.correctCount).toBe(3);
    expect(submitted.totalCount).toBe(4);
    expect(formatQuizScorePercent(submitted.correctCount, submitted.totalCount)).toBe(
      '3/4 · 75%',
    );

    // Submissão repetida (duplo clique / retry) é idempotente
    const submittedRetry = await submitQuizAttempt(attempt1.id);
    expect(submittedRetry.id).toBe(attempt1.id);
    expect(submittedRetry.correctCount).toBe(3);
    expect(submittedRetry.submittedAt).toBe(submitted.submittedAt);

    // Sessão 2 no mesmo treino -> tentativa marcada como repeated: true e depois abandonada sem virar 0%
    const session2Id = 'session-quiz-2';
    await saveReadingCheckpoint({
      sessionId: session2Id,
      documentId: training.document.id,
      contentVersionId: training.content.id,
      ownerId: 'tab-quiz-2',
      startedAt: new Date().toISOString(),
      snapshot: {
        status: 'completed',
        mode: 'guided',
        cursor: {
          contentVersionId: training.content.id,
          tokenIndex: training.content.tokenCount,
        },
        currentToken: null,
        tokenCount: training.content.tokenCount,
        wpm: 250,
        punctuationPauseEnabled: true,
        activeMs: 10000,
        presentedCount: training.content.tokenCount,
        coverageRanges: [[0, training.content.tokenCount - 1]],
        modeSegments: [],
        settingsChanges: [],
        lastPauseReason: null,
        resumeRewindTokens: 0,
      },
      sessionStatusOverride: 'completed',
    });

    const attempt2 = await startOrResumeQuizAttempt(
      session2Id,
      training.document.id,
    );
    expect(attempt2.repeated).toBe(true);
    expect(attempt2.status).toBe('draft');

    const abandoned = await abandonQuizAttempt(attempt2.id);
    expect(abandoned.status).toBe('abandoned');
    expect(abandoned.correctCount).toBeNull();
  });

  it('AC-22 & AC-23: documento importado sem quiz registra reflexão sem nota e histórico filtra e limpa dados transacionalmente ao excluir documento', async () => {
    // 1. Documento pessoal importado (sem quiz)
    const draft = await preparePastedTextDraft(
      FX_01_TEXT,
      'Artigo Pessoal Sem Quiz',
    );
    const personalDoc = await commitPreparedDocument(draft);
    const personalBundle = await loadReaderDocumentBundle(
      personalDoc.id,
      'tab-personal',
    );
    expect(personalBundle.questionSet).toBeNull();

    const personalSessionId = 'session-personal-1';
    await saveReadingCheckpoint({
      sessionId: personalSessionId,
      documentId: personalDoc.id,
      contentVersionId: personalBundle.content.id,
      ownerId: 'tab-personal',
      startedAt: new Date(Date.now() - 20000).toISOString(),
      snapshot: {
        status: 'completed',
        mode: 'rsvp',
        cursor: {
          contentVersionId: personalBundle.content.id,
          tokenIndex: personalBundle.content.tokenCount,
        },
        currentToken: null,
        tokenCount: personalBundle.content.tokenCount,
        wpm: 300,
        punctuationPauseEnabled: true,
        activeMs: 5000,
        presentedCount: personalBundle.content.tokenCount,
        coverageRanges: [[0, personalBundle.content.tokenCount - 1]],
        modeSegments: [],
        settingsChanges: [],
        lastPauseReason: null,
        resumeRewindTokens: 0,
      },
      sessionStatusOverride: 'completed',
    });

    const reflection = await saveSessionReflection(
      personalSessionId,
      'O texto destaca como a leitura dinâmica depende de ritmo e pausas conscientes.',
    );
    expect(reflection.text).toContain('pausas conscientes');

    // 2. Sessão de treino com quiz respondido
    const trainingDocId2 = BUILT_IN_TRAINING_BLUEPRINTS[1]!.documentId;
    await prepareTrainingForReading(trainingDocId2);
    const training = await loadReaderDocumentBundle(
      trainingDocId2,
      'tab-training',
    );
    const trainingSessionId = 'session-training-2';

    await saveReadingCheckpoint({
      sessionId: trainingSessionId,
      documentId: training.document.id,
      contentVersionId: training.content.id,
      ownerId: 'tab-training',
      startedAt: new Date().toISOString(),
      snapshot: {
        status: 'completed',
        mode: 'guided',
        cursor: {
          contentVersionId: training.content.id,
          tokenIndex: training.content.tokenCount,
        },
        currentToken: null,
        tokenCount: training.content.tokenCount,
        wpm: 260,
        punctuationPauseEnabled: true,
        activeMs: 9500,
        presentedCount: training.content.tokenCount,
        coverageRanges: [[0, training.content.tokenCount - 1]],
        modeSegments: [],
        settingsChanges: [],
        lastPauseReason: null,
        resumeRewindTokens: 0,
      },
      sessionStatusOverride: 'completed',
    });

    const attempt = await startOrResumeQuizAttempt(
      trainingSessionId,
      training.document.id,
    );
    for (const q of training.questionSet!.questions) {
      await saveQuizDraftAnswer(attempt.id, q.id, q.correctOptionId);
    }
    await submitQuizAttempt(attempt.id);

    // 3. Verifica histórico e classificações
    const history = await listSessionsHistory();
    expect(history).toHaveLength(2);

    const personalEntry = history.find(
      (h) => h.session.id === personalSessionId,
    )!;
    expect(personalEntry.hasQuestionSet).toBe(false);
    expect(personalEntry.quizAttempt).toBeNull();
    expect(personalEntry.reflection?.text).toContain('pausas conscientes');

    const trainingEntry = history.find(
      (h) => h.session.id === trainingSessionId,
    )!;
    expect(trainingEntry.hasQuestionSet).toBe(true);
    expect(trainingEntry.quizAttempt?.correctCount).toBe(4);

    // 4. Exclusão transacional remove sessões, reflexões e tentativas do documento excluído
    await deleteDocumentTransactional(personalDoc.id);
    expect(
      await db.sessions.where('documentId').equals(personalDoc.id).count(),
    ).toBe(0);
    expect(await db.reflections.get(reflection.id)).toBeUndefined();

    const remainingHistory = await listSessionsHistory();
    expect(remainingHistory).toHaveLength(1);
    expect(remainingHistory[0]?.session.id).toBe(trainingSessionId);
  });
});
