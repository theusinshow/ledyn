import { useState } from 'react';
import { Bookmark, Download, Trash2 } from 'lucide-react';
import type { BookmarkRecord } from '@/domain/contracts';
import { bookmarksToMarkdown } from '@/domain/documents/bookmarksExport';
import { cn } from '@/shared/utils';

export interface BookmarksPanelProps {
  bookmarks: BookmarkRecord[];
  tokenCount: number;
  activeTokenIndex: number;
  documentTitle: string;
  onAdd: () => void;
  onSelect: (tokenIndex: number) => void;
  onSaveNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
}

/** Marcadores do documento: criar (M), ir até, anotar, remover e exportar em Markdown. */
export function BookmarksPanel({
  bookmarks,
  tokenCount,
  activeTokenIndex,
  documentTitle,
  onAdd,
  onSelect,
  onSaveNote,
  onDelete,
}: BookmarksPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const exportMarkdown = () => {
    const md = bookmarksToMarkdown(documentTitle, bookmarks, tokenCount);
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentTitle.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'documento'} - marcadores.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <section
      aria-label="Marcadores"
      data-testid="bookmarks-panel"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2">
        <div className="flex items-center gap-2">
          <Bookmark className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="eyebrow !text-muted-foreground">Marcadores</span>
          {bookmarks.length > 0 && (
            <span className="font-mono text-[0.6875rem] text-subtle-foreground" data-testid="bookmarks-count">
              {bookmarks.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {bookmarks.length > 0 && (
            <button
              type="button"
              onClick={exportMarkdown}
              data-testid="bookmarks-export-btn"
              title="Exportar marcadores em Markdown"
              className="rounded-md p-1.5 text-subtle-foreground hover:bg-accent hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Exportar marcadores</span>
            </button>
          )}
          <button
            type="button"
            onClick={onAdd}
            data-testid="bookmark-add-btn"
            title="Marcar a posição atual (M)"
            className="rounded-md px-2 py-1 text-[0.75rem] font-medium text-primary hover:bg-primary/10"
          >
            + Marcar
          </button>
        </div>
      </header>

      {bookmarks.length === 0 ? (
        <p className="px-3.5 py-3 text-[0.75rem] leading-relaxed text-muted-foreground">
          Nenhum marcador. Use <kbd className="kbd">M</kbd> durante a leitura para marcar o trecho atual.
        </p>
      ) : (
        <ol className="max-h-[16rem] overflow-y-auto p-1.5">
          {bookmarks.map((bm) => {
            const isHere = bm.tokenIndex === activeTokenIndex;
            const isEditing = editingId === bm.id;
            return (
              <li
                key={bm.id}
                data-testid={`bookmark-item-${bm.tokenIndex}`}
                className={cn('group rounded-md px-2 py-1.5', isHere ? 'bg-accent' : 'hover:bg-accent/60')}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => onSelect(bm.tokenIndex)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    data-testid={`bookmark-go-${bm.tokenIndex}`}
                  >
                    <span className="block font-mono text-[0.625rem] tabular-nums text-subtle-foreground">
                      {Math.round((bm.tokenIndex / Math.max(1, tokenCount)) * 100)}% · palavra {bm.tokenIndex + 1}
                    </span>
                    <span className="line-clamp-2 text-[0.75rem] leading-snug text-muted-foreground">{bm.excerpt}</span>
                    {bm.note && !isEditing && (
                      <span className="mt-0.5 block text-[0.75rem] leading-snug text-foreground" data-testid={`bookmark-note-${bm.tokenIndex}`}>
                        {bm.note}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(bm.id)}
                    aria-label="Remover marcador"
                    data-testid={`bookmark-delete-${bm.tokenIndex}`}
                    className="rounded p-1 text-subtle-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isEditing ? (
                  <div className="mt-1.5 space-y-1.5">
                    <textarea
                      autoFocus
                      value={draft}
                      maxLength={2_000}
                      onChange={(e) => setDraft(e.target.value)}
                      aria-label="Nota do marcador"
                      data-testid={`bookmark-note-input-${bm.tokenIndex}`}
                      className="min-h-16 w-full rounded-md border border-input bg-surface-sunken px-2 py-1.5 text-[0.75rem] outline-none focus:border-primary/60"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => setEditingId(null)} className="rounded px-2 py-0.5 text-[0.6875rem] text-muted-foreground hover:bg-accent">
                        Cancelar
                      </button>
                      <button
                        type="button"
                        data-testid={`bookmark-note-save-${bm.tokenIndex}`}
                        onClick={() => {
                          onSaveNote(bm.id, draft);
                          setEditingId(null);
                        }}
                        className="rounded bg-primary px-2 py-0.5 text-[0.6875rem] font-medium text-primary-foreground"
                      >
                        Salvar nota
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(bm.id);
                      setDraft(bm.note);
                    }}
                    data-testid={`bookmark-note-edit-${bm.tokenIndex}`}
                    className="mt-0.5 text-[0.6875rem] text-subtle-foreground hover:text-foreground"
                  >
                    {bm.note ? 'Editar nota' : '+ Nota'}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
