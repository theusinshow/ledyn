import type { ContentBlock, Token } from '@/domain/contracts';
import type { PdfPageIndex } from '@/domain/documents/pdfLocator';

/**
 * Capítulos derivados do conteúdo já versionado (sem retokenizar nem gravar nada):
 * - EPUB: um capítulo por item do spine, como na prévia da importação;
 * - PDF: sumário (outline) do arquivo original, mapeado para o primeiro token da página.
 */
export type ChapterEntry = {
  id: string;
  title: string;
  depth: number;
  startTokenIndex: number;
  /** Fim exclusivo: início do próximo capítulo de mesmo nível ou superior. */
  endTokenIndex: number;
};

export type ChapterStart = {
  title: string;
  depth: number;
  startTokenIndex: number;
};

const MAX_TITLE_LENGTH = 90;

function cleanTitle(title: string): string {
  const compact = title.replace(/\s+/g, ' ').trim();
  return compact.length > MAX_TITLE_LENGTH
    ? `${compact.slice(0, MAX_TITLE_LENGTH - 1)}…`
    : compact;
}

/** Ordena, remove duplicatas exatas e calcula o fim de cada capítulo. */
export function finalizeChapters(
  starts: ReadonlyArray<ChapterStart>,
  tokenCount: number,
): ChapterEntry[] {
  const valid = starts
    .filter(
      (s) => s.startTokenIndex >= 0 && s.startTokenIndex < tokenCount && s.title.trim(),
    )
    .map((s, order) => ({ ...s, order }))
    .sort((a, b) => a.startTokenIndex - b.startTokenIndex || a.order - b.order);

  const deduped: typeof valid = [];
  for (const s of valid) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.startTokenIndex === s.startTokenIndex && prev.title === s.title) continue;
    deduped.push(s);
  }

  return deduped.map((s, i) => {
    let end = tokenCount;
    for (let j = i + 1; j < deduped.length; j++) {
      const next = deduped[j]!;
      if (next.depth <= s.depth && next.startTokenIndex > s.startTokenIndex) {
        end = next.startTokenIndex;
        break;
      }
    }
    return {
      id: `chapter-${i}`,
      title: cleanTitle(s.title),
      depth: s.depth,
      startTokenIndex: s.startTokenIndex,
      endTokenIndex: end,
    };
  });
}

function firstTokenByBlock(tokens: ReadonlyArray<Token>): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) {
    if (!map.has(token.blockId)) map.set(token.blockId, token.index);
  }
  return map;
}

/**
 * Capítulos de EPUB: primeiro bloco de cada item do spine. A primeira linha curta
 * (normalmente o título do capítulo) vira o rótulo; senão, "Capítulo N".
 */
export function chaptersFromEpubBlocks(
  blocks: ReadonlyArray<ContentBlock>,
  tokens: ReadonlyArray<Token>,
  normalizedText: string,
): ChapterEntry[] {
  const tokenByBlock = firstTokenByBlock(tokens);
  const starts: ChapterStart[] = [];
  let lastSpine: number | null = null;
  for (const block of blocks) {
    if (block.anchor.kind !== 'epub') continue;
    if (block.anchor.spineIndex === lastSpine) continue;
    lastSpine = block.anchor.spineIndex;
    const start = tokenByBlock.get(block.id);
    if (start === undefined) continue;
    const firstLine = normalizedText.slice(block.startOffset, block.endOffset).trim();
    const number = starts.length + 1;
    starts.push({
      title:
        firstLine.length > 0 && firstLine.length <= 60
          ? firstLine
          : `Capítulo ${number}`,
      depth: 0,
      startTokenIndex: start,
    });
  }
  return finalizeChapters(starts, tokens.length);
}

export type PdfOutlineItem = {
  title: string;
  depth: number;
  /** Página 1-based de destino, ou null quando o destino não pôde ser resolvido. */
  page: number | null;
};

/** Primeiro token da página informada ou da próxima página que tenha texto. */
export function firstTokenAtOrAfterPage(
  index: PdfPageIndex,
  page: number,
): number | null {
  for (let p = Math.max(1, page); p <= index.pageCount; p++) {
    const token = index.firstTokenByPage.get(p);
    if (token !== undefined) return token;
  }
  return null;
}

/** Capítulos de PDF a partir do sumário (outline) do arquivo original. */
export function chaptersFromPdfOutline(
  outline: ReadonlyArray<PdfOutlineItem>,
  pageIndex: PdfPageIndex,
  tokenCount: number,
): ChapterEntry[] {
  const starts: ChapterStart[] = [];
  for (const item of outline) {
    if (item.page === null) continue;
    const start = firstTokenAtOrAfterPage(pageIndex, item.page);
    if (start === null) continue;
    starts.push({ title: item.title, depth: item.depth, startTokenIndex: start });
  }
  return finalizeChapters(starts, tokenCount);
}

/** Índice do capítulo mais específico que contém o token (ou -1 antes do primeiro). */
export function findCurrentChapterIndex(
  chapters: ReadonlyArray<ChapterEntry>,
  tokenIndex: number,
): number {
  let current = -1;
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]!;
    if (ch.startTokenIndex > tokenIndex) break;
    if (tokenIndex < ch.endTokenIndex) current = i;
  }
  return current;
}

/** Posição do cursor dentro do capítulo, de 0 a 1. */
export function chapterProgress(chapter: ChapterEntry, tokenIndex: number): number {
  const span = chapter.endTokenIndex - chapter.startTokenIndex;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (tokenIndex - chapter.startTokenIndex) / span));
}
