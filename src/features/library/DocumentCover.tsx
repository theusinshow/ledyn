import { useEffect, useRef, useState } from 'react';
import type { DocumentFormat } from '@/domain/contracts';
import { cn } from '@/shared/utils';

export interface DocumentCoverProps {
  documentId: string;
  title: string;
  format: DocumentFormat;
  progressPercent: number;
  className?: string;
}

const FORMAT_LABEL: Record<DocumentFormat, string> = {
  pdf: 'PDF',
  epub: 'EPUB',
  txt: 'TXT',
  pasted: 'Texto',
};

/**
 * Capa do documento na biblioteca. PDFs mostram a primeira página real
 * (gerada quando o cartão entra na tela); demais formatos usam uma capa tipográfica.
 */
export function DocumentCover({
  documentId,
  title,
  format,
  progressPercent,
  className,
}: DocumentCoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    if (format !== 'pdf' || visible) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [format, visible]);

  useEffect(() => {
    if (format !== 'pdf' || !visible) return;
    let cancelled = false;
    // Import sob demanda: PDF.js só é carregado quando há capa de PDF visível.
    void import('@/infrastructure/pdf/pdfCoverService')
      .then(({ getPdfCoverUrl }) => getPdfCoverUrl(documentId))
      .then((url) => {
        if (!cancelled) setCoverUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [documentId, format, visible]);

  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      ref={ref}
      data-testid={`library-item-cover-${documentId}`}
      data-cover-state={coverUrl ? 'image' : 'placeholder'}
      className={cn(
        'relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-md bg-surface-sunken shadow-[0_1px_0_rgb(255_255_255/0.06)_inset,0_6px_16px_-8px_rgb(0_0_0/0.5)] ring-1 ring-border-strong sm:w-[4.5rem]',
        className,
      )}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={`Capa de ${title}`}
          className="h-full w-full bg-white object-cover object-top animate-fade-up"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-primary/25 via-surface-raised to-surface-sunken p-2"
        >
          <span className="font-mono text-[0.53rem] font-medium tracking-[0.12em] text-muted-foreground">
            {FORMAT_LABEL[format]}
          </span>
          <span className="text-lg font-semibold leading-none tracking-[-0.03em] text-foreground/85">
            {initials || '·'}
          </span>
        </div>
      )}
      {/* Lombada e barra de progresso de leitura */}
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-black/15" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-black/30">
        <div
          className="h-full bg-primary"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
    </div>
  );
}
