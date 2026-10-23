import { useCallback, useEffect, useRef, useState } from 'react';
import { Minimize2, Pause, Play, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RsvpStage, type RsvpStageProps } from '@/features/reader/RsvpStage';
import { cn } from '@/shared/utils';

export interface FocusModeOverlayProps {
  stage: Omit<RsvpStageProps, 'variant'>;
  isPlaying: boolean;
  wpm: number;
  progressPercent: number;
  locationLabel: string;
  onTogglePlay: () => void;
  onRewindSentence: () => void;
  onExit: () => void;
}

const IDLE_HIDE_MS = 2_000;

/**
 * Modo foco: só o palco do RSVP em tela cheia. Os controles somem enquanto a
 * leitura toca sem movimento do mouse e voltam ao mexer, tocar ou pausar.
 * Usa a Fullscreen API quando disponível; sair da tela cheia fecha o modo foco.
 */
export function FocusModeOverlay({
  stage,
  isPlaying,
  wpm,
  progressPercent,
  locationLabel,
  onTogglePlay,
  onRewindSentence,
  onExit,
}: FocusModeOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const enteredFullscreenRef = useRef(false);
  const [idle, setIdle] = useState(false);
  const onExitRef = useRef(onExit);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const wake = useCallback(() => {
    setIdle(false);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setIdle(true), IDLE_HIDE_MS);
  }, []);

  // Tela cheia ao abrir; se o usuário sair dela pelo navegador, fecha o modo foco.
  useEffect(() => {
    const root = rootRef.current;
    const onFullscreenChange = () => {
      if (enteredFullscreenRef.current && !document.fullscreenElement) onExitRef.current();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    if (root && typeof root.requestFullscreen === 'function' && !document.fullscreenElement) {
      root
        .requestFullscreen()
        .then(() => {
          enteredFullscreenRef.current = true;
        })
        .catch(() => undefined);
    }
    rootRef.current?.focus();
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      if (enteredFullscreenRef.current && document.fullscreenElement) {
        enteredFullscreenRef.current = false;
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, []);

  // Esc com a leitura pausada sai do modo foco (tocando, o leitor já pausa no Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPlaying) onExitRef.current();
      else wake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlaying, wake]);

  const controlsHidden = isPlaying && idle;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Modo foco"
      tabIndex={-1}
      data-testid="focus-mode-overlay"
      onPointerMove={wake}
      onPointerDown={wake}
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-background outline-none',
        controlsHidden && 'cursor-none',
      )}
    >
      <div className="h-0.5 w-full bg-border" aria-hidden="true">
        <div className="h-full bg-primary/70 transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="min-h-0 flex-1">
        <RsvpStage {...stage} isPlaying={isPlaying} variant="focus" />
      </div>

      <div
        data-testid="focus-mode-controls"
        data-hidden={controlsHidden ? 'true' : 'false'}
        className={cn(
          'flex items-center justify-between gap-3 border-t border-border px-6 py-4 transition-opacity duration-500',
          controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      >
        <span className="min-w-0 truncate font-mono text-[0.6875rem] text-muted-foreground">
          {locationLabel} · {progressPercent}% · {wpm} PPM
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onRewindSentence} data-testid="focus-rewind-sentence-btn" title="Voltar ao início da frase (R)">
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Frase
          </Button>
          <Button onClick={onTogglePlay} className="min-w-[8rem]" data-testid="focus-play-pause-btn">
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4" aria-hidden="true" /> Pausar
              </>
            ) : (
              <>
                <Play className="h-4 w-4" aria-hidden="true" /> Iniciar
              </>
            )}
          </Button>
          <Button variant="outline" onClick={onExit} data-testid="focus-exit-btn" title="Sair do modo foco (F ou Esc)">
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
