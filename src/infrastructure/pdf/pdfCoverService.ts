import { loadSourceFileBlob } from '@/infrastructure/db/repositories';
import { PdfPageRenderer } from '@/infrastructure/pdf/pdfPageRenderer';

/**
 * Capas de PDF para a biblioteca: primeira página do arquivo original preservado,
 * desenhada localmente sob demanda e mantida só em memória (object URL) nesta aba.
 *
 * Não persiste nada no Dexie: a capa é derivada do original e pode ser refeita,
 * então não exige migração de schema nem entra no backup.
 * As capas são geradas uma por vez para não abrir vários PDFs grandes em paralelo.
 */

const COVER_CSS_WIDTH = 120;

const cache = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

async function renderCover(documentId: string): Promise<string | null> {
  const blob = await loadSourceFileBlob(documentId);
  if (!blob) return null;

  const renderer = await PdfPageRenderer.open(blob);
  try {
    const canvas = document.createElement('canvas');
    await renderer.renderToCanvas(1, canvas, COVER_CSS_WIDTH).done;
    if (canvas.width === 0) return null;
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    return png ? URL.createObjectURL(png) : null;
  } finally {
    renderer.destroy();
  }
}

export function getPdfCoverUrl(documentId: string): Promise<string | null> {
  const cached = cache.get(documentId);
  if (cached) return cached;

  const pending = queue.then(() => renderCover(documentId));
  queue = pending.catch(() => undefined);
  const safe = pending.catch(() => null);
  cache.set(documentId, safe);
  return safe;
}

/** Libera a capa de um documento removido. */
export function releasePdfCover(documentId: string): void {
  const cached = cache.get(documentId);
  if (!cached) return;
  cache.delete(documentId);
  void cached.then((url) => {
    if (url) URL.revokeObjectURL(url);
  });
}
