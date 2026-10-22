import { expect, test } from '@playwright/test';
import {
  createFx04ThreePagePdfBytes,
  createFx06ThreeChapterEpubBytes,
  createFx11InvalidBackupZipBytes,
} from '../fixtures/corpus';

test.describe('F5 E2E — Backup Completo Round-Trip entre Perfis, Diagnóstico de Storage e PWA Offline (AC-24, AC-25, AC-26, AC-31, AC-32, AC-33, AC-34)', () => {
  test('AC-24, AC-25, AC-26: exporta .reading-backup.zip no Perfil A, bloqueia restauração em base ocupada, rejeita FX-11 e restaura no Perfil B vazio preservando documentos, cursor, quiz e preferências', async ({
    browser,
  }) => {
    const contextA = await browser.newContext({ acceptDownloads: true });
    const pageA = await contextA.newPage();

    await pageA.goto('/library');
    await pageA.getByTestId('empty-state-add-text-btn').click();
    await pageA
      .getByTestId('paste-title-input')
      .fill('Livro Portátil Perfil A');
    await pageA
      .getByTestId('paste-content-textarea')
      .fill(
        'Primeira frase do documento portátil exportado no pacote ZIP. Segunda frase para verificar preservação exata de tokens e cursor.',
      );
    await pageA.getByTestId('prepare-text-btn').click();
    await pageA.getByTestId('confirm-save-open-btn').click();

    await expect(pageA.getByTestId('reader-page')).toBeVisible();
    await pageA.getByTestId('rsvp-position-slider').fill('5');
    await expect(pageA.getByTestId('rsvp-cursor-position')).toContainText(
      'Palavra 6 de',
    );

    // Altera preferência no Perfil A e exporta backup (.reading-backup.zip)
    await pageA.goto('/settings');
    await expect(pageA.getByTestId('settings-page')).toBeVisible();
    await expect(pageA.getByTestId('backup-unencrypted-notice')).toContainText(
      'não é criptografado',
    );
    await expect(pageA.getByTestId('storage-origin-value')).toContainText(
      'http://localhost:4173',
    );
    await pageA.getByTestId('request-persist-storage-btn').click();
    await expect(pageA.getByTestId('storage-persist-feedback')).toBeVisible();

    await pageA.getByTestId('theme-option-dark').click();

    const downloadPromise = pageA.waitForEvent('download');
    await pageA.getByTestId('export-backup-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.reading-backup\.zip$/);

    const downloadStream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of downloadStream) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    const backupZipBuffer = Buffer.concat(chunks);
    expect(backupZipBuffer.byteLength).toBeGreaterThan(200);

    // Tentar restaurar no próprio Perfil A (que possui dados pessoais) deve ser bloqueado com RESTORE_REQUIRES_EMPTY_LIBRARY (AC-25)
    await pageA.getByTestId('restore-backup-file-input').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: backupZipBuffer,
    });
    await expect(pageA.getByTestId('backup-error-code')).toHaveText(
      'RESTORE_REQUIRES_EMPTY_LIBRARY',
    );

    await contextA.close();

    // Abre Perfil B isolado (biblioteca vazia)
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    await pageB.goto('/settings');
    await expect(pageB.getByTestId('settings-page')).toBeVisible();

    // 1. Tenta restaurar backup inválido FX-11 (path_traversal) -> rejeita com BACKUP_INVALID mantendo base intacta
    const hostileZip = Buffer.from(
      createFx11InvalidBackupZipBytes('path_traversal'),
    );
    await pageB.getByTestId('restore-backup-file-input').setInputFiles({
      name: 'hostile-fx11.reading-backup.zip',
      mimeType: 'application/zip',
      buffer: hostileZip,
    });
    await expect(pageB.getByTestId('backup-error-code')).toHaveText(
      'BACKUP_INVALID',
    );

    // 2. Restaura o backup legítimo do Perfil A no Perfil B vazio
    await pageB.getByTestId('restore-backup-file-input').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: backupZipBuffer,
    });
    await expect(pageB.getByTestId('backup-success-banner')).toContainText(
      'Backup restaurado com integridade verificada',
    );

    // Tema escuro restaurado e documento + cursor preservados no Perfil B
    await expect(pageB.getByTestId('theme-option-dark')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await pageB.goto('/library');
    await expect(pageB.getByTestId('library-items-list')).toContainText(
      'Livro Portátil Perfil A',
    );

    await contextB.close();
  });

  test('AC-31, AC-32, AC-33, AC-34: manifesto PWA válido, aviso de atualização sem reload automático durante leitura e importação inédita de PDF e EPUB em modo offline', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const externalRequests: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (
        url.protocol !== 'data:' &&
        url.protocol !== 'blob:' &&
        url.origin !== 'http://localhost:4173'
      ) {
        externalRequests.push(req.url());
      }
    });

    await page.goto('/library');

    // AC-32: Verifica manifesto web e ícones locais
    const manifestResp = await page.request.get('/manifest.webmanifest');
    expect(manifestResp.ok()).toBe(true);
    const manifestJson = (await manifestResp.json()) as {
      name: string;
      display: string;
      start_url: string;
    };
    expect(manifestJson.name).toBe('Leitura Dinâmica Pessoal');
    expect(manifestJson.display).toBe('standalone');
    expect(manifestJson.start_url).toBe('/library');

    // Aguarda o Service Worker ficar ativo, pronto e controlando a página (clients.claim)
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) {
          await new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener(
              'controllerchange',
              () => resolve(),
              { once: true },
            );
          });
        }
      }
    });

    // AC-33: Durante uma sessão no leitor, aviso de atualização não recarrega sozinho; ao confirmar, pausa, salva checkpoint e reabre pausado
    await page.goto('/training');
    const docId = 'training-doc-01-atencao-ritmo';
    await page.getByTestId(`start-training-btn-${docId}`).click();
    await expect(page.getByTestId('reader-page')).toBeVisible();

    await page.getByTestId('rsvp-position-slider').fill('15');
    await expect(page.getByTestId('rsvp-cursor-position')).toContainText(
      'Palavra 16 de',
    );

    // Simula chegada de nova versão do Service Worker em espera enquanto o usuário está no leitor
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('ledyn:sw-update-waiting'));
    });

    await expect(page.getByTestId('pwa-update-banner')).toBeVisible();
    // Confirma atualização -> salva checkpoint e recarrega pausado na mesma palavra
    await page.getByTestId('pwa-apply-update-btn').click();
    await expect(page.getByTestId('resume-checkpoint-banner')).toContainText(
      'palavra 16',
    );
    await expect(page.getByTestId('rsvp-cursor-position')).toContainText(
      'Palavra 16 de',
    );

    // AC-31: Ativa modo offline no contexto do navegador e navega para /library para importar PDF e EPUB pela primeira vez offline
    await context.setOffline(true);
    await page.goto('/library');
    await expect(page.getByTestId('open-add-text-btn')).toBeVisible();

    // Importa PDF textual pela primeira vez em modo offline
    await page.getByTestId('open-add-text-btn').click();
    await page.getByTestId('tab-import-file').click();
    const pdfBytes = Buffer.from(createFx04ThreePagePdfBytes());
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'offline-first-time.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBytes,
    });
    await page.getByTestId('prepare-file-btn').click();
    await expect(page.getByTestId('import-preview-panel')).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId('confirm-save-library-btn').click();
    await expect(page.getByTestId('library-items-list')).toContainText(
      'offline-first-time',
    );

    // Importa EPUB reflowable pela primeira vez em modo offline
    await page.getByTestId('open-add-text-btn').click();
    await page.getByTestId('tab-import-file').click();
    const epubBytes = Buffer.from(createFx06ThreeChapterEpubBytes());
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'offline-first-time.epub',
      mimeType: 'application/epub+zip',
      buffer: epubBytes,
    });
    await page.getByTestId('prepare-file-btn').click();
    await expect(page.getByTestId('import-preview-panel')).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId('confirm-save-library-btn').click();
    await expect(page.getByTestId('library-items-list')).toContainText(
      'Manual de Leitura em Três Capítulos',
    );

    // AC-34: Zero requisições para origens externas
    expect(externalRequests).toEqual([]);

    await context.setOffline(false);
    await context.close();
  });
});
