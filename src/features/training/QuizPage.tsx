import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  History,
  Info,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  findMissingQuestionAnswers,
  formatQuizScorePercent,
} from '@/domain/comprehension/quiz';
import {
  abandonQuizAttempt,
  loadQuizAttemptBundle,
  saveQuizDraftAnswer,
  submitQuizAttempt,
  type QuizAttemptBundle,
} from '@/infrastructure/db/repositories';
import { toAppError } from '@/shared/errors';
import { cn } from '@/shared/utils';

export function QuizPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [bundle, setBundle] = useState<QuizAttemptBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [incompleteMessage, setIncompleteMessage] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  const questionCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!attemptId) {
      return;
    }

    let cancelled = false;
    loadQuizAttemptBundle(attemptId)
      .then((loaded) => {
        if (!cancelled) {
          setBundle(loaded);
          setLoadError(null);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const appErr = toAppError(err);
          setLoadError(appErr.userMessage);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const handleSelectOption = async (questionId: string, optionId: string) => {
    if (!bundle || bundle.attempt.status !== 'draft' || isSubmitting) {
      return;
    }

    setIncompleteMessage(null);
    setActionError(null);

    try {
      const updatedAttempt = await saveQuizDraftAnswer(
        bundle.attempt.id,
        questionId,
        optionId,
      );
      setBundle((prev) =>
        prev ? { ...prev, attempt: updatedAttempt } : prev,
      );
    } catch (err) {
      const appErr = toAppError(err);
      setActionError(appErr.userMessage);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!bundle || isSubmitting) {
      return;
    }

    if (bundle.attempt.status === 'submitted') {
      return;
    }

    const missing = findMissingQuestionAnswers(
      bundle.questionSet.questions,
      bundle.attempt.answers,
    );

    if (missing.length > 0) {
      const missingLabels = missing.map((m) => `Questão ${m.index}`).join(', ');
      setIncompleteMessage(
        `Responda todas as questões antes de enviar (faltam: ${missingLabels}).`,
      );
      const firstMissingId = missing[0]!.questionId;
      const targetEl = questionCardRefs.current[firstMissingId];
      if (targetEl) {
        targetEl.focus();
      }
      return;
    }

    setIsSubmitting(true);
    setIncompleteMessage(null);
    setActionError(null);

    try {
      const submittedAttempt = await submitQuizAttempt(bundle.attempt.id);
      setBundle((prev) =>
        prev ? { ...prev, attempt: submittedAttempt } : prev,
      );
    } catch (err) {
      const appErr = toAppError(err);
      setActionError(appErr.userMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmAbandon = async () => {
    if (!bundle || isSubmitting) return;
    try {
      await abandonQuizAttempt(bundle.attempt.id);
      await navigate('/training');
    } catch (err) {
      const appErr = toAppError(err);
      setActionError(appErr.userMessage);
    }
  };

  if (!attemptId) {
    return (
      <Card data-testid="quiz-error-state">
        <CardHeader>
          <CardTitle>Não foi possível abrir o questionário</CardTitle>
          <CardDescription>
            Identificador da tentativa não informado.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => void navigate('/training')}>
            <ArrowLeft className="h-4 w-4" />
            Voltar aos treinos
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div
        role="status"
        className="rounded-xl border border-border p-12 text-center text-sm text-muted-foreground"
      >
        Carregando questionário de compreensão...
      </div>
    );
  }

  if (loadError || !bundle) {
    return (
      <Card data-testid="quiz-error-state">
        <CardHeader>
          <CardTitle>Não foi possível abrir o questionário</CardTitle>
          <CardDescription>
            {loadError ?? 'Tentativa não encontrada.'}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => void navigate('/training')}>
            <ArrowLeft className="h-4 w-4" />
            Voltar aos treinos
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const { attempt, questionSet, document: doc } = bundle;
  const isSubmitted = attempt.status === 'submitted';
  const isAbandoned = attempt.status === 'abandoned';
  const answeredCount = questionSet.questions.filter(
    (q) =>
      typeof attempt.answers[q.id] === 'string' &&
      q.options.some((opt) => opt.id === attempt.answers[q.id]),
  ).length;

  return (
    <div className="space-y-6" data-testid="quiz-page">
      {/* Cabeçalho e Avisos de Contexto */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {doc.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSubmitted
              ? 'Resultado do questionário objetivo com justificativas e trechos-fonte.'
              : 'Responda às 4 questões objetivas. Suas escolhas ficam salvas como rascunho local.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {questionSet.reviewStatus === 'technical_verified_pending_human' && (
            <Badge
              variant="outline"
              data-testid="quiz-review-status-badge"
              className="text-xs"
            >
              Material de treino aguardando conferência do usuário
            </Badge>
          )}
          {!isSubmitted && !isAbandoned && (
            <Badge variant="secondary" data-testid="quiz-answered-progress">
              {answeredCount} de {questionSet.questions.length} respondidas
            </Badge>
          )}
        </div>
      </div>

      {attempt.repeated && (
        <div
          role="status"
          data-testid="quiz-repeated-notice"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            <strong>Texto já praticado:</strong> você já leu este texto anteriormente; a familiaridade pode influenciar o resultado.
          </span>
        </div>
      )}

      {incompleteMessage && (
        <div
          role="alert"
          data-testid="quiz-incomplete-alert"
          className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{incompleteMessage}</span>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Resumo de Pontuação quando Enviado (AC-20) */}
      {isSubmitted && (
        <Card
          data-testid="quiz-result-view"
          className="border-primary/40 bg-primary/5"
        >
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-primary" />
                <CardTitle>Questionário concluído</CardTitle>
              </div>
              <Badge
                variant="default"
                className="text-base px-3 py-1"
                data-testid="quiz-result-score"
              >
                {formatQuizScorePercent(
                  attempt.correctCount,
                  attempt.totalCount,
                )}
              </Badge>
            </div>
            <CardDescription>
              Confira abaixo o gabarito comentado e o trecho literal do texto que sustenta cada resposta. O resultado enviado é definitivo.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-wrap gap-2">
            <Button
              onClick={() => void navigate('/history')}
              data-testid="quiz-to-history-btn"
            >
              <History className="h-4 w-4" />
              Consultar histórico
            </Button>
            <Button
              variant="outline"
              onClick={() => void navigate('/training')}
              data-testid="quiz-to-training-btn"
            >
              Voltar aos treinos
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Lista das 4 Questões */}
      <div className="space-y-4">
        {questionSet.questions.map((question, idx) => {
          const selectedOptionId = attempt.answers[question.id] ?? null;
          const isCorrect =
            isSubmitted && selectedOptionId === question.correctOptionId;

          return (
            <div
              key={question.id}
              ref={(el) => {
                questionCardRefs.current[question.id] = el;
              }}
              tabIndex={-1}
              data-testid={`quiz-question-card-${idx + 1}`}
              className="rounded-xl border border-border bg-card p-5 space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-base">
                  {idx + 1}. {question.prompt}
                </h2>
                {isSubmitted && (
                  <Badge
                    variant={isCorrect ? 'default' : 'destructive'}
                    data-testid={`quiz-question-status-${idx + 1}`}
                  >
                    {isCorrect ? 'Correta' : 'Incorreta'}
                  </Badge>
                )}
              </div>

              <div
                role="radiogroup"
                aria-label={`Alternativas da questão ${idx + 1}`}
                className="grid gap-2"
              >
                {question.options.map((opt) => {
                  const isSelected = selectedOptionId === opt.id;
                  const isRightOption = opt.id === question.correctOptionId;

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={isSubmitted || isAbandoned}
                      data-testid={`quiz-option-${question.id}-${opt.id}`}
                      onClick={() =>
                        void handleSelectOption(question.id, opt.id)
                      }
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        !isSubmitted &&
                          (isSelected
                            ? 'border-primary bg-primary/10 font-medium cursor-pointer'
                            : 'border-border hover:bg-accent/60 cursor-pointer'),
                        isSubmitted &&
                          isRightOption &&
                          'border-primary bg-primary/15 font-semibold',
                        isSubmitted &&
                          isSelected &&
                          !isRightOption &&
                          'border-destructive bg-destructive/10',
                      )}
                    >
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-mono uppercase">
                        {opt.id}
                      </span>
                      <span className="flex-1 pt-0.5">{opt.text}</span>
                      {isSubmitted && isRightOption && (
                        <CheckCircle2
                          className="h-5 w-5 shrink-0 text-primary"
                          aria-label="Alternativa correta"
                        />
                      )}
                      {isSubmitted && isSelected && !isRightOption && (
                        <XCircle
                          className="h-5 w-5 shrink-0 text-destructive"
                          aria-label="Sua escolha (incorreta)"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Explicação e Trecho-Fonte exibidos somente após o envio (AC-20) */}
              {isSubmitted && (
                <div
                  className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-2"
                  data-testid={`quiz-explanation-box-${idx + 1}`}
                >
                  <p data-testid={`quiz-explanation-${question.id}`}>
                    <strong>Justificativa:</strong> {question.explanation}
                  </p>
                  <blockquote
                    className="border-l-2 border-primary pl-3 italic text-muted-foreground"
                    data-testid={`quiz-source-quote-${question.id}`}
                  >
                    &ldquo;{question.sourceQuote}&rdquo;
                  </blockquote>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Controles de Envio ou Abandono do Rascunho */}
      {!isSubmitted && !isAbandoned && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void navigate('/training')}
                  data-testid="quiz-keep-draft-btn"
                >
                  Continuar depois (manter rascunho)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAbandonConfirm(true)}
                  data-testid="quiz-abandon-btn"
                  className="text-destructive hover:text-destructive"
                >
                  Descartar tentativa
                </Button>
              </div>

              <Button
                type="button"
                size="lg"
                disabled={isSubmitting}
                onClick={() => void handleSubmitQuiz()}
                data-testid="submit-quiz-btn"
              >
                {isSubmitting ? 'Enviando...' : 'Enviar respostas'}
              </Button>
            </div>

            {showAbandonConfirm && (
              <div
                role="alertdialog"
                aria-label="Confirmar descarte da tentativa"
                className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  Deseja descartar este rascunho de questionário? O abandono não gera nota zero no histórico.
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAbandonConfirm(false)}
                  >
                    Manter rascunho
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleConfirmAbandon()}
                    data-testid="confirm-abandon-quiz-btn"
                  >
                    Confirmar descarte
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
