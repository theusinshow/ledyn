import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Token } from '@/domain/contracts';
import {
  foldForSearch,
  MIN_QUERY_LENGTH,
  searchText,
} from '@/domain/documents/textSearch';

export interface SearchDialogProps {
  normalizedText: string;
  tokens: Token[];
  onSelect: (tokenIndex: number) => void;
  onClose: () => void;
}

/**
 * Busca dentro do documento (sem diferenciar acentos/maiúsculas). Escolher um
 * resultado posiciona o cursor pausado na palavra encontrada.
 */
export function SearchDialog({ normalizedText, tokens, onSelect, onClose }: SearchDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const folded = useMemo(() => foldForSearch(normalizedText), [normalizedText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 150);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  const result = useMemo(
    () => searchText(normalizedText, folded, tokens, debounced),
    [normalizedText, folded, tokens, debounced],
  );
  const tooShort = debounced.trim().length > 0 && debounced.trim().length < MIN_QUERY_LENGTH;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-background/70 px-4 pt-[12vh] backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar no documento"
        data-testid="search-dialog"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-border-strong bg-card shadow-[var(--shadow-panel)]"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            data-testid="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && result.matches[0]) {
                onSelect(result.matches[0].tokenIndex);
              }
            }}
            placeholder="Buscar palavra ou frase no documento…"
            aria-label="Buscar no documento"
            className="h-12 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-subtle-foreground"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar busca"
            className="rounded-md p-1.5 text-subtle-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-1.5">
          {debounced.trim().length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Ignora acentos e maiúsculas: “acao” encontra “ação”. Enter vai para o primeiro resultado.
            </p>
          ) : tooShort ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Digite pelo menos {MIN_QUERY_LENGTH} caracteres.</p>
          ) : result.matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground" data-testid="search-no-results">
              Nada encontrado para “{debounced.trim()}”.
            </p>
          ) : (
            <>
              <p className="px-3 py-1.5 font-mono text-[0.6875rem] text-subtle-foreground" data-testid="search-count">
                {result.matches.length}
                {result.truncated ? '+' : ''} {result.matches.length === 1 ? 'resultado' : 'resultados'}
                {result.truncated ? ' (mostrando os primeiros)' : ''}
              </p>
              <ol>
                {result.matches.map((m, i) => (
                  <li key={`${m.start}-${i}`}>
                    <button
                      type="button"
                      data-testid={`search-result-${i}`}
                      onClick={() => onSelect(m.tokenIndex)}
                      className="flex w-full cursor-pointer items-baseline gap-3 rounded-md px-3 py-2 text-left text-[0.8125rem] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <span className="w-14 shrink-0 font-mono text-[0.6875rem] tabular-nums text-subtle-foreground">
                        {Math.round((m.tokenIndex / Math.max(1, tokens.length)) * 100)}%
                      </span>
                      <span className="min-w-0 text-muted-foreground">
                        {m.before && <>…{m.before}</>}
                        <mark className="rounded-[3px] bg-primary/20 px-0.5 text-foreground">{m.match}</mark>
                        {m.after && <>{m.after}…</>}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
