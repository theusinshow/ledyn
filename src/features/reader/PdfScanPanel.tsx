import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Crosshair, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ContentBlock, Token } from '@/domain/contracts';
import {
  buildPdfPageIndex,
  estimateItemForFraction,
  locatePdfToken,
} from '@/domain/documents/pdfLocator';
import { firstTokenAtOrAfterPage } from '@/domain/documents/chapters';
import type { PdfRendererState } from '@/features/reader/usePdfRenderer';
import {
  unionRects,
  type NormalizedRect,
  type PdfPageTextItemBox,
} from '@/infrastructure/pdf/pdfPageRenderer';
import { cn } from '@/shared/utils';

export interface PdfScanPanelProps {
  /** PDF original aberto pelo leitor (compartilhado com o sumário). */
  pdf: PdfRendererState;
  tokens: Token[];
  blocks: ContentBlock[];
  activeTokenIndex: number;
  isPlaying: boolean;
  reducedMotion: boolean;
  onSeekToToken: (tokenIndex: number) => void;
}

/**
 * Mapa visual do PDF original: miniatura da página (com imagens) desenhada localmente
 * e a região aproximada do trecho em leitura, derivada da âncora por bloco.
 */
export function PdfScanPanel({
  pdf: load,
  tokens,
  blocks,
  activeTokenIndex,
  isPlaying,
  reducedMotion,
  onSeekToToken,
}: PdfScanPanelProps) {
  const [browsePage, setBrowsePage] = useState<number | null>(null);
  const [cssWidth, setCssWidth] = useState(0);
  const [aspect, setAspect] = useState<number>(1 / Math.SQRT2);
  const [pageItems, setPageItems] = useState<{
    page: number;
    items: PdfPageTextItemBox[];
  } | null>(null);
  const [renderedPage, setRenderedPage] = useState<number | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pageIndex = useMemo(
    () => buildPdfPageIndex(blocks, tokens),
    [blocks, tokens],
  );
  const location = useMemo(
    () => locatePdfToken(pageIndex, tokens, activeTokenIndex),
    [pageIndex, tokens, activeTokenIndex],
  );

  const renderer = load.status === 'ready' ? load.renderer : null;
  const pageCount = renderer?.pageCount ?? pageIndex.pageCount;
  const cursorPage = location?.page ?? 1;
  const viewPage = browsePage ?? cursorPage;
  const isBrowsing = browsePage !== null && browsePage !== cursorPage;

  // Ao iniciar a reprodução, o mapa volta a acompanhar o cursor.
  const [prevIsPlaying, setPrevIsPlaying] = useState(isPlaying);
  if (prevIsPlaying !== isPlaying) {
    setPrevIsPlaying(isPlaying);
    if (isPlaying) setBrowsePage(null);
  }

  // Largura disponível, em degraus para evitar re-render a cada pixel.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setCssWidth(Math.round(width / 40) * 40);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [load.status]);

  // Desenha a página visível.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!renderer || !canvas || cssWidth <= 0) return;
    let cancelled = false;
    const job = renderer.renderToCanvas(viewPage, canvas, cssWidth);
    job.done
      .then(() => {
        if (cancelled || canvas.width === 0) return;
        setAspect(canvas.width / canvas.height);
        setRenderedPage(viewPage);
      })
      .catch(() => {
        if (!cancelled) setRenderedPage(null);
      });
    return () => {
      cancelled = true;
      job.cancel();
    };
  }, [renderer, viewPage, cssWidth]);

  // Itens de texto da página para posicionar o destaque.
  useEffect(() => {
    if (!renderer) return;
    let cancelled = false;
    renderer
      .getTextItemBoxes(viewPage)
      .then((items) => {
        if (!cancelled) setPageItems({ page: viewPage, items });
      })
      .catch(() => {
        if (!cancelled) setPageItems(null);
      });
    return () => {
      cancelled = true;
    };
  }, [renderer, viewPage]);

  const highlight = useMemo(() => {
    if (!location || !pageItems || pageItems.page !== location.page) {
      return null;
    }
    const { items } = pageItems;
    const block = unionRects(
      items.slice(location.itemStart, location.itemEnd).map((i) => i.rect),
    );
    const lineItemIndex = estimateItemForFraction(
      items.map((i) => i.text),
      location.itemStart,
      location.itemEnd,
      location.fractionInBlock,
    );
    const lineItemRect =
      lineItemIndex !== null ? items[lineItemIndex]?.rect ?? null : null;
    let line: NormalizedRect | null = null;
    if (lineItemRect) {
      const midY = lineItemRect.top + lineItemRect.height / 2;
      line = unionRects(
        items
          .slice(location.itemStart, location.itemEnd)
          .map((i) => i.rect)
          .filter(
            (r): r is NormalizedRect =>
              !!r && Math.abs(r.top + r.height / 2 - midY) < lineItemRect.height * 0.6,
          ),
      );
    }
    return { block, line };
  }, [location, pageItems]);

  const showHighlight = viewPage === cursorPage && renderedPage === viewPage;

  const readFromToken = isBrowsing
    ? firstTokenAtOrAfterPage(pageIndex, viewPage)
    : null;

  return (
    <section
      aria-label="Mapa do PDF original"
      data-testid="pdf-scan-panel"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <ScanLine className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="eyebrow !text-muted-foreground">Mapa do PDF</span>
        </div>
        <span
          className="font-mono text-[0.6875rem] tabular-nums text-muted-foreground"
          data-testid="pdf-scan-page-label"
          aria-live="polite"
        >
          Pág. {viewPage}
          <span className="text-subtle-foreground"> / {pageCount || '—'}</span>
        </span>
      </header>

      <div className="p-3">
        <div
          ref={frameRef}
          className="relative w-full overflow-hidden rounded-md bg-surface-sunken ring-1 ring-border"
          style={{ aspectRatio: String(aspect) }}
        >
          {load.status === 'error' ? (
            <div
              role="status"
              data-testid="pdf-scan-error"
              className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs leading-relaxed text-muted-foreground"
            >
              {load.message} A leitura continua normalmente.
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={`Página ${viewPage} do PDF original`}
                data-testid="pdf-scan-canvas"
                data-rendered-page={renderedPage ?? undefined}
                className={cn(
                  'absolute inset-0 h-full w-full bg-white transition-opacity duration-300',
                  renderedPage === viewPage ? 'opacity-100' : 'opacity-0',
                )}
              />

              {renderedPage !== viewPage && (
                <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
                  <div className="absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-primary/10 to-transparent animate-scan" />
                </div>
              )}

              {showHighlight && highlight?.block && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute rounded-[3px] bg-primary/[0.07] ring-1 ring-primary/30"
                  style={rectStyle(highlight.block, 0.006)}
                />
              )}

              {showHighlight && highlight?.line && (
                <>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent"
                    style={{
                      top: `${(highlight.line.top + highlight.line.height) * 100}%`,
                    }}
                  />
                  <div
                    aria-hidden="true"
                    data-testid="pdf-scan-line-highlight"
                    className={cn(
                      'pointer-events-none absolute rounded-[2px] bg-primary/25 mix-blend-multiply ring-1 ring-primary/60 dark:mix-blend-normal',
                      !reducedMotion && 'transition-[top,left,width,height] duration-300 ease-out',
                    )}
                    style={rectStyle(highlight.line, 0.004)}
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0 w-[3px] rounded-r bg-primary shadow-[0_0_10px_var(--primary)]"
                    style={{
                      top: `${highlight.line.top * 100}%`,
                      height: `${Math.max(highlight.line.height, 0.012) * 100}%`,
                    }}
                  />
                </>
              )}
            </>
          )}
        </div>

        {pageCount > 0 && (
          <div
            className="mt-3 flex h-2.5 items-stretch gap-px"
            role="group"
            aria-label="Páginas do PDF"
          >
            {Array.from({ length: pageCount }, (_, i) => {
              const page = i + 1;
              return (
                <button
                  key={page}
                  type="button"
                  data-testid={`pdf-scan-page-segment-${page}`}
                  aria-label={`Ver página ${page}`}
                  aria-current={page === viewPage ? 'true' : undefined}
                  onClick={() => setBrowsePage(page === cursorPage ? null : page)}
                  className={cn(
                    'min-w-0 flex-1 cursor-pointer rounded-[2px] transition-colors first:rounded-l-full last:rounded-r-full',
                    page < cursorPage && 'bg-primary/45 hover:bg-primary/60',
                    page === cursorPage && 'bg-primary',
                    page > cursorPage && 'bg-border-strong hover:bg-muted-foreground/40',
                    page === viewPage && page !== cursorPage && 'ring-1 ring-foreground/60',
                  )}
                />
              );
            })}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="min-h-8 min-w-8"
              aria-label="Página anterior"
              disabled={viewPage <= 1}
              onClick={() => setBrowsePage(Math.max(1, viewPage - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-8 min-w-8"
              aria-label="Próxima página"
              disabled={viewPage >= pageCount}
              onClick={() => setBrowsePage(Math.min(pageCount, viewPage + 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {isBrowsing ? (
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="min-h-8"
                data-testid="pdf-scan-follow-btn"
                onClick={() => setBrowsePage(null)}
              >
                <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                Trecho atual
              </Button>
              {!isPlaying && readFromToken !== null && (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-8"
                  data-testid="pdf-scan-read-from-page-btn"
                  onClick={() => {
                    onSeekToToken(readFromToken);
                    setBrowsePage(null);
                  }}
                >
                  Ler desta página
                </Button>
              )}
            </div>
          ) : (
            <span className="text-[0.6875rem] text-subtle-foreground">
              {isPlaying ? 'Acompanhando a leitura' : 'Em pausa'}
            </span>
          )}
        </div>

        <p className="mt-2 text-[0.6875rem] leading-relaxed text-subtle-foreground">
          Destaque aproximado pelo bloco de texto extraído; não marca a palavra exata.
        </p>
      </div>
    </section>
  );
}

function rectStyle(rect: NormalizedRect, pad: number): CSSProperties {
  return {
    left: `${Math.max(0, rect.left - pad) * 100}%`,
    top: `${Math.max(0, rect.top - pad) * 100}%`,
    width: `${(rect.width + pad * 2) * 100}%`,
    height: `${(rect.height + pad * 2) * 100}%`,
  };
}
