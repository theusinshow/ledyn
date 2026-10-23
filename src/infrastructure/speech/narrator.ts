import type { Token } from '@/domain/contracts';
import {
  buildSpeechChunk,
  tokenIndexAtChar,
  type SpeechChunk,
} from '@/domain/reading/speechChunks';

/**
 * Leitura em voz alta com a Web Speech API, usando APENAS vozes locais do sistema
 * (`localService === true`). Vozes online são ignoradas para o texto nunca sair do
 * aparelho (sem rede no MVP). A fala avança frase a frase; os eventos de fronteira
 * de palavra informam o token falado.
 */
export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

export type LocalVoice = {
  /** `voiceURI`, estável entre sessões. */
  id: string;
  name: string;
  lang: string;
};

/** Vozes locais, com as de português primeiro (pt-BR antes de pt-PT). */
export function listLocalVoices(timeoutMs = 1_500): Promise<LocalVoice[]> {
  if (!isSpeechSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;

  const collect = (): LocalVoice[] =>
    synth
      .getVoices()
      .filter((v) => v.localService)
      .map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang }))
      .sort((a, b) => rank(a.lang) - rank(b.lang) || a.name.localeCompare(b.name));

  const initial = collect();
  if (initial.length > 0) return Promise.resolve(initial);

  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      window.clearTimeout(timer);
      resolve(collect());
    };
    const timer = window.setTimeout(done, timeoutMs);
    synth.addEventListener('voiceschanged', done);
  });
}

function rank(lang: string): number {
  const l = lang.toLowerCase();
  if (l === 'pt-br') return 0;
  if (l.startsWith('pt')) return 1;
  return 2;
}

export interface NarratorCallbacks {
  /** Token que está sendo falado agora. */
  onToken: (tokenIndex: number) => void;
  /** Chegou ao fim do documento. */
  onEnd: () => void;
  onError: (message: string) => void;
}

export class Narrator {
  private generation = 0;
  private active = false;

  constructor(
    private readonly tokens: ReadonlyArray<Token>,
    private readonly callbacks: NarratorCallbacks,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  /** Começa (ou recomeça) a falar a partir do token informado. */
  start(fromToken: number, voiceId: string, rate: number): void {
    if (!isSpeechSupported()) {
      this.callbacks.onError('Este navegador não oferece síntese de voz.');
      return;
    }
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.voiceURI === voiceId && v.localService);
    if (!voice) {
      this.callbacks.onError('A voz local escolhida não está disponível neste aparelho.');
      return;
    }
    this.stop();
    this.active = true;
    const generation = ++this.generation;
    this.speakFrom(Math.max(0, fromToken), voice, rate, generation);
  }

  /** Para imediatamente; eventos atrasados da fala anterior são ignorados. */
  stop(): void {
    this.generation++;
    this.active = false;
    if (isSpeechSupported()) window.speechSynthesis.cancel();
  }

  private speakFrom(
    tokenIndex: number,
    voice: SpeechSynthesisVoice,
    rate: number,
    generation: number,
  ): void {
    const chunk = buildSpeechChunk(this.tokens, tokenIndex);
    if (!chunk) {
      this.active = false;
      this.callbacks.onEnd();
      return;
    }
    this.speakChunk(chunk, voice, rate, generation);
  }

  private speakChunk(
    chunk: SpeechChunk,
    voice: SpeechSynthesisVoice,
    rate: number,
    generation: number,
  ): void {
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = rate;

    const isCurrent = () => generation === this.generation;
    utterance.onstart = () => {
      if (isCurrent()) this.callbacks.onToken(chunk.startToken);
    };
    utterance.onboundary = (event) => {
      if (!isCurrent() || event.name !== 'word') return;
      this.callbacks.onToken(tokenIndexAtChar(chunk, event.charIndex));
    };
    utterance.onend = () => {
      if (!isCurrent()) return;
      this.speakFrom(chunk.endToken, voice, rate, generation);
    };
    utterance.onerror = (event) => {
      if (!isCurrent() || event.error === 'interrupted' || event.error === 'canceled') return;
      this.active = false;
      this.callbacks.onError(`A síntese de voz falhou (${event.error}).`);
    };
    window.speechSynthesis.speak(utterance);
  }
}
