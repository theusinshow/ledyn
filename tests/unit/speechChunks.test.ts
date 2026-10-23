import { describe, expect, it } from 'vitest';
import type { Token, TokenBoundary } from '@/domain/contracts';
import { buildSpeechChunk, tokenIndexAtChar } from '@/domain/reading/speechChunks';

function makeTokens(spec: Array<[string, TokenBoundary]>): Token[] {
  let offset = 0;
  return spec.map(([text, boundary], index) => {
    const t: Token = { index, text, start: offset, end: offset + text.length, blockId: 'b', boundary };
    offset += text.length + 1;
    return t;
  });
}

const tokens = makeTokens([
  ['Leitura', 'none'], ['com', 'none'], ['voz.', 'sentence'],
  ['Outra', 'none'], ['frase,', 'clause'], ['mais', 'none'], ['longa.', 'paragraph'],
]);

describe('Trechos para leitura em voz alta', () => {
  it('fala uma frase por vez e guarda o offset de cada palavra', () => {
    const first = buildSpeechChunk(tokens, 0)!;
    expect(first).toEqual({ startToken: 0, endToken: 3, text: 'Leitura com voz.', tokenCharStarts: [0, 8, 12] });
    const second = buildSpeechChunk(tokens, first.endToken)!;
    expect(second.text).toBe('Outra frase, mais longa.');
    expect(second.endToken).toBe(7);
    expect(buildSpeechChunk(tokens, 7)).toBeNull();
  });

  it('pode começar no meio de uma frase (retomar da palavra atual)', () => {
    expect(buildSpeechChunk(tokens, 1)!.text).toBe('com voz.');
  });

  it('frase muito longa é cortada na última vírgula antes do limite', () => {
    const chunk = buildSpeechChunk(tokens, 3, 18)!;
    expect(chunk.text).toBe('Outra frase,');
    expect(chunk.endToken).toBe(5);
    expect(chunk.tokenCharStarts).toEqual([0, 6]);
  });

  it('sem vírgula, corta na última palavra que cabe', () => {
    const long = makeTokens(Array.from({ length: 20 }, (): [string, TokenBoundary] => ['palavra', 'none']));
    const chunk = buildSpeechChunk(long, 0, 30)!;
    expect(chunk.text.length).toBeLessThanOrEqual(30);
    expect(chunk.endToken).toBe(3);
  });

  it('mapeia o charIndex do evento de voz para o token falado', () => {
    const chunk = buildSpeechChunk(tokens, 3)!; // "Outra frase, mais longa."
    expect(tokenIndexAtChar(chunk, 0)).toBe(3);
    expect(tokenIndexAtChar(chunk, 6)).toBe(4);
    expect(tokenIndexAtChar(chunk, 9)).toBe(4); // dentro de "frase,"
    expect(tokenIndexAtChar(chunk, 13)).toBe(5);
    expect(tokenIndexAtChar(chunk, 999)).toBe(6);
  });
});
