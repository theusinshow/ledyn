import { useEffect, useState } from 'react';
import { Headphones, Square, Volume2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isSpeechSupported,
  listLocalVoices,
  type LocalVoice,
} from '@/infrastructure/speech/narrator';

export interface ListenBarProps {
  listening: boolean;
  voiceId: string | null;
  rate: number;
  error: string | null;
  onVoiceChange: (voiceId: string) => void;
  onRateChange: (rate: number) => void;
  onStart: () => void;
  onStop: () => void;
  onClose: () => void;
}

export const MIN_SPEECH_RATE = 0.6;
export const MAX_SPEECH_RATE = 2.5;

/**
 * Controles do modo "Ouvir": voz local, velocidade da fala, ouvir/parar.
 * A fala conduz o destaque na Leitura Guiada; ao parar, o cursor vai para a última palavra falada.
 */
export function ListenBar({
  listening,
  voiceId,
  rate,
  error,
  onVoiceChange,
  onRateChange,
  onStart,
  onStop,
  onClose,
}: ListenBarProps) {
  const [voices, setVoices] = useState<LocalVoice[] | null>(null);
  const supported = isSpeechSupported();

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void listLocalVoices().then((list) => {
      if (cancelled) return;
      setVoices(list);
      if (!voiceId && list[0]) onVoiceChange(list[0].id);
    });
    return () => {
      cancelled = true;
    };
    // Carrega as vozes uma vez ao abrir a barra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  const hasPortuguese = voices?.some((v) => v.lang.toLowerCase().startsWith('pt')) ?? false;
  const unavailable = !supported
    ? 'Este navegador não oferece síntese de voz.'
    : voices !== null && voices.length === 0
      ? 'Nenhuma voz local instalada. Vozes online não são usadas para o texto não sair do aparelho.'
      : null;

  return (
    <div
      data-testid="listen-bar"
      className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] p-3.5"
    >
      <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Headphones className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium">
            Ouvir {listening && <span className="ml-1 font-mono text-[0.6875rem] text-primary" data-testid="listen-status">● falando</span>}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">
            Voz local do sistema. A fala guia o destaque; ouvir não conta nas métricas de leitura.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar modo Ouvir"
        data-testid="listen-close-btn"
        className="rounded-md p-1.5 text-subtle-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      </div>

      {unavailable ? (
        <p className="text-xs text-muted-foreground" data-testid="listen-unavailable">
          {unavailable}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5 sm:pl-[2.625rem]">
          <label className="sr-only" htmlFor="listen-voice">
            Voz
          </label>
          <select
            id="listen-voice"
            data-testid="listen-voice-select"
            value={voiceId ?? ''}
            disabled={!voices || listening}
            onChange={(e) => onVoiceChange(e.target.value)}
            className="h-9 max-w-[14rem] rounded-md border border-input bg-surface-sunken px-2 text-xs"
          >
            {voices === null && <option value="">Carregando vozes…</option>}
            {voices?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name.replace(/^Microsoft\s+/, '').replace(/\s+-\s+.*$/, '')} ({v.lang})
              </option>
            ))}
          </select>
          {voices && !hasPortuguese && (
            <span className="text-[0.6875rem] text-warning">Sem voz em português</span>
          )}
          <label className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground" htmlFor="listen-rate">
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            <input
              id="listen-rate"
              data-testid="listen-rate"
              type="range"
              min={MIN_SPEECH_RATE}
              max={MAX_SPEECH_RATE}
              step={0.1}
              value={rate}
              disabled={listening}
              onChange={(e) => onRateChange(Number(e.target.value))}
              className="h-1.5 w-28 cursor-pointer"
            />
            <span className="w-9 font-mono tabular-nums">{rate.toFixed(1).replace('.', ',')}×</span>
          </label>
          {listening ? (
            <Button size="sm" variant="outline" onClick={onStop} data-testid="listen-stop-btn">
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              Parar
            </Button>
          ) : (
            <Button size="sm" onClick={onStart} disabled={!voiceId} data-testid="listen-start-btn">
              <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
              Ouvir daqui
            </Button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive" data-testid="listen-error">
          {error}
        </p>
      )}

    </div>
  );
}
