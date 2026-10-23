import { useEffect, useState } from 'react';
import type { PdfPageRenderer } from '@/infrastructure/pdf/pdfPageRenderer';
import { AppError, toAppError } from '@/shared/errors';

export type PdfRendererState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; renderer: PdfPageRenderer }
  | { status: 'error'; message: string };

/**
 * Abre o PDF original uma única vez por documento e compartilha a instância
 * entre o mapa de páginas e o sumário. PDF.js é importado sob demanda.
 * Seguro para StrictMode: a instância de um efeito descartado é destruída.
 */
export function usePdfRenderer(
  documentId: string | null,
  enabled: boolean,
): PdfRendererState {
  const [state, setState] = useState<{
    key: string | null;
    value: PdfRendererState;
  }>({ key: null, value: { status: 'idle' } });

  const key = enabled && documentId ? documentId : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let opened: PdfPageRenderer | null = null;

    (async () => {
      const [{ loadSourceFileBlob }, { PdfPageRenderer }] = await Promise.all([
        import('@/infrastructure/db/repositories'),
        import('@/infrastructure/pdf/pdfPageRenderer'),
      ]);
      const blob = await loadSourceFileBlob(key);
      if (!blob) {
        throw new AppError(
          'DOCUMENT_NOT_FOUND',
          'Arquivo original não encontrado neste navegador.',
        );
      }
      const instance = await PdfPageRenderer.open(blob);
      if (cancelled) {
        instance.destroy();
        return;
      }
      opened = instance;
      setState({ key, value: { status: 'ready', renderer: instance } });
    })().catch((error: unknown) => {
      if (cancelled) return;
      setState({
        key,
        value: {
          status: 'error',
          message: toAppError(error, 'CORRUPT_FILE').userMessage,
        },
      });
    });

    return () => {
      cancelled = true;
      opened?.destroy();
    };
  }, [key]);

  if (!key) return { status: 'idle' };
  return state.key === key ? state.value : { status: 'loading' };
}
