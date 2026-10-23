import type { CoverageRange, TokenBoundary } from '@/domain/contracts';

export const BOUNDARY_MULTIPLIERS: Record<TokenBoundary, number> = {
  none: 1.0,
  clause: 1.5,
  sentence: 2.0,
  paragraph: 2.5,
};

/**
 * Pausa mínima absoluta (ms) somada após a palavra em cada fronteira.
 * Evita que a pausa de pontuação encolha em velocidades altas: a pesquisa com RSVP
 * (Masson, 1983) mostrou compreensão equivalente à página com ~500 ms no fim da frase.
 */
export const BOUNDARY_MIN_PAUSE_MS: Record<TokenBoundary, number> = {
  none: 0,
  clause: 150,
  sentence: 500,
  paragraph: 750,
};

/** Rampa ao iniciar/retomar: as primeiras exposições ficam mais lentas. */
export const RESUME_RAMP_FACTORS: readonly number[] = [1.6, 1.4, 1.2, 1.1];

/**
 * Fator de tempo por comprimento da palavra (letras/dígitos, sem pontuação).
 * Palavras longas e números recebem mais tempo de reconhecimento.
 */
export function wordLengthFactor(text: string): number {
  const core = Array.from(text).filter((c) => /[\p{L}\p{N}]/u.test(c));
  if (core.some((c) => /\p{N}/u.test(c))) return 1.3;
  if (core.length >= 12) return 1.3;
  if (core.length >= 8) return 1.15;
  return 1.0;
}

export interface PacingInput {
  boundary: TokenBoundary;
  text: string;
}

/**
 * Calcula a duração de apresentação de um token em milissegundos.
 *
 * - Ritmo inteligente desligado: exatamente 60.000 / PPM (relógio determinístico do AC-06).
 * - Ritmo inteligente ligado:
 *   palavra = base × fator de comprimento × fator de rampa;
 *   pausa   = maior entre base × (multiplicador − 1) e a pausa mínima da fronteira.
 *   Multiplicadores não se somam: vale apenas a fronteira mais forte do token.
 */
export function calculateTokenDurationMs(
  token: PacingInput,
  wpm: number,
  smartPacingEnabled: boolean,
  rampFactor = 1,
): number {
  const baseDurationMs = 60_000 / wpm;
  if (!smartPacingEnabled) {
    return baseDurationMs;
  }
  const multiplier = BOUNDARY_MULTIPLIERS[token.boundary] ?? 1.0;
  const wordMs = baseDurationMs * wordLengthFactor(token.text) * rampFactor;
  const pauseMs = Math.max(
    baseDurationMs * (multiplier - 1),
    BOUNDARY_MIN_PAUSE_MS[token.boundary] ?? 0,
  );
  // Arredonda a microssegundos para evitar resíduos de ponto flutuante no relógio.
  return Math.round((wordMs + pauseMs) * 1000) / 1000;
}

/**
 * Índice do primeiro token da frase que contém `tokenIndex`
 * (logo após o último fim de frase/parágrafo), limitado a `maxBack` tokens de recuo.
 */
export function findSentenceStartIndex(
  boundaries: ReadonlyArray<TokenBoundary>,
  tokenIndex: number,
  maxBack = 25,
): number {
  const limit = Math.max(0, tokenIndex - maxBack);
  for (let i = tokenIndex - 1; i >= limit; i--) {
    const b = boundaries[i];
    if (b === 'sentence' || b === 'paragraph') return i + 1;
  }
  return limit;
}

/**
 * Insere e funde um intervalo [start, end) na lista de cobertura ordenada.
 */
export function mergeCoverageRange(
  existingRanges: CoverageRange[],
  newRange: CoverageRange,
): CoverageRange[] {
  const [newStart, newEnd] = newRange;
  if (newEnd <= newStart) {
    return [...existingRanges];
  }

  const all: CoverageRange[] = [...existingRanges.map((r): CoverageRange => [r[0], r[1]]), [newStart, newEnd]];
  all.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: CoverageRange[] = [];
  for (const current of all) {
    if (merged.length === 0) {
      merged.push([current[0], current[1]]);
      continue;
    }
    const last = merged[merged.length - 1]!;
    if (current[0] <= last[1]) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push([current[0], current[1]]);
    }
  }

  return merged;
}

/**
 * Conta a quantidade de tokens únicos cobertos pela união dos intervalos.
 */
export function countUniqueCoveredTokens(ranges: CoverageRange[]): number {
  let total = 0;
  for (const [start, end] of ranges) {
    if (end > start) {
      total += end - start;
    }
  }
  return total;
}

/**
 * Calcula a PPM observada (apresentações concluídas × 60.000 / activeMs).
 * Retorna null quando activeMs <= 0 para exibir "—" na interface.
 */
export function calculateObservedWpm(
  presentedCount: number,
  activeMs: number,
): number | null {
  if (activeMs <= 0 || presentedCount <= 0) {
    return activeMs <= 0 ? null : 0;
  }
  return Math.round((presentedCount * 60_000) / activeMs);
}

export function formatObservedWpm(presentedCount: number, activeMs: number): string {
  const observed = calculateObservedWpm(presentedCount, activeMs);
  if (observed === null) {
    return '—';
  }
  return `${observed} PPM`;
}

export function calculateProgressPercent(cursorIndex: number, tokenCount: number): number {
  if (tokenCount <= 0) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(tokenCount, cursorIndex));
  return Math.round((clamped / tokenCount) * 100);
}
