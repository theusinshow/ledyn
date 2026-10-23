import PdfJsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?worker';
import type { PdfOutlineItem } from '@/domain/documents/chapters';
import { AppError } from '@/shared/errors';

/**
 * Renderização local de páginas do PDF original para o mapa de leitura.
 *
 * - Usa um Worker dedicado (porta explícita) para não bloquear o relógio do leitor,
 *   independentemente do worker de thread principal usado pelo importador.
 * - Mesmas opções seguras do importador: sem eval, sem FontFace, sem rede.
 * - Nenhum texto do PDF é inserido no DOM; a página é desenhada só em canvas.
 */

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfLoadingTask = ReturnType<PdfJsModule['getDocument']>;
type PdfDocument = Awaited<PdfLoadingTask['promise']>;

/** Retângulo normalizado [0, 1] relativo à largura/altura da página renderizada. */
export type NormalizedRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PdfPageTextItemBox = {
  text: string;
  rect: NormalizedRect | null;
};

export type PdfPageSize = { width: number; height: number };

export class PdfPageRenderer {
  private readonly worker: Worker;
  private readonly pdfWorker: InstanceType<PdfJsModule['PDFWorker']>;
  private readonly loadingTask: PdfLoadingTask;
  private readonly doc: PdfDocument;
  private readonly itemCache = new Map<number, Promise<PdfPageTextItemBox[]>>();
  private destroyed = false;

  private constructor(
    worker: Worker,
    pdfWorker: InstanceType<PdfJsModule['PDFWorker']>,
    loadingTask: PdfLoadingTask,
    doc: PdfDocument,
  ) {
    this.worker = worker;
    this.pdfWorker = pdfWorker;
    this.loadingTask = loadingTask;
    this.doc = doc;
  }

  static async open(blob: Blob): Promise<PdfPageRenderer> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker = new PdfJsWorker();
    const pdfWorker = pdfjs.PDFWorker.create({ port: worker });
    try {
      const data = new Uint8Array(await blob.arrayBuffer());
      const loadingTask = pdfjs.getDocument({
        data,
        worker: pdfWorker,
        disableFontFace: true,
        useSystemFonts: true,
        isEvalSupported: false,
        enableXfa: false,
      } as Parameters<typeof pdfjs.getDocument>[0]);
      const doc = await loadingTask.promise;
      return new PdfPageRenderer(worker, pdfWorker, loadingTask, doc);
    } catch (error) {
      pdfWorker.destroy();
      worker.terminate();
      throw new AppError(
        'CORRUPT_FILE',
        'Não foi possível abrir o PDF original para o mapa de páginas.',
        { cause: error },
      );
    }
  }

  get pageCount(): number {
    return this.doc.numPages;
  }

  async getPageSize(pageNumber: number): Promise<PdfPageSize> {
    const page = await this.doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  }

  /**
   * Desenha a página no canvas ajustada à largura CSS informada.
   * Retorna uma função de cancelamento para trocas rápidas de página.
   */
  renderToCanvas(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    cssWidth: number,
  ): { done: Promise<void>; cancel: () => void } {
    let cancelled = false;
    let cancelTask: (() => void) | null = null;

    const done = (async () => {
      const page = await this.doc.getPage(pageNumber);
      if (cancelled || this.destroyed) return;
      const base = page.getViewport({ scale: 1 });
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      const scale = (Math.max(120, cssWidth) / base.width) * pixelRatio;
      const viewport = page.getViewport({ scale });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const task = page.render({ canvas, viewport });
      cancelTask = () => task.cancel();
      try {
        await task.promise;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === 'RenderingCancelledException'
        ) {
          return;
        }
        throw error;
      }
    })();

    return {
      done,
      cancel: () => {
        cancelled = true;
        cancelTask?.();
      },
    };
  }

  /** Itens de texto da página (mesma ordem do importador) com caixas normalizadas. */
  getTextItemBoxes(pageNumber: number): Promise<PdfPageTextItemBox[]> {
    const cached = this.itemCache.get(pageNumber);
    if (cached) return cached;

    const pending = (async () => {
      const page = await this.doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      return content.items.map((raw): PdfPageTextItemBox => {
        const item = raw as {
          str?: unknown;
          transform?: unknown;
          width?: unknown;
          height?: unknown;
        };
        const text = typeof item.str === 'string' ? item.str : '';
        const t = Array.isArray(item.transform)
          ? (item.transform as number[])
          : null;
        if (!t || text.trim().length === 0) return { text, rect: null };

        const x = Number(t[4] ?? 0);
        const y = Number(t[5] ?? 0);
        const h =
          Math.abs(Number(item.height ?? 0)) ||
          Math.hypot(Number(t[2] ?? 0), Number(t[3] ?? 0)) ||
          10;
        const w = Math.abs(Number(item.width ?? 0)) || text.length * h * 0.5;
        const [x1, y1] = viewport.convertToViewportPoint(x, y - h * 0.25) as [
          number,
          number,
        ];
        const [x2, y2] = viewport.convertToViewportPoint(x + w, y + h) as [
          number,
          number,
        ];
        const left = Math.min(x1, x2) / viewport.width;
        const top = Math.min(y1, y2) / viewport.height;
        return {
          text,
          rect: {
            left,
            top,
            width: Math.abs(x2 - x1) / viewport.width,
            height: Math.abs(y2 - y1) / viewport.height,
          },
        };
      });
    })();

    this.itemCache.set(pageNumber, pending);
    pending.catch(() => this.itemCache.delete(pageNumber));
    return pending;
  }

  /**
   * Sumário (outline) achatado, com profundidade e página de destino resolvida.
   * Destinos externos/URL são ignorados; nada é aberto ou navegado.
   */
  async getOutline(maxDepth = 3, maxItems = 1_000): Promise<PdfOutlineItem[]> {
    type OutlineNode = {
      title: string;
      dest: string | unknown[] | null;
      items: OutlineNode[];
    };
    const roots = ((await this.doc.getOutline()) ?? []) as OutlineNode[];
    const result: PdfOutlineItem[] = [];

    const resolvePage = async (dest: OutlineNode['dest']): Promise<number | null> => {
      try {
        const explicit =
          typeof dest === 'string' ? await this.doc.getDestination(dest) : dest;
        if (!Array.isArray(explicit) || explicit.length === 0) return null;
        const ref = explicit[0];
        if (typeof ref === 'number') return ref + 1;
        if (ref && typeof ref === 'object') {
          const pageIndex = await this.doc.getPageIndex(
            ref as Parameters<PdfDocument['getPageIndex']>[0],
          );
          return pageIndex + 1;
        }
        return null;
      } catch {
        return null;
      }
    };

    const walk = async (nodes: OutlineNode[], depth: number) => {
      for (const node of nodes) {
        if (result.length >= maxItems || this.destroyed) return;
        result.push({
          title: typeof node.title === 'string' ? node.title : '',
          depth,
          page: await resolvePage(node.dest),
        });
        if (depth + 1 < maxDepth && Array.isArray(node.items)) {
          await walk(node.items, depth + 1);
        }
      }
    };

    await walk(roots, 0);
    return result;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.itemCache.clear();
    void this.loadingTask.destroy();
    this.pdfWorker.destroy();
    this.worker.terminate();
  }
}

/** União de retângulos normalizados (ignora nulos). */
export function unionRects(
  rects: ReadonlyArray<NormalizedRect | null | undefined>,
): NormalizedRect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    if (!r) continue;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.left + r.width);
    bottom = Math.max(bottom, r.top + r.height);
  }
  if (!Number.isFinite(left)) return null;
  return { left, top, width: right - left, height: bottom - top };
}
