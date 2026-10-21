import { expect, test } from '@playwright/test';
import {
  createFx03TxtWithBomBytes,
  createFx04ThreePagePdfBytes,
  createFx05ScannedEmptyPdfBytes,
  createFx06ThreeChapterEpubBytes,
  createSyntheticEpubBytes,
} from '../fixtures/corpus';

test.describe('F2 — Fluxo E2E Real de Importadores (.txt, .pdf, .epub), Isolamento de EPUB Hostil e Gestão da Biblioteca', () => {
  test('AC-03 e AC-28: importa arquivo .txt UTF-8 com BOM, exibe prévia real, salva, busca, renomeia e exclui transacionalmente', async ({
    page,
  }) => {
    await page.goto('/library');
    await expect(page.getByTestId('library-empty-state')).toBeVisible();

    // Abrir importador de arquivo a partir do estado vazio
    await page.getByTestId('empty-state-import-file-btn').click();
    await expect(page.getByTestId('file-picker-input')).toBeVisible();

    const txtBytes = createFx03TxtWithBomBytes();
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'ensaio-cognitivo-fx03.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(txtBytes),
    });

    await page.getByTestId('prepare-file-btn').click();

    // Prévia deve abrir com formato TXT e tokens extraídos
    await expect(page.getByTestId('import-preview-panel')).toBeVisible();
    await expect(page.getByTestId('preview-format-badge')).toContainText('TXT');
    const tokenCountText = await page.getByTestId('preview-token-count').textContent();
    expect(Number(tokenCountText?.replace(/\D/g, ''))).toBeGreaterThan(10);

    // Salvar apenas na biblioteca
    await page.getByTestId('confirm-save-library-btn').click();
    await expect(page.getByTestId('library-items-list')).toBeVisible();
    await expect(page.getByText('ensaio-cognitivo-fx03')).toBeVisible();

    // Testar busca na biblioteca
    await page.getByTestId('library-search-input').fill('inexistente-xyz');
    await expect(page.getByTestId('library-empty-state')).toBeVisible();
    await page.getByTestId('library-search-input').fill('ensaio');
    await expect(page.getByText('ensaio-cognitivo-fx03')).toBeVisible();
    await page.getByTestId('library-search-input').fill('');

    // Testar renomeação
    const renameBtn = page.locator('[data-testid^="start-rename-btn-"]').first();
    await renameBtn.click();
    const renameInput = page.locator('[data-testid^="rename-input-"]').first();
    await renameInput.fill('Ensaio Cognitivo Renomeado');
    await page.locator('[data-testid^="confirm-rename-"]').first().click();
    await expect(page.getByText('Ensaio Cognitivo Renomeado')).toBeVisible();

    // Testar exclusão transacional
    await page.locator('[data-testid^="start-delete-btn-"]').first().click();
    await page.locator('[data-testid^="confirm-delete-btn-"]').first().click();
    await expect(page.getByTestId('library-empty-state')).toBeVisible();
  });

  test('AC-04: importa PDF textual de 3 páginas (FX-04), navega por páginas na prévia, detecta duplicata por SHA-256 e rejeita PDF escaneado (FX-05)', async ({
    page,
  }) => {
    await page.goto('/library');
    await page.getByTestId('empty-state-import-file-btn').click();

    const pdfBytes = createFx04ThreePagePdfBytes();
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'manual-foco-3p.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBytes),
    });
    await page.getByTestId('prepare-file-btn').click();

    await expect(page.getByTestId('import-preview-panel')).toBeVisible();
    await expect(page.getByTestId('preview-format-badge')).toContainText('PDF');

    // Verificar navegação pelas 3 páginas na prévia
    await expect(page.getByTestId('preview-section-nav')).toBeVisible();
    await expect(page.getByTestId('preview-text-sample')).toContainText(
      'Pagina um introducao clara do documento',
    );

    await page.getByTestId('preview-next-section-btn').click();
    await expect(page.getByTestId('preview-text-sample')).toContainText(
      'Pagina dois desenvolvimento das ideias',
    );

    await page.getByTestId('preview-next-section-btn').click();
    await expect(page.getByTestId('preview-text-sample')).toContainText(
      'Pagina tres conclusao final verificavel',
    );

    // Salvar na biblioteca
    await page.getByTestId('confirm-save-library-btn').click();
    await expect(page.getByTestId('library-items-list')).toBeVisible();

    // Reimportar o mesmo PDF e verificar detecção de duplicata por hash SHA-256
    await page.getByTestId('open-add-text-btn').click();
    await page.getByTestId('tab-import-file').click();
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'copia-manual-foco-3p.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBytes),
    });
    await page.getByTestId('prepare-file-btn').click();

    await expect(page.getByTestId('duplicate-document-notice')).toBeVisible();
    await expect(page.getByTestId('open-existing-duplicate-btn')).toBeVisible();

    // Escolher outro arquivo e testar PDF escaneado sem camada de texto (FX-05) -> deve exibir erro claro
    await page.getByTestId('choose-another-file-btn').click();
    const scannedPdfBytes = createFx05ScannedEmptyPdfBytes();
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'digitalizado-sem-ocr.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(scannedPdfBytes),
    });
    await page.getByTestId('prepare-file-btn').click();

    await expect(page.getByTestId('draft-error-alert')).toBeVisible();
    await expect(page.getByTestId('draft-error-alert')).toContainText(
      'Este PDF não possui texto selecionável. OCR não está incluído nesta versão.',
    );
  });

  test('AC-05: importa EPUB reflow (FX-06) e bloqueia scripts, handlers e rede externa em EPUB hostil (FX-07) no navegador real', async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (
        !url.startsWith('http://localhost:4173') &&
        !url.startsWith('data:') &&
        !url.startsWith('blob:')
      ) {
        externalRequests.push(url);
      }
    });

    await page.goto('/library');
    await page.getByTestId('empty-state-import-file-btn').click();

    // 1. Importar EPUB reflowable de 3 capítulos (FX-06)
    const epubValidBytes = createFx06ThreeChapterEpubBytes();
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'guia-atencao-fx06.epub',
      mimeType: 'application/epub+zip',
      buffer: Buffer.from(epubValidBytes),
    });
    await page.getByTestId('prepare-file-btn').click();

    await expect(page.getByTestId('import-preview-panel')).toBeVisible();
    await expect(page.getByTestId('preview-format-badge')).toContainText('EPUB');
    await expect(page.getByTestId('preview-text-sample')).toContainText(
      'O primeiro capítulo apresenta o ritmo base de leitura.',
    );

    await page.getByTestId('preview-section-select').selectOption('2');
    await expect(page.getByTestId('preview-text-sample')).toContainText(
      'O terceiro capítulo encerra a obra na ordem exata do spine.',
    );

    // Cancelar prévia para testar o EPUB hostil (FX-07)
    await page.getByTestId('cancel-preview-btn').click();

    // 2. Importar EPUB hostil (FX-07) contendo <script>, onerror, javascript: e https://evil.example.com/beacon.png
    await page.getByTestId('empty-state-import-file-btn').click();
    const epubHostileBytes = createSyntheticEpubBytes({
      includeScriptAndRemote: true,
    });
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'livro-hostil-fx07.epub',
      mimeType: 'application/epub+zip',
      buffer: Buffer.from(epubHostileBytes),
    });
    await page.getByTestId('prepare-file-btn').click();

    await expect(page.getByTestId('import-preview-panel')).toBeVisible();
    await expect(page.getByTestId('preview-warnings-box')).toBeVisible();
    await expect(page.getByTestId('preview-text-sample')).toContainText(
      'Texto legítimo do primeiro parágrafo.',
    );
    await expect(page.getByTestId('preview-text-sample')).not.toContainText(
      '__EPUB_SCRIPT_EXECUTED__',
    );

    // Salvar e abrir no leitor RSVP para garantir que também na leitura nenhum script executa
    await page.getByTestId('confirm-save-open-btn').click();
    await expect(page.getByTestId('reader-page')).toBeVisible();

    const scriptFlag = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__EPUB_SCRIPT_EXECUTED__,
    );
    const handlerFlag = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__EPUB_HANDLER_EXECUTED__,
    );
    expect(scriptFlag).toBeUndefined();
    expect(handlerFlag).toBeUndefined();
    expect(externalRequests).toEqual([]);
  });
});
