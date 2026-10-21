import type { CoverageRange, TokenBoundary } from '@/domain/contracts';

export const BOUNDARY_MULTIPLIERS: Record<TokenBoundary, number> = {
  none: 1.0,
  clause: 1.5,
  sentence: 2.0,
  paragraph: 2.5,
};

/**
 * Calcula a duração de apresentação de um token em milissegundos.
 * Duração-base = 60.000 / PPM.
 * Aplica apenas o maior multiplicador correspondente ao boundary, sem somar.
 */
export function calculateTokenDurationMs(
  boundary: TokenBoundary,
  wpm: number,
  punctuationPauseEnabled: boolean,
): number {
  const baseDurationMs = 60_000 / wpm;
  if (!punctuationPauseEnabled) {
    return baseDurationMs;
  }
  const multiplier = BOUNDARY_MULTIPLIERS[boundary] ?? 1.0;
  return baseDurationMs * multiplier;
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
