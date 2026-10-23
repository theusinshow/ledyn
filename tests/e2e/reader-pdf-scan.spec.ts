import { expect, test } from '@playwright/test';
import {
  createFx04ThreePagePdfBytes,
  createFx04iPdfWithImageBytes,
} from '../fixtures/corpus';

test.describe('Leitor — Mapa do PDF original (miniatura renderizada + trecho aproximado)', () => {
  test('renderiza a página do PDF em canvas, destaca o trecho, navega por páginas e lê a partir da página escolhida sem rede externa', async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.hostname !== 'localhost' && url.protocol.startsWith('http')) {
        externalRequests.push(req.url());
      }
    });

    await page.goto('/library');
    await page.getByTestId('empty-state-import-file-btn').click();
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'manual-foco-3p.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(createFx04ThreePagePdfBytes()),
    });
    await page.getByTestId('prepare-file-btn').click();
    await page.getByTestId('confirm-save-library-btn').click();
    await page.locator('[data-testid^="open-reader-btn-"]').first().click();

    const panel = page.getByTestId('pdf-scan-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('pdf-scan-page-label')).toContainText('Pág. 1');
    await expect(page.getByTestId('pdf-scan-page-label')).toContainText('/ 3');

    const canvas = page.getByTestId('pdf-scan-canvas');
    await expect(canvas).toHaveAttribute('data-rendered-page', '1');

    // A página foi realmente desenhada: há pixels de tinta (texto suavizado) sobre o fundo branco.
    const inkPixels = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! < 200 && data[i + 1]! < 200 && data[i + 2]! < 200) ink++;
      }
      return ink;
    });
    expect(inkPixels).toBeGreaterThan(200);

    await expect(page.getByTestId('pdf-scan-line-highlight')).toBeVisible();

    // Navegar pelo mapa não altera o cursor de leitura.
    const positionBefore = await page.getByTestId('rsvp-cursor-position').textContent();
    await page.getByTestId('pdf-scan-page-segment-3').click();
    await expect(page.getByTestId('pdf-scan-page-label')).toContainText('Pág. 3');
    await expect(canvas).toHaveAttribute('data-rendered-page', '3');
    await expect(page.getByTestId('pdf-scan-line-highlight')).toHaveCount(0);
    await expect(page.getByTestId('rsvp-cursor-position')).toHaveText(positionBefore!);

    // Ler a partir da página 3 move o cursor (pausado) para o primeiro token dela.
    await page.getByTestId('pdf-scan-read-from-page-btn').click();
    await expect(page.getByTestId('rsvp-cursor-position')).not.toHaveText(positionBefore!);
    await expect(page.getByTestId('rsvp-word-display')).toContainText('Pagina');
    await expect(page.getByTestId('pdf-scan-page-label')).toContainText('Pág. 3');
    await expect(page.getByTestId('pdf-scan-line-highlight')).toBeVisible();

    // Voltar ao trecho atual a partir de outra página.
    await page.getByTestId('pdf-scan-page-segment-1').click();
    await expect(page.getByTestId('pdf-scan-page-label')).toContainText('Pág. 1');
    await page.getByTestId('pdf-scan-follow-btn').click();
    await expect(page.getByTestId('pdf-scan-page-label')).toContainText('Pág. 3');

    expect(externalRequests).toEqual([]);
  });

  test('mostra as imagens do PDF original no mapa (FX-04i)', async ({ page }) => {
    await page.goto('/library');
    await page.getByTestId('empty-state-import-file-btn').click();
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'figura.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(createFx04iPdfWithImageBytes()),
    });
    await page.getByTestId('prepare-file-btn').click();
    await page.getByTestId('confirm-save-library-btn').click();

    // A biblioteca mostra a primeira página real do PDF como capa, com a figura.
    const cover = page.locator('[data-testid^="library-item-cover-"]').first();
    await expect(cover).toHaveAttribute('data-cover-state', 'image');
    const coverImg = cover.locator('img');
    await expect(coverImg).toHaveAttribute('alt', 'Capa de figura');
    const coverRedRatio = await coverImg.evaluate(async (el) => {
      const img = el as HTMLImageElement;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let red = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! > 200 && data[i + 1]! < 60 && data[i + 2]! < 60) red++;
      }
      return red / (c.width * c.height);
    });
    expect(coverRedRatio).toBeGreaterThan(0.04);
    await page.locator('[data-testid^="open-reader-btn-"]').first().click();

    const canvas = page.getByTestId('pdf-scan-canvas');
    await expect(canvas).toHaveAttribute('data-rendered-page', '1');
    const redPixels = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let red = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! > 200 && data[i + 1]! < 60 && data[i + 2]! < 60) red++;
      }
      return red / (c.width * c.height);
    });
    // Imagem ocupa 240x160 de 612x792 pt (~7,9% da página).
    expect(redPixels).toBeGreaterThan(0.05);
  });

  test('não exibe o mapa para texto colado', async ({ page }) => {
    await page.goto('/library');
    await page.getByTestId('empty-state-add-text-btn').click();
    await page.getByTestId('paste-content-textarea').fill(
      'Texto colado simples para verificar que o mapa de PDF não aparece neste formato de documento.',
    );
    await page.getByTestId('prepare-text-btn').click();
    await page.getByTestId('confirm-save-library-btn').click();
    await expect(
      page.locator('[data-testid^="library-item-cover-"]').first(),
    ).toHaveAttribute('data-cover-state', 'placeholder');
    await page.locator('[data-testid^="open-reader-btn-"]').first().click();
    await expect(page.getByTestId('reader-page')).toBeVisible();
    await expect(page.getByTestId('pdf-scan-panel')).toHaveCount(0);
  });
});
