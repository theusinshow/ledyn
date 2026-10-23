import type { BookmarkRecord } from '@/domain/contracts';

/** Monta o Markdown exportado com trecho e nota de cada marcador. */
export function bookmarksToMarkdown(
  title: string,
  bookmarks: ReadonlyArray<BookmarkRecord>,
  tokenCount: number,
): string {
  const lines = [`# Marcadores — ${title}`, ''];
  for (const bm of bookmarks) {
    const pct = Math.round((bm.tokenIndex / Math.max(1, tokenCount)) * 100);
    lines.push(`## Palavra ${bm.tokenIndex + 1} (${pct}%)`, '', `> ${bm.excerpt}`, '');
    if (bm.note.trim()) lines.push(bm.note.trim(), '');
  }
  return lines.join('\n');
}
