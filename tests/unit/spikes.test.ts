import { describe, expect, it } from 'vitest';
import { extractEpubSpike } from '@/infrastructure/importers/epubSpike';
import { extractPdfTextSpike } from '@/infrastructure/importers/pdfSpike';
import { AppError } from '@/shared/errors';
import {
  createMinimalPdfBytes,
  createSyntheticEpubBytes,
} from '../fixtures/corpus';

describe('Spikes Exploratórios F0 — PDF.js e epub.js Seguros', () => {
  it('extrai texto de um PDF simples localmente com PDF.js sem CDN e libera recursos', async () => {
    const pdfBytes = createMinimalPdfBytes('Teste Spike PDF Local');
    const result = await extractPdfTextSpike(pdfBytes);

    expect(result.pageCount).toBe(1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.text).toContain('Teste Spike PDF Local');
  });

  it('extrai capítulos de um EPUB reflowable válido e confirma API do epub.js', () => {
    const epubBytes = createSyntheticEpubBytes();
    const result = extractEpubSpike(epubBytes);

    expect(result.epubJsVersionVerified).toBe(true);
    expect(result.title).toBe('Livro Sintético de Teste');
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]?.paragraphs).toEqual([
      'Capítulo 1',
      'Primeiro parágrafo do EPUB local.',
      'Segundo parágrafo do EPUB local.',
    ]);
  });

  it('isola EPUB hostil neutralizando scripts, handlers inline, iframes e recursos externos sem executar código', () => {
    const hostileBytes = createSyntheticEpubBytes({
      includeScriptAndRemote: true,
    });
    const win = globalThis as Record<string, unknown>;
    delete win.__EPUB_SCRIPT_EXECUTED__;
    delete win.__EPUB_HANDLER_EXECUTED__;
    delete win.__EPUB_IMG_ERROR__;
    delete win.__EPUB_JS_LINK__;

    const result = extractEpubSpike(hostileBytes);

    // Nenhum script ou handler pode ter sido executado
    expect(win.__EPUB_SCRIPT_EXECUTED__).toBeUndefined();
    expect(win.__EPUB_HANDLER_EXECUTED__).toBeUndefined();
    expect(win.__EPUB_IMG_ERROR__).toBeUndefined();
    expect(win.__EPUB_JS_LINK__).toBeUndefined();

    // Ameaças foram detectadas e removidas no documento inerte
    expect(result.blockedThreats).toContain('tag:script');
    expect(result.blockedThreats).toContain('tag:iframe');
    expect(result.blockedThreats).toContain('tag:link');
    expect(result.blockedThreats).toContain('attr:onload');
    expect(result.blockedThreats).toContain('attr:onclick');
    expect(result.blockedThreats).toContain('attr:onerror');

    // O texto legítimo do capítulo permanece extraível
    expect(result.chapters[0]?.paragraphs).toContain(
      'Texto legítimo do primeiro parágrafo.',
    );
    expect(result.chapters[0]?.paragraphs).toContain(
      'Segundo parágrafo preservado sem execução.',
    );
  });

  it('rejeita EPUB com path traversal, DRM, fixed-layout ou expansão acima do limite', () => {
    const traversalBytes = createSyntheticEpubBytes({
      includePathTraversal: true,
    });
    expect(() => extractEpubSpike(traversalBytes)).toThrowError(AppError);

    const drmBytes = createSyntheticEpubBytes({ includeDrm: true });
    try {
      extractEpubSpike(drmBytes);
      expect.fail('Deveria rejeitar DRM');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('DRM_UNSUPPORTED');
    }

    const fixedLayoutBytes = createSyntheticEpubBytes({
      includeFixedLayout: true,
    });
    try {
      extractEpubSpike(fixedLayoutBytes);
      expect.fail('Deveria rejeitar fixed-layout');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('FIXED_LAYOUT_UNSUPPORTED');
    }

    // Limite de bytes descompactados durante o stream de descompressão
    const validBytes = createSyntheticEpubBytes();
    try {
      extractEpubSpike(validBytes, { maxUncompressedBytes: 50 });
      expect.fail('Deveria rejeitar excesso de bytes descomprimidos');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('LIMIT_EXCEEDED');
    }
  });
});
