import type { FocalParts } from '@/domain/reading/focalPoint';
import { cn } from '@/shared/utils';

export interface RsvpStageProps {
  focalParts: FocalParts;
  displayedText: string;
  isPlaying: boolean;
  isParagraphStart: boolean;
  /** Recuo da última retomada; `rewindKey` reinicia a animação do aviso. */
  resumeRewindTokens: number;
  rewindKey: number;
  /** O que acabou de ser lido (vazio quando desligado ou no início). */
  contextTrail: string;
  pausedContext: { before: string; after: string };
  variant?: 'card' | 'focus';
}

/**
 * Palco do RSVP: letra de foco travada no centro entre dois marcadores,
 * sinal de parágrafo, aviso de retomada e trilha de contexto.
 */
export function RsvpStage({
  focalParts,
  displayedText,
  isPlaying,
  isParagraphStart,
  resumeRewindTokens,
  rewindKey,
  contextTrail,
  pausedContext,
  variant = 'card',
}: RsvpStageProps) {
  const isFocus = variant === 'focus';
  const length = Array.from(displayedText).length;
  const sizeClass = isFocus
    ? length > 16
      ? 'text-4xl sm:text-5xl 2xl:text-6xl'
      : length > 10
        ? 'text-5xl sm:text-7xl 2xl:text-8xl'
        : 'text-6xl sm:text-8xl 2xl:text-9xl'
    : length > 16
      ? 'text-2xl sm:text-3xl 2xl:text-4xl'
      : length > 10
        ? 'text-3xl sm:text-5xl 2xl:text-6xl'
        : 'text-4xl sm:text-6xl 2xl:text-7xl';

  return (
    <div
      className={cn(
        'relative flex select-none flex-col items-center justify-center overflow-hidden px-4',
        isFocus
          ? 'h-full w-full py-12'
          : 'min-h-[13.75rem] rounded-lg border border-border bg-surface-sunken py-8 sm:min-h-[16.25rem] 2xl:min-h-[22rem]',
      )}
    >
      {!isFocus && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-gradient-to-r from-transparent via-border-strong to-transparent"
      />
      <div className={cn('relative w-px bg-primary/70', isFocus ? 'mb-6 h-6' : 'mb-4 h-4')} aria-hidden="true" />

      {isParagraphStart && (
        <span
          data-testid="rsvp-paragraph-cue"
          className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[0.6875rem] text-primary"
        >
          <span aria-hidden="true">¶</span>
          Novo parágrafo
        </span>
      )}

      {isPlaying && resumeRewindTokens > 0 && (
        <span
          key={rewindKey}
          data-testid="rsvp-resume-rewind-hint"
          className="absolute right-4 top-4 font-mono text-[0.6875rem] text-muted-foreground animate-fade-out-late"
        >
          ↺ retomado do início da frase
        </span>
      )}

      {/* Letra de foco (ORP) travada no centro: prefixo alinhado à direita, sufixo à esquerda. */}
      <div
        data-testid="rsvp-word-display"
        className={`relative grid w-full grid-cols-[1fr_auto_1fr] items-baseline whitespace-nowrap font-medium tracking-[-0.025em] leading-tight ${sizeClass}`}
      >
        <span className="text-right">{focalParts.prefix}</span>
        <span
          data-testid="rsvp-focal-letter"
          className="text-primary [text-shadow:0_0_24px_color-mix(in_srgb,var(--primary)_45%,transparent)]"
        >
          {focalParts.pivot}
        </span>
        <span className="text-left">{focalParts.suffix}</span>
      </div>

      <div className={cn('relative w-px bg-primary/70', isFocus ? 'mt-6 h-6' : 'mt-4 h-4')} aria-hidden="true" />

      {isPlaying ? (
        contextTrail && (
          <div
            data-testid="rsvp-context-trail"
            aria-hidden="true"
            className={cn(
              'relative mt-5 flex w-full max-w-xl justify-end overflow-hidden whitespace-nowrap text-subtle-foreground [mask-image:linear-gradient(to_right,transparent,black_25%)]',
              isFocus ? 'text-sm' : 'text-xs',
            )}
          >
            <span>{contextTrail}</span>
          </div>
        )
      ) : (
        <p
          className="relative mt-5 line-clamp-2 max-w-md text-center text-xs text-muted-foreground"
          data-testid="rsvp-paused-context"
        >
          {pausedContext.before && <span>...{pausedContext.before} </span>}
          <strong className="text-foreground">{displayedText}</strong>
          {pausedContext.after && <span> {pausedContext.after}...</span>}
        </p>
      )}
    </div>
  );
}
