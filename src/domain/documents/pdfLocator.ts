import type { ContentBlock, Token } from '@/domain/contracts';

/**
 * Localização aproximada de um token no PDF original.
 *
 * A âncora persistida é por bloco (página + intervalo de itens de texto do PDF.js),
 * não por palavra. A posição dentro do bloco é estimada pela fração de caracteres,
 * por isso o mapa visual deve ser apresentado como aproximado (AGENTS.md §6).
 */
export type PdfTokenLocation = {
  page: number;
  blockId: string;
  itemStart: number;
  itemEnd: number;
  /** Fração [0, 1) da posição do token dentro do texto normalizado do bloco. */
  fractionInBlock: number;
};

export type PdfPageIndex = {
  pageCount: number;
  /** Primeiro token de cada página que tem texto extraído (página → tokenIndex). */
  firstTokenByPage: Map<number, number>;
  blockById: Map<string, ContentBlock>;
};

export function buildPdfPageIndex(
  blocks: ContentBlock[],
  tokens: Token[],
): PdfPageIndex {
  const blockById = new Map<string, ContentBlock>();
  let pageCount = 0;
  for (const block of blocks) {
    blockById.set(block.id, block);
    if (block.anchor.kind === 'pdf') {
      pageCount = Math.max(pageCount, block.anchor.page);
    }
  }

  const firstTokenByPage = new Map<number, number>();
  for (const token of tokens) {
    const block = blockById.get(token.blockId);
    if (block?.anchor.kind !== 'pdf') continue;
    if (!firstTokenByPage.has(block.anchor.page)) {
      firstTokenByPage.set(block.anchor.page, token.index);
    }
  }

  return { pageCount, firstTokenByPage, blockById };
}

export function locatePdfToken(
  index: PdfPageIndex,
  tokens: Token[],
  tokenIndex: number,
): PdfTokenLocation | null {
  if (tokens.length === 0) return null;
  const clamped = Math.min(Math.max(0, tokenIndex), tokens.length - 1);
  const token = tokens[clamped];
  if (!token) return null;
  const block = index.blockById.get(token.blockId);
  if (!block || block.anchor.kind !== 'pdf') return null;

  const span = block.endOffset - block.startOffset;
  const fractionInBlock =
    span > 0
      ? Math.min(0.999, Math.max(0, (token.start - block.startOffset) / span))
      : 0;

  return {
    page: block.anchor.page,
    blockId: block.id,
    itemStart: block.anchor.itemStart,
    itemEnd: block.anchor.itemEnd,
    fractionInBlock,
  };
}

/**
 * Escolhe o item de texto do PDF que provavelmente contém a posição informada,
 * distribuindo a fração pelos comprimentos visíveis dos itens do bloco.
 * Retorna o índice absoluto do item na página, ou `null` se não houver itens com texto.
 */
export function estimateItemForFraction(
  itemTexts: ReadonlyArray<string | undefined>,
  itemStart: number,
  itemEnd: number,
  fraction: number,
): number | null {
  const lengths: Array<{ index: number; length: number }> = [];
  let total = 0;
  const end = Math.min(itemEnd, itemTexts.length);
  for (let i = Math.max(0, itemStart); i < end; i++) {
    const length = (itemTexts[i] ?? '').trim().length;
    if (length === 0) continue;
    lengths.push({ index: i, length });
    total += length;
  }
  if (lengths.length === 0) return null;

  const target = Math.min(Math.max(0, fraction), 0.999) * total;
  let acc = 0;
  for (const entry of lengths) {
    acc += entry.length;
    if (target < acc) return entry.index;
  }
  return lengths[lengths.length - 1]!.index;
}
