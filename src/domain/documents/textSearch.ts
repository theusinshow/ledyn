import type { Token } from '@/domain/contracts';

/**
 * Busca no texto normalizado do documento, sem diferenciar maiúsculas nem acentos.
 * O texto "dobrado" tem o mesmo comprimento UTF-16 do original (1 unidade → 1 unidade),
 * então os offsets encontrados valem direto no conteúdo versionado e no cursor.
 */
export type SearchMatch = {
  tokenIndex: number;
  start: number;
  end: number;
  before: string;
  match: string;
  after: string;
};

const foldCache = new Map<string, string>();

function foldUnit(unit: string): string {
  const cached = foldCache.get(unit);
  if (cached !== undefined) return cached;
  const folded = unit.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  // Mantém 1:1: se a dobra mudar o comprimento (raro), usa o próprio caractere em minúscula.
  const result = folded.length === 1 ? folded : unit.toLowerCase().length === 1 ? unit.toLowerCase() : unit;
  foldCache.set(unit, result);
  return result;
}

/** Texto dobrado com o mesmo comprimento do original. */
export function foldForSearch(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) out += foldUnit(text[i]!);
  return out;
}

/** Índice do token que contém o offset, ou do próximo token depois dele. */
export function tokenIndexAtOffset(tokens: ReadonlyArray<Token>, offset: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  let answer = tokens.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid]!.end > offset) {
      answer = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return Math.max(0, answer);
}

export const MIN_QUERY_LENGTH = 2;

export function searchText(
  normalizedText: string,
  foldedText: string,
  tokens: ReadonlyArray<Token>,
  query: string,
  maxResults = 200,
  context = 48,
): { matches: SearchMatch[]; truncated: boolean } {
  const needle = foldForSearch(query.replace(/\s+/g, ' ').trim());
  if (needle.length < MIN_QUERY_LENGTH || tokens.length === 0) {
    return { matches: [], truncated: false };
  }
  const matches: SearchMatch[] = [];
  let from = 0;
  while (from <= foldedText.length) {
    const at = foldedText.indexOf(needle, from);
    if (at === -1) break;
    if (matches.length >= maxResults) return { matches, truncated: true };
    const end = at + needle.length;
    matches.push({
      tokenIndex: tokenIndexAtOffset(tokens, at),
      start: at,
      end,
      before: normalizedText.slice(Math.max(0, at - context), at).replace(/\s+/g, ' '),
      match: normalizedText.slice(at, end),
      after: normalizedText.slice(end, end + context).replace(/\s+/g, ' '),
    });
    from = end;
  }
  return { matches, truncated: false };
}
