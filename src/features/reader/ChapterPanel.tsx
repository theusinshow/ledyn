import { useEffect, useRef } from 'react';
import { ListTree } from 'lucide-react';
import {
  chapterProgress,
  type ChapterEntry,
} from '@/domain/documents/chapters';
import { cn } from '@/shared/utils';

export interface ChapterPanelProps {
  chapters: ChapterEntry[];
  currentIndex: number;
  activeTokenIndex: number;
  /** Mensagem quando não há capítulos (ex.: PDF sem sumário) ou ainda carregando. */
  emptyMessage: string;
  onSelectChapter: (startTokenIndex: number) => void;
}

/** Sumário navegável com o capítulo atual e o progresso dentro de cada capítulo. */
export function ChapterPanel({
  chapters,
  currentIndex,
  activeTokenIndex,
  emptyMessage,
  onSelectChapter,
}: ChapterPanelProps) {
  const listRef = useRef<HTMLOListElement>(null);

  // Mantém o capítulo atual visível dentro da lista, sem rolar a página.
  useEffect(() => {
    const list = listRef.current;
    if (!list || currentIndex < 0) return;
    const item = list.querySelector<HTMLElement>(`[data-chapter-index="${currentIndex}"]`);
    if (!item) return;
    const top = item.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 3);
    }
  }, [currentIndex]);

  return (
    <section
      aria-label="Sumário do documento"
      data-testid="chapter-panel"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <ListTree className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="eyebrow !text-muted-foreground">Sumário</span>
        </div>
        {chapters.length > 0 && (
          <span
            className="font-mono text-[0.6875rem] tabular-nums text-muted-foreground"
            data-testid="chapter-position-label"
          >
            {currentIndex >= 0 ? currentIndex + 1 : '—'}
            <span className="text-subtle-foreground"> / {chapters.length}</span>
          </span>
        )}
      </header>

      {chapters.length === 0 ? (
        <p
          className="px-3.5 py-3 text-[0.75rem] leading-relaxed text-muted-foreground"
          data-testid="chapter-panel-empty"
        >
          {emptyMessage}
        </p>
      ) : (
        <ol
          ref={listRef}
          className="relative max-h-[18rem] overflow-y-auto p-1.5 2xl:max-h-[24rem]"
        >
          {chapters.map((chapter, i) => {
            const isCurrent = i === currentIndex;
            const progress = chapterProgress(chapter, activeTokenIndex);
            const isDone = activeTokenIndex >= chapter.endTokenIndex;
            return (
              <li key={chapter.id} data-chapter-index={i}>
                <button
                  type="button"
                  data-testid={`chapter-item-${i}`}
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => onSelectChapter(chapter.startTokenIndex)}
                  className={cn(
                    'group flex w-full cursor-pointer flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isCurrent ? 'bg-accent' : 'hover:bg-accent/60',
                  )}
                  style={{ paddingLeft: `${0.5 + chapter.depth * 0.75}rem` }}
                >
                  <span
                    className={cn(
                      'text-[0.78rem] leading-snug',
                      isCurrent
                        ? 'font-medium text-foreground'
                        : isDone
                          ? 'text-subtle-foreground'
                          : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  >
                    {chapter.title}
                  </span>
                  {(isCurrent || isDone) && (
                    <span aria-hidden="true" className="h-0.5 w-full overflow-hidden rounded-full bg-border-strong">
                      <span
                        className={cn('block h-full rounded-full', isDone ? 'bg-primary/40' : 'bg-primary')}
                        style={{ width: `${(isDone ? 1 : progress) * 100}%` }}
                      />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
