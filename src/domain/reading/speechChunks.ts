import type { Token } from '@/domain/contracts';

/**
 * Trecho entregue de uma vez à síntese de voz: normalmente uma frase.
 * Frases curtas evitam o corte de falas longas em alguns navegadores e deixam
 * parar/retomar responsivo. `tokenCharStarts[i]` é o offset (no `text`) do token
 * `startToken + i`, usado para mapear os eventos de fronteira de palavra de volta ao cursor.
 */
export type SpeechChunk = {
  startToken: number;
  endToken: number;
  text: string;
  tokenCharStarts: number[];
};

export const DEFAULT_MAX_CHUNK_CHARS = 280;

/**
 * Monta o trecho que começa em `start`: vai até o fim da frase/parágrafo, ou corta
 * na última vírgula (ou palavra) antes de `maxChars` quando a frase é muito longa.
 */
export function buildSpeechChunk(
  tokens: ReadonlyArray<Token>,
  start: number,
  maxChars = DEFAULT_MAX_CHUNK_CHARS,
): SpeechChunk | null {
  if (start < 0 || start >= tokens.length) return null;
  const tokenCharStarts: number[] = [];
  let text = '';
  let end = start;
  let lastClauseEnd = -1;

  for (let i = start; i < tokens.length; i++) {
    const token = tokens[i]!;
    const prefix = text.length === 0 ? '' : ' ';
    if (text.length > 0 && text.length + prefix.length + token.text.length > maxChars) {
      if (lastClauseEnd > start) {
        end = lastClauseEnd;
        const cut = tokenCharStarts[end - start]!;
        text = text.slice(0, cut - 1);
        tokenCharStarts.length = end - start;
      }
      break;
    }
    tokenCharStarts.push(text.length + prefix.length);
    text += prefix + token.text;
    end = i + 1;
    if (token.boundary === 'sentence' || token.boundary === 'paragraph') break;
    if (token.boundary === 'clause') lastClauseEnd = i + 1;
  }

  return { startToken: start, endToken: end, text, tokenCharStarts };
}

/** Token falado para um `charIndex` do evento de fronteira (busca binária). */
export function tokenIndexAtChar(chunk: SpeechChunk, charIndex: number): number {
  const starts = chunk.tokenCharStarts;
  let lo = 0;
  let hi = starts.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid]! <= charIndex) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return chunk.startToken + found;
}
