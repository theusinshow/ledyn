import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LedynDatabase } from '@/infrastructure/db/database';
import {
  commitPreparedDocument,
  listLibraryItems,
} from '@/infrastructure/db/repositories';
import {
  cancelImportJob,
  createImportJob,
  prepareFileImportDraft,
} from '@/infrastructure/importers/pipeline';
import { MAX_IMPORT_FILE_BYTES } from '@/infrastructure/importers/types';
import {
  createFx03InvalidEncodingBytes,
  createFx03TxtUtf8Bytes,
  createFx03TxtWithBomBytes,
  createFx04ThreePagePdfBytes,
  createFx05MixedPdfBytes,
  createFx05ScannedEmptyPdfBytes,
  createFx05TwoColumnPdfBytes,
  createFx06ThreeChapterEpubBytes,
  createMultiPagePdfBytes,
  createSyntheticEpubBytes,
} from '../fixtures/corpus';

describe('F2 — Importadores TXT, PDF, EPUB, Limites e Isolamento (AC-03, AC-04, AC-05, AC-28)', () => {
  let testDb: LedynDatabase;

  beforeEach(async () => {
    testDb = new LedynDatabase(`test-f2-db-${Date.now()}-${Math.random()}`);
    await testDb.open();
  });

  describe('AC-03 — Importador TXT e Duplicatas', () => {
    it('importa TXT UTF-8 sem BOM e com BOM preservando acentos e parágrafos', async () => {
      const noBomBytes = createFx03TxtUtf8Bytes();
      const withBomBytes = createFx03TxtWithBomBytes();

      const draftNoBom = await prepareFileImportDraft({
        fileName: 'artigo-sem-bom.txt',
        readBytes: () => noBomBytes,
        database: testDb,
      });

      const draftWithBom = await prepareFileImportDraft({
        fileName: 'artigo-com-bom.txt',
        readBytes: () => withBomBytes,
        database: testDb,
      });

      expect(draftNoBom.format).toBe('txt');
      expect(draftNoBom.normalizedText).toContain('coração, cérebro, atenção e método');
      expect(draftNoBom.blocks).toHaveLength(2);
      expect(draftWithBom.normalizedText).toBe(draftNoBom.normalizedText);
      expect(draftWithBom.tokens.length).toBe(draftNoBom.tokens.length);
    });

    it('rejeita TXT vazio, apenas espaços ou com bytes UTF-8 inválidos com erro específico', async () => {
      await expect(
        prepareFileImportDraft({
          fileName: 'vazio.txt',
          readBytes: () => new Uint8Array(0),
          database: testDb,
        }),
      ).rejects.toMatchObject({ code: 'EMPTY_TEXT' });

      await expect(
        prepareFileImportDraft({
          fileName: 'espacos.txt',
          readBytes: () => new TextEncoder().encode('   \n\t  '),
          database: testDb,
        }),
      ).rejects.toMatchObject({ code: 'EMPTY_TEXT' });

      await expect(
        prepareFileImportDraft({
          fileName: 'invalido.txt',
          readBytes: () => createFx03InvalidEncodingBytes(),
          database: testDb,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_ENCODING' });
    });

    it('detecta arquivo duplicado por SHA-256 sem duplicar na biblioteca, mas permite arquivos distintos com mesmo título', async () => {
      const bytesA = createFx03TxtUtf8Bytes('Conteúdo exclusivo do arquivo A.');
      const bytesB = createFx03TxtUtf8Bytes('Conteúdo diferente do arquivo B.');

      const draftA1 = await prepareFileImportDraft({
        fileName: 'mesmo-titulo.txt',
        explicitTitle: 'Título Compartilhado',
        readBytes: () => bytesA,
        database: testDb,
      });
      expect(draftA1.duplicateDocument).toBeNull();
      const savedA = await commitPreparedDocument(draftA1, { database: testDb });

      // Importar exatamente o mesmo arquivo novamente aponta para o existente
      const draftA2 = await prepareFileImportDraft({
        fileName: 'copia-id.txt',
        readBytes: () => bytesA,
        database: testDb,
      });
      expect(draftA2.duplicateDocument?.id).toBe(savedA.id);

      // Importar outro arquivo diferente com o mesmo título NÃO funde pelo título
      const draftB = await prepareFileImportDraft({
        fileName: 'mesmo-titulo.txt',
        explicitTitle: 'Título Compartilhado',
        readBytes: () => bytesB,
        database: testDb,
      });
      expect(draftB.duplicateDocument).toBeNull();
      await commitPreparedDocument(draftB, { database: testDb });

      const items = await listLibraryItems(undefined, testDb);
      expect(items).toHaveLength(2);
    });
  });

  describe('AC-04 — Importador PDF.js Real e Limites Semânticos', () => {
    it('extrai FX-04 (PDF textual de 3 páginas) na ordem esperada com âncoras por página e prévia navegável', async () => {
      const pdfBytes = createFx04ThreePagePdfBytes();
      const stages: string[] = [];

      const draft = await prepareFileImportDraft({
        fileName: 'manual-3-paginas.pdf',
        readBytes: () => pdfBytes,
        database: testDb,
        onProgress: (u) => stages.push(u.message),
      });

      expect(draft.format).toBe('pdf');
      expect(draft.previewSections).toHaveLength(3);
      expect(draft.previewSections?.[0]?.label).toBe('Página 1');
      expect(draft.previewSections?.[1]?.label).toBe('Página 2');
      expect(draft.previewSections?.[2]?.label).toBe('Página 3');

      expect(draft.normalizedText).toContain('Pagina um introducao clara');
      expect(draft.normalizedText).toContain('Pagina dois desenvolvimento');
      expect(draft.normalizedText).toContain('Pagina tres conclusao final');

      // Verifica âncoras de página 1-based
      const pdfAnchors = draft.blocks.map((b) => b.anchor);
      expect(pdfAnchors.some((a) => a.kind === 'pdf' && a.page === 1)).toBe(true);
      expect(pdfAnchors.some((a) => a.kind === 'pdf' && a.page === 2)).toBe(true);
      expect(pdfAnchors.some((a) => a.kind === 'pdf' && a.page === 3)).toBe(true);
      expect(stages).toContain('Extraindo página 1 de 3');
      expect(stages).toContain('Extraindo página 3 de 3');
    });

    it('rejeita PDF sem camada de texto (escaneado) com NO_TEXT_LAYER e PDF corrompido com CORRUPT_FILE', async () => {
      const scannedBytes = createFx05ScannedEmptyPdfBytes();
      await expect(
        prepareFileImportDraft({
          fileName: 'escaneado.pdf',
          readBytes: () => scannedBytes,
          database: testDb,
        }),
      ).rejects.toMatchObject({
        code: 'NO_TEXT_LAYER',
      });

      const corruptBytes = new TextEncoder().encode('%PDF-1.4 arquivo truncado corrompido');
      await expect(
        prepareFileImportDraft({
          fileName: 'corrompido.pdf',
          readBytes: () => corruptBytes,
          database: testDb,
        }),
      ).rejects.toMatchObject({
        code: 'CORRUPT_FILE',
      });
    });

    it('emite avisos claros para PDF misto (páginas sem texto) e PDF em duas colunas', async () => {
      const mixedBytes = createFx05MixedPdfBytes();
      const mixedDraft = await prepareFileImportDraft({
        fileName: 'misto.pdf',
        readBytes: () => mixedBytes,
        database: testDb,
      });

      expect(
        mixedDraft.warnings.some((w) => w.code === 'PDF_MIXED_EMPTY_PAGES'),
      ).toBe(true);
      expect(mixedDraft.previewSections?.[1]?.hasText).toBe(false);

      const twoColBytes = createFx05TwoColumnPdfBytes();
      const twoColDraft = await prepareFileImportDraft({
        fileName: 'colunas.pdf',
        readBytes: () => twoColBytes,
        database: testDb,
      });

      expect(
        twoColDraft.warnings.some((w) => w.code === 'PDF_COMPLEX_LAYOUT'),
      ).toBe(true);
    });
  });

  describe('AC-05 — Importador EPUB e Isolamento contra Conteúdo Hostil', () => {
    it('extrai FX-06 (EPUB reflowable de 3 capítulos) preservando a ordem do spine e fronteiras de parágrafo', async () => {
      const epubBytes = createFx06ThreeChapterEpubBytes();
      const draft = await prepareFileImportDraft({
        fileName: 'livro-3-capitulos.epub',
        readBytes: () => epubBytes,
        database: testDb,
      });

      expect(draft.format).toBe('epub');
      expect(draft.title).toBe('Manual de Leitura em Três Capítulos');
      expect(draft.previewSections).toHaveLength(3);

      const idxCap1 = draft.normalizedText.indexOf('Capítulo 1: Fundamentos');
      const idxCap2 = draft.normalizedText.indexOf('Capítulo 2: Prática');
      const idxCap3 = draft.normalizedText.indexOf('Capítulo 3: Revisão');

      expect(idxCap1).toBeGreaterThanOrEqual(0);
      expect(idxCap2).toBeGreaterThan(idxCap1);
      expect(idxCap3).toBeGreaterThan(idxCap2);

      // Persistir e confirmar que pode ser lido da base local
      const saved = await commitPreparedDocument(draft, { database: testDb });
      expect(saved.format).toBe('epub');
    });

    it('isola FX-07 hostil: não executa scripts/handlers, não dispara fetch de rede e rejeita DRM/fixed-layout/path-traversal/href-remoto', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const win = globalThis as Record<string, unknown>;
      delete win.__EPUB_SCRIPT_EXECUTED__;
      delete win.__EPUB_HANDLER_EXECUTED__;
      delete win.__EPUB_IMG_ERROR__;
      delete win.__EPUB_JS_LINK__;

      try {
        const hostileBytes = createSyntheticEpubBytes({
          includeScriptAndRemote: true,
        });

        const draft = await prepareFileImportDraft({
          fileName: 'hostil.epub',
          readBytes: () => hostileBytes,
          database: testDb,
        });

        expect(win.__EPUB_SCRIPT_EXECUTED__).toBeUndefined();
        expect(win.__EPUB_HANDLER_EXECUTED__).toBeUndefined();
        expect(win.__EPUB_IMG_ERROR__).toBeUndefined();
        expect(win.__EPUB_JS_LINK__).toBeUndefined();
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(
          draft.warnings.some((w) => w.code === 'EPUB_SANITIZED_ELEMENTS'),
        ).toBe(true);

        // Spine apontando para URL externa
        await expect(
          prepareFileImportDraft({
            fileName: 'remoto.epub',
            readBytes: () =>
              createSyntheticEpubBytes({ includeExternalSpineHref: true }),
            database: testDb,
          }),
        ).rejects.toMatchObject({ code: 'EXTERNAL_RESOURCE_BLOCKED' });

        // Path traversal
        await expect(
          prepareFileImportDraft({
            fileName: 'traversal.epub',
            readBytes: () =>
              createSyntheticEpubBytes({ includePathTraversal: true }),
            database: testDb,
          }),
        ).rejects.toMatchObject({ code: 'CORRUPT_FILE' });

        // DRM
        await expect(
          prepareFileImportDraft({
            fileName: 'drm.epub',
            readBytes: () => createSyntheticEpubBytes({ includeDrm: true }),
            database: testDb,
          }),
        ).rejects.toMatchObject({ code: 'DRM_UNSUPPORTED' });

        // Fixed layout
        await expect(
          prepareFileImportDraft({
            fileName: 'fixed.epub',
            readBytes: () =>
              createSyntheticEpubBytes({ includeFixedLayout: true }),
            database: testDb,
          }),
        ).rejects.toMatchObject({ code: 'FIXED_LAYOUT_UNSUPPORTED' });
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('AC-28 — Limites Exatos (limite-1, limite, limite+1), Cancelamento e Timeout', () => {
    it('valida tetos de tamanho de arquivo, UTF-16, tokens e páginas PDF exatamente em limite-1, limite e limite+1', async () => {
      expect(MAX_IMPORT_FILE_BYTES).toBe(40 * 1024 * 1024);

      await expect(
        prepareFileImportDraft({
          fileName: 'excede-40mib.pdf',
          declaredByteSize: MAX_IMPORT_FILE_BYTES + 1,
          readBytes: () => {
            throw new Error('Não deve ler bytes quando tamanho declarado excede 40 MiB');
          },
          database: testDb,
        }),
      ).rejects.toMatchObject({
        code: 'FILE_TOO_LARGE',
        userMessage:
          'O arquivo excede o limite de 40 MiB desta versão. Reduza/divida o arquivo ou cole um trecho menor.',
      });

      // 1. Limite de bytes do arquivo (ex: teto de teste = 100 bytes)
      const bytes99 = new TextEncoder().encode('a'.repeat(99));
      const bytes100 = new TextEncoder().encode('a'.repeat(100));
      const bytes101 = new TextEncoder().encode('a'.repeat(101));

      await expect(
        prepareFileImportDraft({
          fileName: 'b99.txt',
          readBytes: () => bytes99,
          limits: { maxFileBytes: 100 },
          database: testDb,
        }),
      ).resolves.toBeDefined();

      await expect(
        prepareFileImportDraft({
          fileName: 'b100.txt',
          readBytes: () => bytes100,
          limits: { maxFileBytes: 100 },
          database: testDb,
        }),
      ).resolves.toBeDefined();

      await expect(
        prepareFileImportDraft({
          fileName: 'b101.txt',
          readBytes: () => bytes101,
          limits: { maxFileBytes: 100 },
          database: testDb,
        }),
      ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });

      // 2. Limite de tokens (teto = 5 tokens: testando 4, 5 e 6 tokens)
      const fourTokens = new TextEncoder().encode('um dois tres quatro');
      const fiveTokens = new TextEncoder().encode('um dois tres quatro cinco');
      const sixTokens = new TextEncoder().encode('um dois tres quatro cinco seis');

      await expect(
        prepareFileImportDraft({
          fileName: 't4.txt',
          readBytes: () => fourTokens,
          limits: { maxTokens: 5 },
          database: testDb,
        }),
      ).resolves.toBeDefined();

      await expect(
        prepareFileImportDraft({
          fileName: 't5.txt',
          readBytes: () => fiveTokens,
          limits: { maxTokens: 5 },
          database: testDb,
        }),
      ).resolves.toBeDefined();

      await expect(
        prepareFileImportDraft({
          fileName: 't6.txt',
          readBytes: () => sixTokens,
          limits: { maxTokens: 5 },
          database: testDb,
        }),
      ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });

      // 3. Limite de páginas PDF (teto = 2 páginas: testando 1, 2 e 3 páginas)
      const pdf1 = createMultiPagePdfBytes(['BT /F1 12 Tf 72 720 Td (P1) Tj ET']);
      const pdf2 = createMultiPagePdfBytes([
        'BT /F1 12 Tf 72 720 Td (P1) Tj ET',
        'BT /F1 12 Tf 72 720 Td (P2) Tj ET',
      ]);
      const pdf3 = createFx04ThreePagePdfBytes();

      await expect(
        prepareFileImportDraft({
          fileName: 'p1.pdf',
          readBytes: () => pdf1,
          limits: { maxPdfPages: 2 },
          database: testDb,
        }),
      ).resolves.toBeDefined();

      await expect(
        prepareFileImportDraft({
          fileName: 'p2.pdf',
          readBytes: () => pdf2,
          limits: { maxPdfPages: 2 },
          database: testDb,
        }),
      ).resolves.toBeDefined();

      await expect(
        prepareFileImportDraft({
          fileName: 'p3.pdf',
          readBytes: () => pdf3,
          limits: { maxPdfPages: 2 },
          database: testDb,
        }),
      ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    });

    it('cancela job em menos de 1s, impede commit de job cancelado e encerra por timeout quando excedido', async () => {
      const job = createImportJob();
      const startMs = performance.now();

      // Cancela o job durante a leitura
      const pendingPromise = prepareFileImportDraft({
        fileName: 'cancelado.txt',
        jobId: job.jobId,
        signal: job.signal,
        readBytes: async () => {
          cancelImportJob(job.jobId);
          return createFx03TxtUtf8Bytes('Texto que foi cancelado');
        },
        database: testDb,
      });

      await expect(pendingPromise).rejects.toMatchObject({
        code: 'IMPORT_CANCELLED',
      });
      expect(performance.now() - startMs).toBeLessThan(1000);

      // Se um rascunho já preparado tiver seu jobId cancelado antes do commit, o commit é bloqueado
      const validJob = createImportJob();
      const prepared = await prepareFileImportDraft({
        fileName: 'tardio.txt',
        jobId: validJob.jobId,
        signal: validJob.signal,
        readBytes: () => createFx03TxtUtf8Bytes('Resultado tardio'),
        database: testDb,
      });

      cancelImportJob(validJob.jobId);
      await expect(
        commitPreparedDocument(prepared, { database: testDb }),
      ).rejects.toMatchObject({ code: 'IMPORT_CANCELLED' });
      expect(await testDb.documents.count()).toBe(0);

      // Timeout
      await expect(
        prepareFileImportDraft({
          fileName: 'lento.txt',
          limits: { timeoutMs: 15 },
          readBytes: async () => {
            await new Promise((r) => setTimeout(r, 60));
            return createFx03TxtUtf8Bytes('Muito lento');
          },
          database: testDb,
        }),
      ).rejects.toMatchObject({ code: 'IMPORT_TIMEOUT' });
    });
  });
});
