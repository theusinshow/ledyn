import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FastForward,
  Minus,
  Pause,
  Play,
  Plus,
  Rewind,
  RotateCcw,
} from 'lucide-react';
import { useAppStore } from '@/application/stores';
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
import { Input } from '@/components/ui/input';
import { BrowserClock } from '@/domain/reading/clock';
import {
  DEFAULT_WPM,
  MAX_WPM,
  MIN_WPM,
  ReadingEngine,
  WPM_STEP,
  type EngineSnapshot,
} from '@/domain/reading/engine';
import {
  calculateProgressPercent,
  countUniqueCoveredTokens,
  formatObservedWpm,
} from '@/domain/reading/metrics';
import { ReadingLeaseManager } from '@/infrastructure/db/leaseManager';
import {
  loadReaderDocumentBundle,
  saveReadingCheckpoint,
  type ReaderDocumentBundle,
} from '@/infrastructure/db/repositories';
import { toAppError } from '@/shared/errors';
import { createId, formatDurationPtBr } from '@/shared/utils';

const CHECKPOINT_INTERVAL_MS = 1_800; // <= 2 segundos conforme RF-05

type SaveIndicatorState = 'idle' | 'saving' | 'saved' | 'error';

function splitWordFocalParts(word: string): {
  prefix: string;
  pivot: string;
  suffix: string;
} {
  if (!word) {
    return { prefix: '', pivot: '', suffix: '' };
  }
  const chars = Array.from(word);
  const len = chars.length;
  const pivotIndex =
    len <= 1
      ? 0
      : len <= 5
        ? 1
        : len <= 9
          ? 2
          : len <= 13
            ? 3
            : 4;
  return {
    prefix: chars.slice(0, pivotIndex).join(''),
    pivot: chars[pivotIndex] ?? '',
    suffix: chars.slice(pivotIndex + 1).join(''),
  };
}

export function ReaderPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { tabOwnerId, preferences } = useAppStore();

  const [bundle, setBundle] = useState<ReaderDocumentBundle | null>(null);
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [saveState, setSaveState] = useState<SaveIndicatorState>('idle');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [tabConflictError, setTabConflictError] = useState<string | null>(null);
  const [visibilityPausedNotice, setVisibilityPausedNotice] = useState(false);
  const [resumeBannerText, setResumeBannerText] = useState<string | null>(null);

  const [wpmInputText, setWpmInputText] = useState<string>(
    String(DEFAULT_WPM),
  );
  const [wpmValidationError, setWpmValidationError] = useState<string | null>(
    null,
  );
  const [speedFeedback, setSpeedFeedback] = useState<string | null>(null);

  const engineRef = useRef<ReadingEngine | null>(null);
  const leaseManagerRef = useRef<ReadingLeaseManager | null>(null);
  const bundleRef = useRef<ReaderDocumentBundle | null>(null);
  const sessionIdRef = useRef<string>('');
  const sessionStartedAtRef = useRef<string>('');
  const recoveredFlagRef = useRef<boolean>(false);

  const persistCheckpoint = useCallback(
    async (
      currentSnap: EngineSnapshot,
      statusOverride?: 'playing' | 'paused' | 'completed' | 'interrupted',
      targetBundle?: ReaderDocumentBundle | null,
    ): Promise<boolean> => {
      const resolvedBundle = targetBundle ?? bundleRef.current;
      if (!resolvedBundle || !sessionIdRef.current) {
        return false;
      }

      setSaveState('saving');
      try {
        await saveReadingCheckpoint({
          sessionId: sessionIdRef.current,
          documentId: resolvedBundle.document.id,
          contentVersionId: resolvedBundle.content.id,
          ownerId: tabOwnerId,
          startedAt: sessionStartedAtRef.current,
          snapshot: currentSnap,
          sessionStatusOverride: statusOverride,
          recoveredFromInterruption: recoveredFlagRef.current,
        });
        setSaveState('saved');
        setSaveErrorMessage(null);
        return true;
      } catch (err) {
        const appErr = toAppError(err);
        setSaveState('error');
        if (appErr.code === 'SESSION_LOCKED') {
          setTabConflictError(appErr.userMessage);
          engineRef.current?.pause('lease_lost');
        } else {
          setSaveErrorMessage(
            `Seu último avanço ainda não foi salvo. (${appErr.userMessage})`,
          );
          engineRef.current?.pause('storage_error');
        }
        return false;
      }
    },
    [tabOwnerId],
  );

  // Carregamento inicial do documento e sessão
  useEffect(() => {
    if (!documentId) {
      return;
    }

    let cancelled = false;

    const leaseManager = new ReadingLeaseManager({
      ownerId: tabOwnerId,
      onConflict: () => {
        if (engineRef.current?.getSnapshot().status === 'playing') {
          engineRef.current.pause('lease_lost');
          setTabConflictError('Já existe uma leitura ativa em outra aba.');
        }
      },
    });
    leaseManagerRef.current = leaseManager;

    loadReaderDocumentBundle(documentId, tabOwnerId)
      .then((loaded) => {
        if (cancelled) return;
        bundleRef.current = loaded;

        const resumable = loaded.resumableSession;
        const initialCursorIdx = loaded.progress.cursor.tokenIndex;
        const initialWpm =
          resumable?.settingsChanges[resumable.settingsChanges.length - 1]
            ?.wpm ?? preferences.defaultWpm;
        const initialPunct =
          resumable?.settingsChanges[resumable.settingsChanges.length - 1]
            ?.punctuationPauseEnabled ?? preferences.punctuationPauseEnabled;

        if (resumable && initialCursorIdx < loaded.content.tokenCount) {
          sessionIdRef.current = resumable.id;
          sessionStartedAtRef.current = resumable.startedAt;
          recoveredFlagRef.current = loaded.wasInterrupted;
        } else {
          sessionIdRef.current = createId();
          sessionStartedAtRef.current = new Date().toISOString();
          recoveredFlagRef.current = false;
        }

        if (
          initialCursorIdx > 0 &&
          initialCursorIdx < loaded.content.tokenCount
        ) {
          if (loaded.wasInterrupted) {
            setResumeBannerText(
              `Sessão anterior interrompida. Pronto para continuar de onde parou (palavra ${initialCursorIdx + 1} de ${loaded.content.tokenCount}).`,
            );
          } else {
            setResumeBannerText(
              `Continuar de onde parou — último ponto salvo na palavra ${initialCursorIdx + 1} de ${loaded.content.tokenCount}.`,
            );
          }
        } else {
          setResumeBannerText(null);
        }

        const clock = new BrowserClock();
        const engine = new ReadingEngine({
          clock,
          contentVersionId: loaded.content.id,
          tokens: loaded.tokens,
          initialCursorIndex: initialCursorIdx,
          initialWpm,
          initialPunctuationPauseEnabled: initialPunct,
          initialActiveMs: resumable ? resumable.activeMs : 0,
          initialPresentedCount: resumable ? resumable.presentedCount : 0,
          initialCoverageRanges: resumable ? resumable.coverageRanges : [],
          initialModeSegments: resumable ? resumable.modeSegments : [],
          initialSettingsChanges: resumable ? resumable.settingsChanges : [],
          onStateChange: (nextSnap) => {
            if (!cancelled) {
              setSnapshot(nextSnap);
            }
          },
          onTransitionCheckpoint: (nextSnap, reason) => {
            if (cancelled) return;
            if (reason === 'completed') {
              void persistCheckpoint(nextSnap, 'completed', loaded);
              void leaseManager.releaseLeaseIfOwned();
            } else if (reason === 'system_suspension') {
              setVisibilityPausedNotice(true);
              void persistCheckpoint(nextSnap, 'paused', loaded);
              void leaseManager.releaseLeaseIfOwned();
            }
          },
        });

        engineRef.current = engine;
        setBundle(loaded);
        setSnapshot(engine.getSnapshot());
        setWpmInputText(String(initialWpm));
        setSaveState(initialCursorIdx > 0 ? 'saved' : 'idle');
        setLoadError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const appErr = toAppError(err);
        setLoadError(appErr.userMessage);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
      void leaseManager.releaseLeaseIfOwned();
      leaseManager.destroy();
      leaseManagerRef.current = null;
    };
  }, [
    documentId,
    tabOwnerId,
    preferences.defaultWpm,
    preferences.punctuationPauseEnabled,
    persistCheckpoint,
  ]);

  const isPlayingState = snapshot?.status === 'playing';

  // Temporizador periódico de checkpoint (<= 2 s) e heartbeat de lease enquanto reproduzindo
  useEffect(() => {
    if (!isPlayingState) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const currentEngine = engineRef.current;
      if (!currentEngine) return;
      const currentSnap = currentEngine.getSnapshot();
      if (currentSnap.status === 'playing') {
        void persistCheckpoint(currentSnap, 'playing');
      }
    }, CHECKPOINT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPlayingState, persistCheckpoint]);

  // Pausar imediatamente ao ocultar aba (visibilitychange) ou fechar página (pagehide)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const engine = engineRef.current;
        if (engine && engine.getSnapshot().status === 'playing') {
          engine.pause('visibility_hidden');
          setVisibilityPausedNotice(true);
          const pausedSnap = engine.getSnapshot();
          void persistCheckpoint(pausedSnap, 'paused');
          void leaseManagerRef.current?.releaseLeaseIfOwned();
        }
      }
    };

    const handlePageHide = () => {
      const engine = engineRef.current;
      if (engine && engine.getSnapshot().status === 'playing') {
        engine.pause('visibility_hidden');
        const pausedSnap = engine.getSnapshot();
        void persistCheckpoint(pausedSnap, 'paused');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [persistCheckpoint]);

  const handleTogglePlayPause = useCallback(async () => {
    const engine = engineRef.current;
    const leaseManager = leaseManagerRef.current;
    if (!engine || !bundle || !leaseManager) return;

    const currentSnap = engine.getSnapshot();
    if (currentSnap.status === 'playing') {
      engine.pause('manual');
      const pausedSnap = engine.getSnapshot();
      await persistCheckpoint(pausedSnap, 'paused');
      await leaseManager.releaseLeaseIfOwned();
      return;
    }

    if (currentSnap.status === 'completed') {
      return;
    }

    setTabConflictError(null);
    setVisibilityPausedNotice(false);
    setResumeBannerText(null);

    try {
      await leaseManager.acquireOrRenewLease(
        sessionIdRef.current,
        bundle.document.id,
      );
      engine.play();
      const playingSnap = engine.getSnapshot();
      await persistCheckpoint(playingSnap, 'playing');
    } catch (err) {
      const appErr = toAppError(err);
      if (appErr.code === 'SESSION_LOCKED') {
        setTabConflictError(appErr.userMessage);
      } else {
        setSaveState('error');
        setSaveErrorMessage(
          `Seu último avanço ainda não foi salvo. (${appErr.userMessage})`,
        );
      }
    }
  }, [bundle, persistCheckpoint]);

  const handleSeekBy = useCallback(
    async (delta: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.stepBy(delta);
      const nextSnap = engine.getSnapshot();
      await persistCheckpoint(nextSnap, 'paused');
      await leaseManagerRef.current?.releaseLeaseIfOwned();
    },
    [persistCheckpoint],
  );

  const handleSeekTo = useCallback(
    async (targetIndex: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.seek(targetIndex);
      const nextSnap = engine.getSnapshot();
      await persistCheckpoint(
        nextSnap,
        nextSnap.status === 'completed' ? 'completed' : 'paused',
      );
      await leaseManagerRef.current?.releaseLeaseIfOwned();
    },
    [persistCheckpoint],
  );

  const handleAdjustWpmStep = useCallback((deltaSteps: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const newWpm = engine.adjustWpmByStep(deltaSteps);
    setWpmInputText(String(newWpm));
    setWpmValidationError(null);
    if (engine.getSnapshot().status === 'playing') {
      setSpeedFeedback(
        `Ritmo ajustado para ${newWpm} PPM (aplicado na próxima palavra).`,
      );
    } else {
      setSpeedFeedback(null);
    }
  }, []);

  const handleApplyWpmValue = (rawValue: string) => {
    setWpmInputText(rawValue);
    const parsed = Number(rawValue);
    if (
      rawValue.trim() === '' ||
      !Number.isFinite(parsed) ||
      parsed < MIN_WPM ||
      parsed > MAX_WPM
    ) {
      setWpmValidationError(
        `Informe um valor entre ${MIN_WPM} e ${MAX_WPM} PPM.`,
      );
      return;
    }
    setWpmValidationError(null);
    const engine = engineRef.current;
    if (!engine) return;
    engine.setWpm(parsed);
    if (engine.getSnapshot().status === 'playing') {
      setSpeedFeedback(
        `Ritmo ajustado para ${Math.round(parsed)} PPM (aplicado na próxima palavra).`,
      );
    }
  };

  const handleTogglePunctuation = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const current = engine.getSnapshot().punctuationPauseEnabled;
    engine.setPunctuationPauseEnabled(!current);
  };

  const handleRestartCompletedDocument = async () => {
    if (!bundle) return;
    engineRef.current?.destroy();

    const newSessionId = createId();
    sessionIdRef.current = newSessionId;
    sessionStartedAtRef.current = new Date().toISOString();
    recoveredFlagRef.current = false;

    const currentWpm = snapshot?.wpm ?? preferences.defaultWpm;
    const currentPunct =
      snapshot?.punctuationPauseEnabled ?? preferences.punctuationPauseEnabled;

    const engine = new ReadingEngine({
      clock: new BrowserClock(),
      contentVersionId: bundle.content.id,
      tokens: bundle.tokens,
      initialCursorIndex: 0,
      initialWpm: currentWpm,
      initialPunctuationPauseEnabled: currentPunct,
      onStateChange: (nextSnap) => {
        setSnapshot(nextSnap);
      },
      onTransitionCheckpoint: (nextSnap, reason) => {
        if (reason === 'completed') {
          void persistCheckpoint(nextSnap, 'completed');
          void leaseManagerRef.current?.releaseLeaseIfOwned();
        } else if (reason === 'system_suspension') {
          setVisibilityPausedNotice(true);
          void persistCheckpoint(nextSnap, 'paused');
          void leaseManagerRef.current?.releaseLeaseIfOwned();
        }
      },
    });

    engineRef.current = engine;
    const freshSnap = engine.getSnapshot();
    setSnapshot(freshSnap);
    await persistCheckpoint(freshSnap, 'paused');
  };

  // Atalhos de teclado no leitor (UX-FLOWS.md seção 5)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toUpperCase() ?? '';
      const isEditableOrControl =
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target?.isContentEditable;

      if (e.key === 'Escape') {
        if (engineRef.current?.getSnapshot().status === 'playing') {
          e.preventDefault();
          void handleTogglePlayPause();
        }
        return;
      }

      if (isEditableOrControl) {
        return;
      }

      if (e.code === 'Space') {
        if (tagName === 'BUTTON' || tagName === 'A') {
          return;
        }
        e.preventDefault();
        void handleTogglePlayPause();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        void handleSeekBy(-10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        void handleSeekBy(10);
      } else if (e.key === '-') {
        e.preventDefault();
        handleAdjustWpmStep(-1);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleAdjustWpmStep(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleTogglePlayPause, handleSeekBy, handleAdjustWpmStep]);

  if (!documentId) {
    return (
      <Card data-testid="reader-error-state">
        <CardHeader>
          <CardTitle>Não foi possível abrir o documento</CardTitle>
          <CardDescription>Documento não especificado.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            onClick={() => void navigate('/library')}
            data-testid="back-to-library-btn"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar à biblioteca
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
        Preparando leitor...
      </div>
    );
  }

  if (loadError || !bundle || !snapshot) {
    return (
      <Card data-testid="reader-error-state">
        <CardHeader>
          <CardTitle>Não foi possível abrir o documento</CardTitle>
          <CardDescription>
            {loadError ?? 'Documento não encontrado na biblioteca local.'}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            onClick={() => void navigate('/library')}
            data-testid="back-to-library-btn"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar à biblioteca
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const isPlaying = snapshot.status === 'playing';
  const isCompleted = snapshot.status === 'completed';
  const progressPercent = calculateProgressPercent(
    snapshot.cursor.tokenIndex,
    snapshot.tokenCount,
  );
  const uniqueCovered = countUniqueCoveredTokens(snapshot.coverageRanges);
  const isPartialCoverage = uniqueCovered < snapshot.tokenCount;

  const currentWord = snapshot.currentToken?.text ?? '';
  const focalParts = splitWordFocalParts(currentWord);
  const isLongWord = Array.from(currentWord).length > 16;

  const prevContextTokens = bundle.tokens
    .slice(
      Math.max(0, snapshot.cursor.tokenIndex - 4),
      snapshot.cursor.tokenIndex,
    )
    .map((t) => t.text)
    .join(' ');
  const nextContextTokens = bundle.tokens
    .slice(snapshot.cursor.tokenIndex + 1, snapshot.cursor.tokenIndex + 5)
    .map((t) => t.text)
    .join(' ');

  return (
    <div className="space-y-5" data-testid="reader-page">
      {/* Barra Superior do Leitor */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (engineRef.current?.getSnapshot().status === 'playing') {
                engineRef.current.pause('manual');
                await persistCheckpoint(engineRef.current.getSnapshot(), 'paused');
                await leaseManagerRef.current?.releaseLeaseIfOwned();
              }
              await navigate('/library');
            }}
            data-testid="reader-exit-library-btn"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Biblioteca
          </Button>
          <h1
            className="font-semibold text-base sm:text-lg truncate"
            data-testid="reader-document-title"
          >
            {bundle.document.title}
          </h1>
        </div>

        {/* Indicador Honesto de Persistência */}
        <div className="flex items-center gap-2 text-xs">
          {saveState === 'saving' && (
            <Badge variant="outline" data-testid="checkpoint-status-saving">
              Salvando progresso...
            </Badge>
          )}
          {saveState === 'saved' && !saveErrorMessage && (
            <Badge variant="secondary" data-testid="checkpoint-status-saved">
              Ponto salvo
            </Badge>
          )}
          {saveState === 'error' && (
            <Badge variant="destructive" data-testid="checkpoint-status-error">
              Avanço não salvo
            </Badge>
          )}
        </div>
      </div>

      {/* Alertas de Conflito entre Abas, Falha de Gravação, Visibilidade e Retomada */}
      {tabConflictError && (
        <div
          role="alert"
          data-testid="tab-conflict-alert"
          className="flex flex-col gap-3 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{tabConflictError}</p>
              <p className="text-xs opacity-90">
                Apenas uma leitura pode reproduzir por vez neste navegador para proteger seu progresso.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigate('/library')}
            >
              Ir à biblioteca
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTabConflictError(null)}
            >
              Fechar aviso
            </Button>
          </div>
        </div>
      )}

      {saveErrorMessage && (
        <div
          role="alert"
          data-testid="checkpoint-error-alert"
          className="flex flex-col gap-3 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{saveErrorMessage}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void persistCheckpoint(snapshot, 'paused')}
            data-testid="retry-checkpoint-btn"
          >
            Tentar salvar novamente
          </Button>
        </div>
      )}

      {visibilityPausedNotice && (
        <div
          role="status"
          data-testid="visibility-paused-banner"
          className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
        >
          <span>
            Leitura pausada enquanto você estava fora. Clique em Iniciar para retomar.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVisibilityPausedNotice(false)}
          >
            Entendi
          </Button>
        </div>
      )}

      {resumeBannerText && !isPlaying && !isCompleted && (
        <div
          role="status"
          data-testid="resume-checkpoint-banner"
          className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
        >
          {resumeBannerText}
        </div>
      )}

      {/* Visor Principal RSVP ou Resumo de Conclusão */}
      {!isCompleted ? (
        <Card className="overflow-hidden">
          <CardContent className="p-6 sm:p-10">
            <div className="flex flex-col items-center justify-center min-h-[200px] sm:min-h-[240px] rounded-xl border border-border bg-muted/20 px-4 py-6 relative select-none">
              <div
                className="h-3 w-0.5 bg-primary/40 mb-3"
                aria-hidden="true"
              />

              <div
                data-testid="rsvp-word-display"
                className={`w-full text-center font-mono font-semibold tracking-wide break-words leading-tight ${
                  isLongWord
                    ? 'text-2xl sm:text-3xl'
                    : 'text-3xl sm:text-5xl'
                }`}
              >
                <span>{focalParts.prefix}</span>
                <span className="text-primary underline decoration-primary/60 underline-offset-4">
                  {focalParts.pivot}
                </span>
                <span>{focalParts.suffix}</span>
              </div>

              <div
                className="h-3 w-0.5 bg-primary/40 mt-3"
                aria-hidden="true"
              />

              {!isPlaying && (
                <p
                  className="mt-4 text-xs text-muted-foreground text-center max-w-md line-clamp-2"
                  data-testid="rsvp-paused-context"
                >
                  {prevContextTokens && <span>...{prevContextTokens} </span>}
                  <strong className="text-foreground">{currentWord}</strong>
                  {nextContextTokens && <span> {nextContextTokens}...</span>}
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-col items-center gap-4">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => void handleSeekBy(-10)}
                  aria-label="Voltar 10 palavras"
                  data-testid="rsvp-back-10-btn"
                >
                  <Rewind className="h-4 w-4" aria-hidden="true" />
                  -10
                </Button>

                <Button
                  size="lg"
                  onClick={() => void handleTogglePlayPause()}
                  data-testid="rsvp-play-pause-btn"
                  className="min-w-[150px]"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-5 w-5" aria-hidden="true" />
                      Pausar
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5" aria-hidden="true" />
                      Iniciar
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => void handleSeekBy(10)}
                  aria-label="Avançar 10 palavras"
                  data-testid="rsvp-forward-10-btn"
                >
                  +10
                  <FastForward className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="w-full max-w-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span data-testid="rsvp-cursor-position">
                    Palavra {snapshot.cursor.tokenIndex + 1} de{' '}
                    {snapshot.tokenCount}
                  </span>
                  <span data-testid="rsvp-progress-percent">
                    {progressPercent}%
                  </span>
                </div>
                <label htmlFor="rsvp-position-slider" className="sr-only">
                  Posição no texto
                </label>
                <input
                  id="rsvp-position-slider"
                  data-testid="rsvp-position-slider"
                  type="range"
                  min={0}
                  max={Math.max(0, snapshot.tokenCount - 1)}
                  value={Math.min(
                    snapshot.cursor.tokenIndex,
                    Math.max(0, snapshot.tokenCount - 1),
                  )}
                  onChange={(e) => void handleSeekTo(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer h-2 rounded-lg"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="reader-completed-summary">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              <CardTitle>Leitura concluída</CardTitle>
            </div>
            <CardDescription>
              Resumo real da sessão de apresentação RSVP para &ldquo;
              {bundle.document.title}&rdquo;.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPartialCoverage && (
              <div
                role="status"
                data-testid="partial-coverage-notice"
                className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
              >
                <strong>Sessão parcial por cobertura:</strong> parte do texto foi saltada manualmente ({uniqueCovered} de {snapshot.tokenCount} palavras únicas apresentadas).
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <span className="text-xs text-muted-foreground">
                  Tempo ativo
                </span>
                <p
                  className="text-lg font-bold"
                  data-testid="summary-active-time"
                >
                  {formatDurationPtBr(snapshot.activeMs)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <span className="text-xs text-muted-foreground">
                  Apresentações
                </span>
                <p
                  className="text-lg font-bold"
                  data-testid="summary-presented-count"
                >
                  {snapshot.presentedCount.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <span className="text-xs text-muted-foreground">
                  Cobertura única
                </span>
                <p
                  className="text-lg font-bold"
                  data-testid="summary-unique-coverage"
                >
                  {uniqueCovered.toLocaleString('pt-BR')} /{' '}
                  {snapshot.tokenCount.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <span className="text-xs text-muted-foreground">
                  PPM observada
                </span>
                <p
                  className="text-lg font-bold"
                  data-testid="summary-observed-wpm"
                >
                  {formatObservedWpm(
                    snapshot.presentedCount,
                    snapshot.activeMs,
                  )}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Nota: A PPM observada mede o ritmo real de apresentação das palavras em tela; não comprova retenção ou ganho cognitivo. Este texto pessoal não possui questionário objetivo vinculado.
            </p>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-between gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void handleSeekTo(Math.max(0, snapshot.tokenCount - 1))
              }
              data-testid="summary-back-to-text-btn"
            >
              Voltar ao texto (pausado)
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => void handleRestartCompletedDocument()}
                data-testid="summary-restart-btn"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Recomeçar leitura
              </Button>
              <Button
                onClick={() => void navigate('/library')}
                data-testid="summary-to-library-btn"
              >
                Voltar à biblioteca
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {/* Controles de Velocidade (PPM) e Pausas de Pontuação */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <label
                htmlFor="rsvp-wpm-input"
                className="text-sm font-semibold block"
              >
                Velocidade: {snapshot.wpm} PPM (palavras por minuto)
              </label>
              <p className="text-xs text-muted-foreground">
                Ritmo configurado ({MIN_WPM} a {MAX_WPM} PPM, passo de{' '}
                {WPM_STEP}). Alterações entram na próxima palavra.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Reduzir 25 PPM"
                disabled={snapshot.wpm <= MIN_WPM}
                onClick={() => handleAdjustWpmStep(-1)}
                data-testid="rsvp-wpm-decrease-btn"
              >
                <Minus className="h-4 w-4" />
              </Button>

              <Input
                id="rsvp-wpm-input"
                data-testid="rsvp-wpm-input"
                type="number"
                min={MIN_WPM}
                max={MAX_WPM}
                step={WPM_STEP}
                value={wpmInputText}
                onChange={(e) => handleApplyWpmValue(e.target.value)}
                className="w-24 text-center font-mono"
              />

              <Button
                variant="outline"
                size="icon"
                aria-label="Aumentar 25 PPM"
                disabled={snapshot.wpm >= MAX_WPM}
                onClick={() => handleAdjustWpmStep(1)}
                data-testid="rsvp-wpm-increase-btn"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {wpmValidationError && (
            <p
              role="alert"
              data-testid="wpm-validation-error"
              className="text-xs text-destructive font-medium"
            >
              {wpmValidationError}
            </p>
          )}

          {speedFeedback && (
            <p
              data-testid="wpm-change-feedback"
              className="text-xs text-muted-foreground"
            >
              {speedFeedback}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-2 border-t border-border sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">
                Pausas inteligentes de pontuação
              </span>
              <p className="text-xs text-muted-foreground">
                Multiplicadores: 1,5x vírgula/;/: · 2x fim de frase · 2,5x fim de parágrafo (prevalece o maior).
              </p>
            </div>
            <Button
              variant={snapshot.punctuationPauseEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={handleTogglePunctuation}
              aria-pressed={snapshot.punctuationPauseEnabled}
              data-testid="rsvp-punctuation-toggle"
            >
              {snapshot.punctuationPauseEnabled ? 'Ativadas' : 'Desativadas'}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground pt-1">
            Atalhos de teclado: <kbd className="rounded border px-1">Espaço</kbd> iniciar/pausar ·{' '}
            <kbd className="rounded border px-1">←</kbd>/<kbd className="rounded border px-1">→</kbd> -10/+10 palavras ·{' '}
            <kbd className="rounded border px-1">-</kbd>/<kbd className="rounded border px-1">+</kbd> ajustar 25 PPM ·{' '}
            <kbd className="rounded border px-1">Esc</kbd> pausar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
