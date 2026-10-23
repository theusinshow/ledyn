import { describe, expect, it } from 'vitest';
import type { ContentBlock, Token } from '@/domain/contracts';
import {
  chapterProgress,
  chaptersFromEpubBlocks,
  chaptersFromPdfOutline,
  finalizeChapters,
  findCurrentChapterIndex,
  firstTokenAtOrAfterPage,
} from '@/domain/documents/chapters';
import { buildPdfPageIndex } from '@/domain/documents/pdfLocator';

function tok(index: number, blockId: string): Token {
  return { index, text: `w${index}`, start: index * 3, end: index * 3 + 2, blockId, boundary: 'none' };
}

describe('Capítulos derivados do conteúdo', () => {
  it('calcula o fim de cada capítulo pelo próximo de mesmo nível ou superior', () => {
    const chapters = finalizeChapters(
      [
        { title: 'Parte I', depth: 0, startTokenIndex: 0 },
        { title: '1.1', depth: 1, startTokenIndex: 10 },
        { title: '1.2', depth: 1, startTokenIndex: 30 },
        { title: 'Parte II', depth: 0, startTokenIndex: 50 },
      ],
      100,
    );
    expect(chapters.map((c) => [c.title, c.startTokenIndex, c.endTokenIndex])).toEqual([
      ['Parte I', 0, 50],
      ['1.1', 10, 30],
      ['1.2', 30, 50],
      ['Parte II', 50, 100],
    ]);
  });

  it('descarta entradas fora do texto, sem título e duplicadas; ordena por posição', () => {
    const chapters = finalizeChapters(
      [
        { title: 'B', depth: 0, startTokenIndex: 20 },
        { title: 'A', depth: 0, startTokenIndex: 0 },
        { title: 'A', depth: 0, startTokenIndex: 0 },
        { title: '   ', depth: 0, startTokenIndex: 5 },
        { title: 'Fora', depth: 0, startTokenIndex: 500 },
      ],
      40,
    );
    expect(chapters.map((c) => c.title)).toEqual(['A', 'B']);
  });

  it('encontra o capítulo mais específico atual e o progresso dentro dele', () => {
    const chapters = finalizeChapters(
      [
        { title: 'Parte I', depth: 0, startTokenIndex: 5 },
        { title: '1.1', depth: 1, startTokenIndex: 10 },
      ],
      30,
    );
    expect(findCurrentChapterIndex(chapters, 0)).toBe(-1); // antes do primeiro
    expect(findCurrentChapterIndex(chapters, 7)).toBe(0);
    expect(findCurrentChapterIndex(chapters, 12)).toBe(1);
    expect(chapterProgress(chapters[1]!, 20)).toBeCloseTo(0.5);
    expect(chapterProgress(chapters[1]!, 99)).toBe(1);
  });

  it('EPUB: um capítulo por item do spine; primeira linha curta vira o título', () => {
    const text = 'Introdução\n\nCorpo do capítulo um.\n\nUm parágrafo de abertura bem mais longo do que sessenta caracteres no total';
    const blocks: ContentBlock[] = [
      { id: 'b0', index: 0, startOffset: 0, endOffset: 10, anchor: { kind: 'epub', spineIndex: 0, href: 'c1.xhtml', blockPath: 'p[0]' } },
      { id: 'b1', index: 1, startOffset: 12, endOffset: 33, anchor: { kind: 'epub', spineIndex: 0, href: 'c1.xhtml', blockPath: 'p[1]' } },
      { id: 'b2', index: 2, startOffset: 35, endOffset: text.length, anchor: { kind: 'epub', spineIndex: 2, href: 'c3.xhtml', blockPath: 'p[0]' } },
    ];
    const tokens = [tok(0, 'b0'), tok(1, 'b1'), tok(2, 'b1'), tok(3, 'b2'), tok(4, 'b2')];
    const chapters = chaptersFromEpubBlocks(blocks, tokens, text);
    expect(chapters.map((c) => [c.title, c.startTokenIndex, c.endTokenIndex])).toEqual([
      ['Introdução', 0, 3],
      ['Capítulo 2', 3, 5],
    ]);
  });

  it('PDF: mapeia o sumário para o primeiro token da página (ou da próxima com texto)', () => {
    const blocks: ContentBlock[] = [
      { id: 'p1', index: 0, startOffset: 0, endOffset: 5, anchor: { kind: 'pdf', page: 1, itemStart: 0, itemEnd: 1 } },
      { id: 'p3', index: 1, startOffset: 6, endOffset: 11, anchor: { kind: 'pdf', page: 3, itemStart: 0, itemEnd: 1 } },
    ];
    const tokens = [tok(0, 'p1'), tok(1, 'p1'), tok(2, 'p3'), tok(3, 'p3')];
    const pageIndex = buildPdfPageIndex(blocks, tokens);
    expect(firstTokenAtOrAfterPage(pageIndex, 2)).toBe(2); // página 2 sem texto → página 3
    expect(firstTokenAtOrAfterPage(pageIndex, 9)).toBeNull();

    const chapters = chaptersFromPdfOutline(
      [
        { title: 'Começo', depth: 0, page: 1 },
        { title: 'Figura (sem texto)', depth: 0, page: 2 },
        { title: 'Destino quebrado', depth: 0, page: null },
      ],
      pageIndex,
      tokens.length,
    );
    expect(chapters.map((c) => [c.title, c.startTokenIndex])).toEqual([
      ['Começo', 0],
      ['Figura (sem texto)', 2],
    ]);
  });
});
