import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  GraduationCap,
  Info,
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
import { formatQuizScorePercent } from '@/domain/comprehension/quiz';
import {
  listTrainingCatalogOverview,
  prepareTrainingForReading,
  type TrainingCatalogOverviewItem,
} from '@/infrastructure/db/repositories';
import { formatDateTimePtBr } from '@/shared/utils';

export function TrainingPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<TrainingCatalogOverviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInspectionPanel, setShowInspectionPanel] = useState(false);

  useEffect(() => {
    let active = true;
    listTrainingCatalogOverview()
      .then((loaded) => {
        if (active) {
          setItems(loaded);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleStartTraining = async (documentId: string) => {
    await prepareTrainingForReading(documentId);
    await navigate(`/reader/${documentId}`);
  };

  return (
    <div className="space-y-6" data-testid="training-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Treinos de Compreensão
          </h1>
          <p className="text-sm text-muted-foreground">
            Três exercícios originais (300–600 palavras) com 4 questões objetivas cada para observar ritmo e retenção em conjunto.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowInspectionPanel((prev) => !prev)}
          data-testid="toggle-inspect-gabaritos-btn"
        >
          {showInspectionPanel ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Ocultar conferência de gabaritos
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Conferir textos e gabaritos
            </>
          )}
        </Button>
      </div>

      {/* Aviso explícito de distinção entre verificação técnica e revisão humana (AC-19 / UX-FLOWS.md E) */}
      <div
        role="status"
        data-testid="training-review-status-banner"
        className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-xs text-muted-foreground"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="font-semibold text-foreground">
            Material de treino aguardando conferência do usuário
          </p>
          <p>
            Os 3 textos e seus 12 gabaritos passaram por verificação técnica automatizada de integridade e offsets UTF-16, permanecendo abertos para sua revisão pessoal.
          </p>
        </div>
      </div>

      {showInspectionPanel && (
        <Card data-testid="training-gabarito-inspection-panel">
          <CardHeader>
            <CardTitle className="text-base">
              Inspeção Transparente dos Textos e Gabaritos (RF-06 / AC-19)
            </CardTitle>
            <CardDescription>
              Gabaritos locais e inspecionáveis sustentados por trechos literais de cada texto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-xs">
            {items.map(({ bundle }) => (
              <div
                key={bundle.document.id}
                className="space-y-2 rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-sm">{bundle.document.title}</h3>
                  <Badge variant="outline">
                    {bundle.tokens.length} palavras · 4 questões
                  </Badge>
                </div>
                <div className="space-y-2 pt-1">
                  {bundle.questionSet.questions.map((q, qIdx) => {
                    const correctOpt = q.options.find(
                      (o) => o.id === q.correctOptionId,
                    );
                    return (
                      <div
                        key={q.id}
                        className="rounded border border-border/60 bg-muted/20 p-2.5 space-y-1"
                      >
                        <p className="font-semibold">
                          Q{qIdx + 1}: {q.prompt}
                        </p>
                        <p className="text-primary font-medium">
                          Gabarito ({q.correctOptionId.toUpperCase()}):{' '}
                          {correctOpt?.text}
                        </p>
                        <p className="text-muted-foreground">
                          Justificativa: {q.explanation}
                        </p>
                        <p className="italic text-muted-foreground">
                          Trecho-fonte [{q.sourceStartOffset}..
                          {q.sourceEndOffset}]: &ldquo;{q.sourceQuote}&rdquo;
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div
          role="status"
          className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground"
        >
          Preparando catálogo de treinos...
        </div>
      ) : (
        <div className="grid gap-4" data-testid="training-catalog-list">
          {items.map(
            ({
              bundle,
              submittedAttempts,
              activeDraftAttempt,
              hasBeenPracticed,
            }) => {
              const doc = bundle.document;
              const latestAttempt = submittedAttempts[0] ?? null;

              return (
                <Card
                  key={doc.id}
                  data-testid={`training-card-${doc.id}`}
                  className="transition-colors hover:border-primary/40"
                >
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{doc.title}</CardTitle>
                        <CardDescription>
                          {bundle.blueprint.subtitle}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {hasBeenPracticed ? (
                          <Badge
                            variant="secondary"
                            data-testid={`training-practiced-badge-${doc.id}`}
                          >
                            Texto já praticado
                          </Badge>
                        ) : (
                          <Badge variant="outline">Primeiro uso</Badge>
                        )}
                        <Badge variant="outline">
                          {bundle.questionSet.questions.length} questões
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <GraduationCap
                          className="h-3.5 w-3.5 text-primary"
                          aria-hidden="true"
                        />
                        Extensão: {doc.tokenCount} palavras (
                        {bundle.content.blocks.length} parágrafos)
                      </span>
                      <span>
                        Tempo estimado a 250 PPM:{' '}
                        {Math.max(1, Math.ceil(doc.tokenCount / 250))} min
                      </span>
                      {submittedAttempts.length > 0 && (
                        <span>
                          Tentativas enviadas: {submittedAttempts.length}
                        </span>
                      )}
                    </div>

                    {latestAttempt && (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                        data-testid={`training-latest-attempt-${doc.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          <span>
                            Último resultado:{' '}
                            <strong className="text-foreground">
                              {formatQuizScorePercent(
                                latestAttempt.correctCount,
                                latestAttempt.totalCount,
                              )}
                            </strong>{' '}
                            {latestAttempt.submittedAt
                              ? `(${formatDateTimePtBr(latestAttempt.submittedAt)})`
                              : ''}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void navigate(`/quiz/${latestAttempt.id}`)
                          }
                          data-testid={`view-attempt-result-${doc.id}`}
                          className="h-7 text-xs"
                        >
                          Ver gabarito
                        </Button>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex flex-wrap justify-end gap-2 pt-2">
                    {activeDraftAttempt && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          void navigate(`/quiz/${activeDraftAttempt.id}`)
                        }
                        data-testid={`resume-draft-quiz-btn-${doc.id}`}
                      >
                        <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                        Continuar questionário em rascunho
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => void handleStartTraining(doc.id)}
                      data-testid={`start-training-btn-${doc.id}`}
                    >
                      <BookOpen className="h-4 w-4" aria-hidden="true" />
                      {hasBeenPracticed ? 'Praticar novamente' : 'Praticar treino'}
                    </Button>
                  </CardFooter>
                </Card>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
