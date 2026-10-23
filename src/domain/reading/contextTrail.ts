import type { Token } from '@/domain/contracts';

const MAX_LOOKBACK_TOKENS = 200;

function sentenceStartBefore(tokens: ReadonlyArray<Token>, index: number, limit: number): number {
  for (let i = index - 1; i >= limit; i--) {
    const b = tokens[i]!.boundary;
    if (b === 'sentence' || b === 'paragraph') return i + 1;
  }
  return limit;
}

/**
 * Trilha de contexto do RSVP: o que acabou de ser lido (frase anterior + início da
 * frase atual até o token exibido), recortado pelo fim para caber numa linha.
 * Percorre no máximo 200 tokens para trás: custo constante mesmo em livros longos.
 */
export function buildContextTrail(
  tokens: ReadonlyArray<Token>,
  tokenIndex: number,
  maxChars = 140,
): string {
  const end = Math.min(tokenIndex, tokens.length);
  if (end <= 0) return '';
  const limit = Math.max(0, end - MAX_LOOKBACK_TOKENS);
  const currentStart = sentenceStartBefore(tokens, end, limit);
  const start = currentStart > limit ? sentenceStartBefore(tokens, currentStart - 1, limit) : limit;
  const text = tokens
    .slice(start, end)
    .map((t) => t.text)
    .join(' ');
  if (text.length <= maxChars) return text;
  const cut = text.slice(text.length - maxChars);
  const firstSpace = cut.indexOf(' ');
  return `…${firstSpace >= 0 ? cut.slice(firstSpace + 1) : cut}`;
}
