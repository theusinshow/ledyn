import { AppError } from '@/shared/errors';

export interface PdfSpikePageResult {
  pageNumber: number;
  text: string;
  itemCount: number;
}

export interface PdfSpikeResult {
  pageCount: number;
  pages: PdfSpikePageResult[];
}

/**
 * Spike F0 para PDF.js (`pdfjs-dist`):
 * Valida extração local de texto sem rede/CDN e destruição determinística
 * de `loadingTask` e recursos de página.
 */
export async function extractPdfTextSpike(
  pdfBytes: Uint8Array,
  options?: { maxPages?: number },
): Promise<PdfSpikeResult> {
  const maxPages = options?.maxPages ?? 300;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const dataCopy = new Uint8Array(pdfBytes.byteLength);
  dataCopy.set(pdfBytes);

  const loadingTask = pdfjs.getDocument({
    data: dataCopy,
    disableFontFace: true,
    useSystemFonts: true,
  });

  try {
    const doc = await loadingTask.promise;
    try {
      if (doc.numPages > maxPages) {
        throw new AppError(
          'LIMIT_EXCEEDED',
          `O PDF possui ${doc.numPages} páginas, acima do limite de ${maxPages}.`,
        );
      }

      const pages: PdfSpikePageResult[] = [];
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        try {
          const textContent = await page.getTextContent();
          const strings: string[] = [];
          for (const item of textContent.items) {
            if ('str' in item && typeof item.str === 'string') {
              strings.push(item.str);
            }
          }
          pages.push({
            pageNumber: pageNum,
            text: strings.join(' ').replace(/\s+/g, ' ').trim(),
            itemCount: textContent.items.length,
          });
        } finally {
          page.cleanup();
        }
      }

      const totalTextLength = pages.reduce((acc, p) => acc + p.text.length, 0);
      if (totalTextLength === 0) {
        throw new AppError(
          'NO_TEXT_LAYER',
          'Este PDF não possui texto selecionável. OCR não está incluído nesta versão.',
        );
      }

      return {
        pageCount: doc.numPages,
        pages,
      };
    } finally {
      await doc.cleanup();
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new AppError('PASSWORD_UNSUPPORTED');
    }
    throw new AppError('CORRUPT_FILE', 'Não foi possível ler a estrutura deste PDF.', {
      cause: error,
    });
  } finally {
    await loadingTask.destroy();
  }
}
