type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfJsWorkerInstance = InstanceType<PdfJsModule['PDFWorker']>;

export interface PdfWorkerHandle {
  /** Worker a passar para `getDocument`; ausente no ambiente de testes. */
  worker?: PdfJsWorkerInstance;
  dispose: () => void;
}

/**
 * Cria o worker do PDF.js para uma operação.
 *
 * No navegador, usa um Web Worker dedicado (porta explícita): o parsing e a extração
 * de texto saem da thread principal, e a interface não trava durante a importação.
 * Nos testes (Node/jsdom, sem `Worker`), usa o worker de thread principal do PDF.js.
 * O ramo de teste depende só de `import.meta.env.MODE`, constante no build: em produção
 * ele é eliminado, e o worker do PDF.js é empacotado uma única vez.
 */
export async function createPdfWorker(pdfjs: PdfJsModule): Promise<PdfWorkerHandle> {
  if (import.meta.env.MODE === 'test') {
    const g = globalThis as Record<string, unknown>;
    if (!g.pdfjsWorker) {
      g.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    }
    return { dispose: () => undefined };
  }

  const { default: PdfJsWorker } = await import(
    'pdfjs-dist/legacy/build/pdf.worker.mjs?worker'
  );
  const port = new PdfJsWorker();
  const worker = pdfjs.PDFWorker.create({ port });
  return {
    worker,
    dispose: () => {
      worker.destroy();
      port.terminate();
    },
  };
}
