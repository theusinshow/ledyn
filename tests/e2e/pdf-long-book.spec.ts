import { expect, test } from '@playwright/test';
import { createFx04LongBookPdfBytes } from '../fixtures/corpus';

test.describe('PDF longo — livro de 600 páginas', () => {
  test.setTimeout(240_000);

  test('importa um PDF textual de 600 páginas, salva e abre no leitor com o mapa da página', async ({
    page,
  }) => {
    const bytes = createFx04LongBookPdfBytes(600);

    await page.goto('/library');
    await page.getByTestId('empty-state-import-file-btn').click();
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'livro-600-paginas.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(bytes),
    });

    // Mede a maior pausa entre quadros (interface travada) durante a importação.
    await page.evaluate(() => {
      const w = window as unknown as { __maxFrameGap: number; __stopFrames: boolean };
      w.__maxFrameGap = 0;
      w.__stopFrames = false;
      let last = performance.now();
      const tick = (now: number) => {
        w.__maxFrameGap = Math.max(w.__maxFrameGap, now - last);
        last = now;
        if (!w.__stopFrames) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    const startedAt = Date.now();
    await page.getByTestId('prepare-file-btn').click();
    await expect(page.getByTestId('import-preview-panel')).toBeVisible({ timeout: 200_000 });
    const extractMs = Date.now() - startedAt;
    const maxFrameGapMs = await page.evaluate(() => {
      const w = window as unknown as { __maxFrameGap: number; __stopFrames: boolean };
      w.__stopFrames = true;
      return Math.round(w.__maxFrameGap);
    });

    await page.getByTestId('confirm-save-library-btn').click();
    await expect(page.getByTestId('library-items-list')).toBeVisible({ timeout: 60_000 });
    const savedMs = Date.now() - startedAt;
    await expect(
      page.locator('[data-testid^="library-item-cover-"]').first(),
    ).toHaveAttribute('data-cover-state', 'image', { timeout: 30_000 });
    const coverMs = Date.now() - startedAt;

    await page.locator('[data-testid^="open-reader-btn-"]').first().click();
    await expect(page.getByTestId('rsvp-cursor-position')).toContainText('de 181200', { timeout: 60_000 });
    await expect(page.getByTestId('pdf-scan-page-label')).toContainText('/ 600');
    const openedMs = Date.now() - startedAt;

    console.log(`[FX-04L] maior travamento da interface durante a importação: ${maxFrameGapMs} ms`);
    console.log(`[FX-04L] extração+prévia ${extractMs} ms · salvo ${savedMs} ms · capa ${coverMs} ms · leitor aberto ${openedMs} ms`);
  });
});
