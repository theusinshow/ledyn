import type {
  ContentRecord,
  QuestionItem,
  QuestionSetRecord,
} from '@/domain/contracts';
import { AppError } from '@/shared/errors';

export interface QuizEvaluationItemResult {
  questionId: string;
  selectedOptionId: string;
  correctOptionId: string;
  isCorrect: boolean;
  explanation: string;
  sourceQuote: string;
  sourceStartOffset: number;
  sourceEndOffset: number;
}

export interface QuizEvaluationSummary {
  correctCount: number;
  totalCount: number;
  scorePercent: number;
  items: QuizEvaluationItemResult[];
}

/**
 * Verifica tecnicamente que um QuestionSet possui 4 questões válidas, 4 alternativas por questão,
 * exatamente uma alternativa correta existente e trecho-fonte literal sustentado pelo texto normalizado (AC-19).
 */
export function verifyQuestionSetIntegrity(
  questionSet: QuestionSetRecord,
  content: ContentRecord,
): void {
  if (questionSet.contentVersionId !== content.id) {
    throw new AppError(
      'CORRUPT_FILE',
      `QuestionSet ${questionSet.id} aponta para contentVersionId divergente (${questionSet.contentVersionId} !== ${content.id}).`,
    );
  }

  if (questionSet.questions.length !== 4) {
    throw new AppError(
      'CORRUPT_FILE',
      `Cada treino deve conter exatamente 4 questões (encontradas: ${questionSet.questions.length}).`,
    );
  }

  const seenQuestionIds = new Set<string>();
  for (const q of questionSet.questions) {
    if (!q.id || seenQuestionIds.has(q.id)) {
      throw new AppError(
        'CORRUPT_FILE',
        `ID de questão inválido ou duplicado no QuestionSet ${questionSet.id}.`,
      );
    }
    seenQuestionIds.add(q.id);

    if (!q.prompt.trim() || !q.explanation.trim() || !q.sourceQuote.trim()) {
      throw new AppError(
        'CORRUPT_FILE',
        `Questão ${q.id} possui enunciado, justificativa ou trecho-fonte vazio.`,
      );
    }

    if (q.options.length !== 4) {
      throw new AppError(
        'CORRUPT_FILE',
        `Questão ${q.id} deve ter exatamente 4 alternativas.`,
      );
    }

    const optionIds = new Set<string>();
    for (const opt of q.options) {
      if (!opt.id || !opt.text.trim() || optionIds.has(opt.id)) {
        throw new AppError(
          'CORRUPT_FILE',
          `Alternativa inválida ou duplicada na questão ${q.id}.`,
        );
      }
      optionIds.add(opt.id);
    }

    if (!optionIds.has(q.correctOptionId)) {
      throw new AppError(
        'CORRUPT_FILE',
        `Questão ${q.id} referencia correctOptionId inexistente (${q.correctOptionId}).`,
      );
    }

    if (
      q.sourceStartOffset < 0 ||
      q.sourceEndOffset <= q.sourceStartOffset ||
      q.sourceEndOffset > content.normalizedText.length
    ) {
      throw new AppError(
        'CORRUPT_FILE',
        `Offsets de evidência inválidos na questão ${q.id}.`,
      );
    }

    const slicedQuote = content.normalizedText.slice(
      q.sourceStartOffset,
      q.sourceEndOffset,
    );
    if (slicedQuote !== q.sourceQuote) {
      throw new AppError(
        'CORRUPT_FILE',
        `O trecho-fonte da questão ${q.id} não coincide com os offsets UTF-16 no texto normalizado.`,
      );
    }
  }
}

/**
 * Retorna a lista de números de questões (1-based) e IDs ainda não respondidos.
 */
export function findMissingQuestionAnswers(
  questions: QuestionItem[],
  answers: Record<string, string>,
): Array<{ index: number; questionId: string }> {
  const missing: Array<{ index: number; questionId: string }> = [];
  questions.forEach((q, idx) => {
    const selected = answers[q.id];
    const isValidOption =
      typeof selected === 'string' &&
      q.options.some((opt) => opt.id === selected);
    if (!isValidOption) {
      missing.push({ index: idx + 1, questionId: q.id });
    }
  });
  return missing;
}

/**
 * Avalia um conjunto completo de respostas contra o QuestionSet (RF-06 / AC-20).
 * Exige que todas as questões estejam respondidas.
 */
export function evaluateQuizAttempt(
  questionSet: QuestionSetRecord,
  answers: Record<string, string>,
): QuizEvaluationSummary {
  const missing = findMissingQuestionAnswers(questionSet.questions, answers);
  if (missing.length > 0) {
    throw new AppError(
      'QUIZ_INCOMPLETE',
      `Responda todas as questões antes de enviar (faltam: ${missing.map((m) => `Questão ${m.index}`).join(', ')}).`,
    );
  }

  let correctCount = 0;
  const items: QuizEvaluationItemResult[] = questionSet.questions.map((q) => {
    const selectedOptionId = answers[q.id]!;
    const isCorrect = selectedOptionId === q.correctOptionId;
    if (isCorrect) {
      correctCount += 1;
    }
    return {
      questionId: q.id,
      selectedOptionId,
      correctOptionId: q.correctOptionId,
      isCorrect,
      explanation: q.explanation,
      sourceQuote: q.sourceQuote,
      sourceStartOffset: q.sourceStartOffset,
      sourceEndOffset: q.sourceEndOffset,
    };
  });

  const totalCount = questionSet.questions.length;
  const scorePercent =
    totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  return {
    correctCount,
    totalCount,
    scorePercent,
    items,
  };
}

export function formatQuizScorePercent(
  correctCount: number | null,
  totalCount: number,
): string {
  if (correctCount === null || totalCount <= 0) {
    return '—';
  }
  const pct = Math.round((correctCount / totalCount) * 100);
  return `${correctCount}/${totalCount} · ${pct}%`;
}
