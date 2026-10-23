import { describe, expect, it } from 'vitest';
import type { ContentBlock, Token } from '@/domain/contracts';
import {
  buildPdfPageIndex,
  estimateItemForFraction,
  locatePdfToken,
} from '@/domain/documents/pdfLocator';

// Dois blocos na página 1 e um na página 3 (página 2 sem texto extraído).
const blocks: ContentBlock[] = [
  { id: 'b0', index: 0, startOffset: 0, endOffset: 11, anchor: { kind: 'pdf', page: 1, itemStart: 0, itemEnd: 2 } },
  { id: 'b1', index: 1, startOffset: 13, endOffset: 23, anchor: { kind: 'pdf', page: 1, itemStart: 2, itemEnd: 4 } },
  { id: 'b2', index: 2, startOffset: 25, endOffset: 34, anchor: { kind: 'pdf', page: 3, itemStart: 0, itemEnd: 1 } },
];

function token(index: number, text: string, start: number, blockId: string): Token {
  return { index, text, start, end: start + text.length, blockId, boundary: 'none' };
}

const tokens: Token[] = [
  token(0, 'alfa', 0, 'b0'),
  token(1, 'beta', 5, 'b0'),
  token(2, 'gama', 13, 'b1'),
  token(3, 'delta', 18, 'b1'),
  token(4, 'epsilon', 25, 'b2'),
];

describe('Mapa do PDF — localização aproximada do token por bloco', () => {
  it('indexa páginas pelo maior número ancorado e o primeiro token de cada página com texto', () => {
    const index = buildPdfPageIndex(blocks, tokens);
    expect(index.pageCount).toBe(3);
    expect([...index.firstTokenByPage.entries()]).toEqual([
      [1, 0],
      [3, 4],
    ]);
  });

  it('localiza página, itens do bloco e fração do token dentro do bloco', () => {
    const index = buildPdfPageIndex(blocks, tokens);
    expect(locatePdfToken(index, tokens, 3)).toEqual({
      page: 1,
      blockId: 'b1',
      itemStart: 2,
      itemEnd: 4,
      fractionInBlock: 0.5,
    });
    expect(locatePdfToken(index, tokens, 4)?.page).toBe(3);
  });

  it('limita o cursor de fim (tokenCount) ao último token em vez de falhar', () => {
    const index = buildPdfPageIndex(blocks, tokens);
    expect(locatePdfToken(index, tokens, tokens.length)?.blockId).toBe('b2');
    expect(locatePdfToken(index, [], 0)).toBeNull();
  });

  it('retorna null para conteúdo sem âncora PDF (texto colado)', () => {
    const textBlocks: ContentBlock[] = [
      { id: 'b0', index: 0, startOffset: 0, endOffset: 10, anchor: { kind: 'text', originalStart: 0, originalEnd: 10 } },
    ];
    const index = buildPdfPageIndex(textBlocks, tokens.slice(0, 2));
    expect(index.pageCount).toBe(0);
    expect(locatePdfToken(index, tokens.slice(0, 2), 0)).toBeNull();
  });

  it('distribui a fração pelos comprimentos visíveis dos itens, ignorando itens vazios', () => {
    const items = ['Título', '   ', 'primeira linha', 'segunda linha', 'fora'];
    // Itens 0..4 do bloco: 6 + 14 + 13 = 33 caracteres visíveis.
    expect(estimateItemForFraction(items, 0, 4, 0)).toBe(0);
    expect(estimateItemForFraction(items, 0, 4, 0.3)).toBe(2);
    expect(estimateItemForFraction(items, 0, 4, 0.99)).toBe(3);
    expect(estimateItemForFraction(items, 1, 2, 0.5)).toBeNull();
    // Intervalo além do número de itens (versão diferente do extrator) não estoura.
    expect(estimateItemForFraction(items, 3, 50, 0.9)).toBe(4);
  });
});
