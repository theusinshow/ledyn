import { useEffect, useMemo, useState } from 'react';
import { ProgressDashboard } from '@/features/history/ProgressDashboard';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, FileCheck2, History, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatQuizScorePercent } from '@/domain/comprehension/quiz';
import type { ReadingMode, SessionRecord } from '@/domain/contracts';
import {
  countUniqueCoveredTokens,
  formatObservedWpm,
} from '@/domain/reading/metrics';
import {
  listSessionsHistory,
  type SessionHistoryItem,
} from '@/infrastructure/db/repositories';
import { formatDateTimePtBr, formatDurationPtBr } from '@/shared/utils';

type QuizFilterMode = 'all' | 'with_quiz' | 'without_quiz';

function formatModesSummary(session: SessionRecord): string {
  const modes = new Set<ReadingMode>(
    session.modeSegments.map((seg) => seg.mode),
  );
  if (session.currentMode) {
    modes.add(session.currentMode);
  }
  if (modes.has('rsvp') && modes.has('guided')) {
    return 'RSVP + Guiada';
  }
  if (modes.has('guided')) {
    return 'Guiada';
  }
  return 'RSVP';
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<SessionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('all');
  const [quizFilter, setQuizFilter] = useState<QuizFilterMode>('all');
  const [expandedSessionIds, setExpandedSessionIds] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    listSessionsHistory()
      .then((rows) => {
        setEntries(rows);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const documentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of entries) {
      if (!map.has(item.session.documentId)) {
        map.set(item.session.documentId, item.documentTitle);
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      if (
        selectedDocumentId !== 'all' &&
        item.session.documentId !== selectedDocumentId
      ) {
        return false;
      }
      if (quizFilter === 'with_quiz') {
        return item.quizAttempt?.status === 'submitted';
      }
      if (quizFilter === 'without_quiz') {
        return !item.hasQuestionSet || item.quizAttempt?.status !== 'submitted';
      }
      return true;
    });
  }, [entries, selectedDocumentId, quizFilter]);

  const toggleExpanded = (sessionId: string) => {
    setExpandedSessionIds((prev) => ({
      ...prev,
      [sessionId]: !prev[sessionId],
    }));
  };

  return (
    <div className="space-y-6" data-testid="history-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Histórico Pessoal</h1>
        <p className="text-sm text-muted-foreground">
          Sessões e tentativas registradas localmente neste dispositivo. Textos, velocidades e repetições diferentes não formam experimento equivalente; velocidade observada e compreensão são apresentadas separadamente.
        </p>
      </div>

      {!isLoading && <ProgressDashboard entries={entries} />}

      {/* Filtros por documento e presença de quiz (UX-FLOWS.md Fluxo G / AC-23) */}
      {entries.length > 0 && (
        <div
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-xs sm:flex-row sm:flex-wrap sm:items-center"
          data-testid="history-filters-bar"
        >
          <div className="flex min-w-0 items-center gap-2">
            <label
              htmlFor="history-filter-document"
              className="w-24 shrink-0 font-medium text-muted-foreground sm:w-auto"
            >
              Documento:
            </label>
            <select
              id="history-filter-document"
              data-testid="history-filter-document"
              value={selectedDocumentId}
              onChange={(e) => setSelectedDocumentId(e.target.value)}
              className="h-9 min-w-0 flex-1 truncate rounded-md border border-input bg-background px-2.5 text-xs sm:max-w-xs sm:flex-none"
            >
              <option value="all">Todos os documentos</option>
              {documentOptions.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <label
              htmlFor="history-filter-quiz"
              className="w-24 shrink-0 font-medium text-muted-foreground sm:w-auto"
            >
              Questionário:
            </label>
            <select
              id="history-filter-quiz"
              data-testid="history-filter-quiz"
              value={quizFilter}
              onChange={(e) => setQuizFilter(e.target.value as QuizFilterMode)}
              className="h-9 min-w-0 flex-1 truncate rounded-md border border-input bg-background px-2.5 text-xs sm:max-w-xs sm:flex-none"
            >
              <option value="all">Todas as sessões</option>
              <option value="with_quiz">Com questionário enviado</option>
              <option value="without_quiz">Sem questionário enviado</option>
            </select>
          </div>
        </div>
      )}

      {isLoading ? (
        <div
          role="status"
          className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground"
        >
          Carregando histórico...
        </div>
      ) : entries.length === 0 ? (
        <Card data-testid="history-empty-state">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <div className="rounded-full bg-muted p-3">
              <History className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold">
              Suas sessões aparecerão aqui depois que você iniciar uma leitura.
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              Nenhum dado simulado é exibido. Inicie uma leitura na Biblioteca ou em Treinos para registrar tempo ativo, apresentações e compreensão.
            </p>
          </CardContent>
        </Card>
      ) : filteredEntries.length === 0 ? (
        <Card data-testid="history-filtered-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma sessão corresponde aos filtros selecionados.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3" data-testid="history-sessions-list">
          {filteredEntries.map(
            ({
              session,
              documentTitle,
              hasQuestionSet,
              quizAttempt,
              reflection,
            }) => {
              const uniqueTokens = countUniqueCoveredTokens(
                session.coverageRanges,
              );
              const isExpanded = Boolean(expandedSessionIds[session.id]);
              const modeLabel = formatModesSummary(session);

              let comprehensionStatusLabel = 'Sem questionário';
              if (quizAttempt?.status === 'submitted') {
                comprehensionStatusLabel = formatQuizScorePercent(
                  quizAttempt.correctCount,
                  quizAttempt.totalCount,
                );
              } else if (quizAttempt?.status === 'draft') {
                const answeredCount = Object.keys(quizAttempt.answers).length;
                comprehensionStatusLabel = `Rascunho (${answeredCount}/${quizAttempt.totalCount})`;
              } else if (quizAttempt?.status === 'abandoned') {
                comprehensionStatusLabel = 'Tentativa descartada';
              } else if (hasQuestionSet) {
                comprehensionStatusLabel = 'Questionário não enviado';
              }

              return (
                <Card
                  key={session.id}
                  data-testid={`history-session-${session.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="min-w-0 break-words text-base">
                        {documentTitle}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          data-testid={`history-session-modes-${session.id}`}
                        >
                          Modo: {modeLabel}
                        </Badge>
                        <Badge
                          variant={
                            session.status === 'completed'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {session.status === 'completed'
                            ? 'Concluída'
                            : session.status === 'interrupted'
                              ? 'Interrompida'
                              : 'Pausada'}
                        </Badge>
                        <Badge
                          variant={
                            quizAttempt?.status === 'submitted'
                              ? 'default'
                              : 'outline'
                          }
                          data-testid={`history-session-quiz-badge-${session.id}`}
                        >
                          {comprehensionStatusLabel}
                        </Badge>
                        {quizAttempt?.repeated && (
                          <Badge
                            variant="secondary"
                            data-testid={`history-session-repeated-${session.id}`}
                          >
                            Texto já praticado
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardDescription>
                      Iniciada em {formatDateTimePtBr(session.startedAt)}
                      {session.recoveredFromInterruption
                        ? ' · Recuperada após interrupção'
                        : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
                      <div>
                        <span className="text-muted-foreground block">
                          Tempo ativo
                        </span>
                        <span className="font-semibold text-sm">
                          {formatDurationPtBr(session.activeMs)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">
                          Apresentações
                        </span>
                        <span className="font-semibold text-sm">
                          {session.presentedCount.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">
                          Cobertura única
                        </span>
                        <span className="font-semibold text-sm">
                          {uniqueTokens.toLocaleString('pt-BR')} palavras
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">
                          PPM observada
                        </span>
                        <span
                          className="font-semibold text-sm"
                          data-testid={`history-observed-wpm-${session.id}`}
                        >
                          {formatObservedWpm(
                            session.presentedCount,
                            session.activeMs,
                          )}
                        </span>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-muted-foreground block">
                          Compreensão
                        </span>
                        <span
                          className="font-semibold text-sm"
                          data-testid={`history-comprehension-col-${session.id}`}
                        >
                          {comprehensionStatusLabel}
                        </span>
                      </div>
                    </div>

                    {reflection && (
                      <div
                        className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1"
                        data-testid={`history-session-reflection-${session.id}`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold">
                          <MessageSquare className="h-3.5 w-3.5 text-primary" />
                          <span>Reflexão registrada (sem pontuação):</span>
                        </div>
                        <p className="text-muted-foreground">
                          {reflection.text}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(session.id)}
                        data-testid={`history-toggle-details-${session.id}`}
                        className="h-auto min-h-8 whitespace-normal px-2 text-left text-xs text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3.5 w-3.5" />
                            Ocultar detalhes de modo e velocidade
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3.5 w-3.5" />
                            Ver detalhes (segmentos de modo e alterações de ritmo)
                          </>
                        )}
                      </Button>

                      {quizAttempt &&
                        (quizAttempt.status === 'submitted' ||
                          quizAttempt.status === 'draft') && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void navigate(`/quiz/${quizAttempt.id}`)
                            }
                            data-testid={`history-open-quiz-${session.id}`}
                            className="h-8 text-xs"
                          >
                            <FileCheck2 className="h-3.5 w-3.5" />
                            {quizAttempt.status === 'submitted'
                              ? 'Ver resultado e gabarito'
                              : 'Continuar rascunho de quiz'}
                          </Button>
                        )}
                    </div>

                    {isExpanded && (
                      <div
                        data-testid={`history-session-details-${session.id}`}
                        className="mt-2 rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-2"
                      >
                        <div>
                          <span className="font-semibold block">
                            Segmentos de modo ({session.modeSegments.length}):
                          </span>
                          {session.modeSegments.length === 0 ? (
                            <p className="text-muted-foreground">
                              Nenhum segmento concluído registrado (modo inicial:{' '}
                              {modeLabel}).
                            </p>
                          ) : (
                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                              {session.modeSegments.map((seg, idx) => (
                                <li key={idx}>
                                  {seg.mode === 'guided' ? 'Guiada' : 'RSVP'}:{' '}
                                  {formatDurationPtBr(
                                    Math.max(
                                      0,
                                      seg.endedAtActiveMs - seg.startedAtActiveMs,
                                    ),
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div>
                          <span className="font-semibold block">
                            Alterações de velocidade/pontuação (
                            {session.settingsChanges.length}):
                          </span>
                          {session.settingsChanges.length === 0 ? (
                            <p className="text-muted-foreground">
                              Manteve o ritmo inicial configurado durante toda a sessão.
                            </p>
                          ) : (
                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                              {session.settingsChanges.map((change, idx) => (
                                <li key={idx}>
                                  {change.wpm} PPM · pontuação{' '}
                                  {change.punctuationPauseEnabled
                                    ? 'ativada'
                                    : 'desativada'}{' '}
                                  (a partir da palavra {change.tokenIndex + 1})
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
