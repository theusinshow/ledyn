import { expect, test, type Page } from '@playwright/test';
import {
  createFx04ThreePagePdfBytes,
  createFx04oOutlinePdfBytes,
  createFx06ThreeChapterEpubBytes,
} from '../fixtures/corpus';

async function importAndOpen(
  page: Page,
  file: { name: string; mimeType: string; bytes: Uint8Array },
) {
  await page.goto('/library');
  await page.getByTestId('empty-state-import-file-btn').click();
  await page.getByTestId('file-picker-input').setInputFiles({
    name: file.name,
    mimeType: file.mimeType,
    buffer: Buffer.from(file.bytes),
  });
  await page.getByTestId('prepare-file-btn').click();
  await page.getByTestId('confirm-save-library-btn').click();
  await page.locator('[data-testid^="open-reader-btn-"]').first().click();
  await expect(page.getByTestId('reader-page')).toBeVisible();
}

test.describe('Leitor — sumário e capítulos', () => {
  test('PDF com sumário: lista os capítulos do outline, navega e marca o capítulo atual', async ({
    page,
  }) => {
    await importAndOpen(page, {
      name: 'manual-com-sumario.pdf',
      mimeType: 'application/pdf',
      bytes: createFx04oOutlinePdfBytes(),
    });

    const panel = page.getByTestId('chapter-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('chapter-item-0')).toHaveText('Introducao');
    await expect(page.getByTestId('chapter-item-1')).toHaveText('Desenvolvimento');
    await expect(page.getByTestId('chapter-item-2')).toHaveText('Conclusao');
    await expect(page.getByTestId('chapter-item-0')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('chapter-position-label')).toContainText('1');

    await page.getByTestId('chapter-item-2').click();
    await expect(page.getByTestId('rsvp-word-display')).toHaveText('Conclusao');
    await expect(page.getByTestId('chapter-item-2')).toHaveAttribute('aria-current', 'true');
    // O mapa acompanha o cursor para a página 3
    await expect(page.getByTestId('pdf-scan-page-label')).toContainText('Pág. 3');
  });

  test('PDF sem sumário embutido: avisa e mantém o mapa de páginas', async ({ page }) => {
    await importAndOpen(page, {
      name: 'sem-sumario.pdf',
      mimeType: 'application/pdf',
      bytes: createFx04ThreePagePdfBytes(),
    });
    await expect(page.getByTestId('chapter-panel-empty')).toContainText('não tem sumário');
    await expect(page.getByTestId('pdf-scan-panel')).toBeVisible();
  });

  test('EPUB: um capítulo por item do spine, com o título do capítulo', async ({ page }) => {
    await importAndOpen(page, {
      name: 'manual-tres-capitulos.epub',
      mimeType: 'application/epub+zip',
      bytes: createFx06ThreeChapterEpubBytes(),
    });
    await expect(page.getByTestId('chapter-item-0')).toContainText('Capítulo 1: Fundamentos');
    await expect(page.locator('[data-testid^="chapter-item-"]')).toHaveCount(3);
    await page.getByTestId('chapter-item-1').click();
    await expect(page.getByTestId('chapter-item-1')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('pdf-scan-panel')).toHaveCount(0);
  });
});
