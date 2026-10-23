import { describe, expect, it } from 'vitest';
import { normalizeText } from '@/domain/documents/normalizer';
import {
  foldForSearch,
  searchText,
  tokenIndexAtOffset,
} from '@/domain/documents/textSearch';
import { tokenizeNormalizedText } from '@/domain/documents/tokenizer';

function prepare(raw: string) {
  const norm = normalizeText(raw);
  const { tokens } = tokenizeNormalizedText(norm.normalizedText, norm.blocks);
  return { text: norm.normalizedText, folded: foldForSearch(norm.normalizedText), tokens };
}

describe('Busca no livro', () => {
  it('dobra acentos e maiúsculas mantendo o comprimento do texto', () => {
    const text = 'Ação, Coração e PÃO.';
    const folded = foldForSearch(text);
    expect(folded).toBe('acao, coracao e pao.');
    expect(folded.length).toBe(text.length);
  });

  it('encontra sem diferenciar acentos/maiúsculas e aponta o token exato', () => {
    const { text, folded, tokens } = prepare('A atenção sustentada exige prática.\n\nPrática diária mantém a ATENCAO viva.');
    const { matches, truncated } = searchText(text, folded, tokens, 'atencao');
    expect(truncated).toBe(false);
    expect(matches.map((m) => m.match)).toEqual(['atenção', 'ATENCAO']);
    expect(tokens[matches[0]!.tokenIndex]!.text).toBe('atenção');
    expect(tokens[matches[1]!.tokenIndex]!.text).toBe('ATENCAO');
    expect(matches[0]!.before.endsWith('A ')).toBe(true);
  });

  it('busca frases com espaços, ignora consultas curtas e limita os resultados', () => {
    const { text, folded, tokens } = prepare('um dois três um dois três um dois três');
    expect(searchText(text, folded, tokens, 'dois  tres').matches).toHaveLength(3);
    expect(searchText(text, folded, tokens, 'u').matches).toHaveLength(0);
    const limited = searchText(text, folded, tokens, 'um', 2);
    expect(limited.matches).toHaveLength(2);
    expect(limited.truncated).toBe(true);
  });

  it('acha o token pelo offset com busca binária', () => {
    const { tokens } = prepare('alfa beta gama');
    expect(tokenIndexAtOffset(tokens, 0)).toBe(0);
    expect(tokenIndexAtOffset(tokens, 6)).toBe(1);
    expect(tokenIndexAtOffset(tokens, 4)).toBe(1); // espaço → próximo token
    expect(tokenIndexAtOffset(tokens, 999)).toBe(2);
  });
});
