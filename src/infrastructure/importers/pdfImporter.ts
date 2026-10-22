import type { ContentBlock, ImportIssue } from '@/domain/contracts';
import {
  generateTitleFromText,
   MAX_NORMALIZED_UTF16_LENGTH,
  NORMALIZATION_VERSION,
  normalizeText,
} from '@/domain/documents/normalizer';
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_PDF_PAGES,
  type ImporterLimitsConfig,
  type ImportProgressUpdate,
  type PreviewSection,
  type RawExtractionOutput,
} from '@/infrastructure/importers/types';
import { AppError } from '@/shared/errors';

function stripPdfExtension(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').replace(/\s+/g, ' ').trim();
}

function hasPdfHeaderSignature(bytes: Uint8Array): boolean {
  // Procura "%PDF-" nos primeiros 1024 bytes conforme especificação PDF
  const limit = Math.min(bytes.byteLength, 1024);
  for (let i = 0; i <= limit - 5; i++) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x44 &&
      bytes[i + 3] === 0x46 &&
      bytes[i + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}

interface PositionedTextItem {
  itemIndex: number;
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

interface ExtractedPageBlock {
  text: string;
  itemStart: number;
  itemEnd: number;
}

/**
 * Agrupa itens de texto de uma página PDF em parágrafos/blocos usando heurística
 * de coordenadas (x, y) e detecta indícios de múltiplas colunas ou tabelas.
 */
function groupPdfPageItems(rawItems: unknown[]): {
  blocks: ExtractedPageBlock[];
  hasMultiColumnOrTableHint: boolean;
} {
  const items: PositionedTextItem[] = [];

  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i] as Record<string, unknown> | null;
    if (!raw || typeof raw.str !== 'string') continue;
    const text = raw.str;
    if (text.trim().length === 0 && !raw.hasEOL) continue;

    const transform = Array.isArray(raw.transform)
      ? (raw.transform as number[])
      : [1, 0, 0, 1, 0, 0];
    const x = Number(transform[4] ?? 0);
    const y = Number(transform[5] ?? 0);
    const width = Number(raw.width ?? 0);
    const height = Math.abs(Number(raw.height ?? transform[3] ?? 12)) || 12;

    items.push({
      itemIndex: i,
      str: text,
      x,
      y,
      width,
      height,
      hasEOL: Boolean(raw.hasEOL),
    });
  }

  if (items.length === 0) {
    return { blocks: [], hasMultiColumnOrTableHint: false };
  }

  // Detectar indícios de colunas/tabelas: vários saltos horizontais largos (> 45pt) na mesma linha Y
  // ou regressão de Y seguida de subida de Y na página (segunda coluna).
  let largeHorizontalGapLines = 0;
  let yAscentAfterDescentCount = 0;
  let minSeenY = items[0]!.y;

  const blocks: ExtractedPageBlock[] = [];
  let currentStrings: string[] = [];
  let currentStartIdx = items[0]!.itemIndex;
  let currentEndIdx = items[0]!.itemIndex + 1;
  let prevItem: PositionedTextItem | null = null;

  const flushBlock = () => {
    const joined = currentStrings.join(' ').replace(/\s+/g, ' ').trim();
    if (joined.length > 0) {
      blocks.push({
        text: joined,
        itemStart: currentStartIdx,
        itemEnd: currentEndIdx,
      });
    }
    currentStrings = [];
  };

  for (const item of items) {
    if (prevItem) {
      const dy = Math.abs(item.y - prevItem.y);
      const lineThreshold = Math.max(prevItem.height, item.height) * 0.6;
      const paragraphThreshold = Math.max(prevItem.height, item.height) * 1.75;

      // Subida grande em Y indica início de nova coluna na mesma página
      if (item.y - minSeenY > paragraphThreshold * 3) {
        yAscentAfterDescentCount++;
        flushBlock();
        currentStartIdx = item.itemIndex;
      }
      minSeenY = Math.min(minSeenY, item.y);

      if (dy <= lineThreshold) {
        // Mesma linha visual: verificar lacuna horizontal grande (colunas lado a lado ou tabela)
        const expectedNextX = prevItem.x + Math.max(prevItem.width, prevItem.str.length * 4);
        if (item.x - expectedNextX > 55) {
          largeHorizontalGapLines++;
        }
      } else if (dy > paragraphThreshold) {
        // Salto vertical maior que entrelinha normal -> novo bloco/parágrafo
        flushBlock();
        currentStartIdx = item.itemIndex;
      }
    } else {
      currentStartIdx = item.itemIndex;
    }

    if (item.str.trim().length > 0) {
      currentStrings.push(item.str.trim());
    }
    currentEndIdx = item.itemIndex + 1;
    prevItem = item;
  }

  flushBlock();

  const hasMultiColumnOrTableHint =
    yAscentAfterDescentCount > 0 || largeHorizontalGapLines >= 2;

  return {
    blocks,
    hasMultiColumnOrTableHint,
  };
}

/**
 * Importador de PDF textual via PDF.js (`pdfjs-dist`) com worker local,
 * limites verificados durante a extração, âncoras por página e detecção de PDF escaneado/misto/colunas/senha.
 */
export async function extractPdfFile(
  fileBytes: Uint8Array,
  fileName: string,
  options?: {
    explicitTitle?: string;
    signal?: AbortSignal;
    limits?: ImporterLimitsConfig;
    onProgress?: (update: ImportProgressUpdate) => void;
  },
): Promise<RawExtractionOutput> {
  if (options?.signal?.aborted) {
    throw new AppError('IMPORT_CANCELLED');
  }

  const maxBytes = options?.limits?.maxFileBytes ?? MAX_IMPORT_FILE_BYTES;
  const maxPages = options?.limits?.maxPdfPages ?? MAX_PDF_PAGES;
  const maxUtf16 =
    options?.limits?.maxUtf16Length ?? MAX_NORMALIZED_UTF16_LENGTH;

  if (fileBytes.byteLength > maxBytes) {
    throw new AppError(
      'FILE_TOO_LARGE',
      `O arquivo excede o limite de ${(maxBytes / (1024 * 1024)).toFixed(0)} MiB desta versão. Reduza/divida o PDF ou cole um trecho menor.`,
    );
  }

  if (fileBytes.byteLength < 8 || !hasPdfHeaderSignature(fileBytes)) {
    throw new AppError(
      'CORRUPT_FILE',
      'Não foi possível ler a estrutura deste arquivo.',
    );
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const g = globalThis as Record<string, unknown>;
  if (!g.pdfjsWorker) {
    g.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  }

  const dataCopy = new Uint8Array(fileBytes.byteLength);
  dataCopy.set(fileBytes);

  const loadingTask = pdfjs.getDocument({
    data: dataCopy,
    disableFontFace: true,
    useSystemFonts: true,
    isEvalSupported: false,
  } as Parameters<typeof pdfjs.getDocument>[0]);

  const onAbort = () => {
    void loadingTask.destroy();
  };
  options?.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const doc = await loadingTask.promise;

    try {
      if (options?.signal?.aborted) {
        throw new AppError('IMPORT_CANCELLED');
      }

      if (doc.numPages > maxPages) {
        throw new AppError(
          'LIMIT_EXCEEDED',
          `O PDF possui ${doc.numPages} páginas, acima do limite de ${maxPages} páginas desta versão. Importe um arquivo menor ou dividido.`,
        );
      }

      const contentBlocks: ContentBlock[] = [];
      const normalizedParagraphs: string[] = [];
      const previewSections: PreviewSection[] = [];
      const warnings: ImportIssue[] = [];
      const emptyPages: number[] = [];
      let detectedComplexLayout = false;
      let currentNormalizedOffset = 0;

      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        if (options?.signal?.aborted) {
          throw new AppError('IMPORT_CANCELLED');
        }

        options?.onProgress?.({
          stage: 'extracting',
          message: `Extraindo página ${pageNum} de ${doc.numPages}`,
          currentStep: pageNum,
          totalSteps: doc.numPages,
        });

        const page = await doc.getPage(pageNum);
        try {
          const textContent = await page.getTextContent();
          const { blocks: pageBlocks, hasMultiColumnOrTableHint } =
            groupPdfPageItems(textContent.items as unknown[]);

          if (hasMultiColumnOrTableHint) {
            detectedComplexLayout = true;
          }

          const pageParagraphs: string[] = [];

          for (const pb of pageBlocks) {
            const normBlock = normalizeText(pb.text, { maxUtf16Length: maxUtf16 });
            for (const sub of normBlock.blocks) {
              const paragraphText = normBlock.normalizedText.slice(
                sub.startOffset,
                sub.endOffset,
              );
              if (paragraphText.length === 0) continue;

              const separatorLen = normalizedParagraphs.length > 0 ? 2 : 0;
              const nextTotalUtf16 =
                currentNormalizedOffset + separatorLen + paragraphText.length;

              if (nextTotalUtf16 > maxUtf16) {
                throw new AppError(
                  'LIMIT_EXCEEDED',
                  'O texto excede o limite desta versão. Importe um trecho menor.',
                );
              }

              const startOffset = currentNormalizedOffset + separatorLen;
              const endOffset = startOffset + paragraphText.length;
              const blockIndex = contentBlocks.length;

              contentBlocks.push({
                id: `block-${blockIndex}`,
                index: blockIndex,
                startOffset,
                endOffset,
                anchor: {
                  kind: 'pdf',
                  page: pageNum,
                  itemStart: pb.itemStart,
                  itemEnd: pb.itemEnd,
                },
              });

              normalizedParagraphs.push(paragraphText);
              pageParagraphs.push(paragraphText);
              currentNormalizedOffset = endOffset;
            }
          }

          if (pageParagraphs.length === 0) {
            emptyPages.push(pageNum);
          }

          previewSections.push({
            id: `pdf-page-${pageNum}`,
            label: `Página ${pageNum}`,
            paragraphs: pageParagraphs,
            hasText: pageParagraphs.length > 0,
          });
        } finally {
          page.cleanup();
        }
      }

      if (contentBlocks.length === 0) {
        throw new AppError(
          'NO_TEXT_LAYER',
          'Este PDF não possui texto selecionável. OCR não está incluído nesta versão.',
        );
      }

      if (emptyPages.length > 0) {
        warnings.push({
          code: 'PDF_MIXED_EMPTY_PAGES',
          severity: 'warning',
          message: `Algumas páginas não têm texto (pág. ${emptyPages.slice(0, 10).join(', ')}${emptyPages.length > 10 ? '...' : ''}). Elas não entrarão na leitura.`,
        });
      }

      if (detectedComplexLayout) {
        warnings.push({
          code: 'PDF_COMPLEX_LAYOUT',
          severity: 'warning',
          message:
            'A ordem extraída pode diferir da página. Confira a prévia antes de salvar.',
        });
      }

      const normalizedText = normalizedParagraphs.join('\n\n');
      const fallbackTitle = stripPdfExtension(fileName);
      const suggestedTitle = generateTitleFromText(
        normalizedText,
        options?.explicitTitle?.trim() ? options.explicitTitle : fallbackTitle,
      );

      return {
        format: 'pdf',
        suggestedTitle,
        normalizedText,
        normalizationVersion: NORMALIZATION_VERSION,
        blocks: contentBlocks,
        previewSections,
        warnings,
      };
    } finally {
      await doc.cleanup();
    }
  } catch (error) {
    if (options?.signal?.aborted) {
      throw new AppError('IMPORT_CANCELLED');
    }
    if (error instanceof AppError) {
      throw error;
    }
    if (
      error instanceof Error &&
      (error.name === 'PasswordException' ||
        error.message.toLowerCase().includes('password'))
    ) {
      throw new AppError(
        'PASSWORD_UNSUPPORTED',
        'PDF protegido por senha não é suportado nesta versão.',
        { cause: error },
      );
    }
    throw new AppError(
      'CORRUPT_FILE',
      'Não foi possível ler a estrutura deste arquivo.',
      { cause: error },
    );
  } finally {
    options?.signal?.removeEventListener('abort', onAbort);
    await loadingTask.destroy();
  }
}
