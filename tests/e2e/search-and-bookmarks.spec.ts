import { expect, test, type Page } from '@playwright/test';

const TEXT = [
  'A atenção sustentada é o primeiro passo da leitura dinâmica.',
  'Com prática diária, o ritmo melhora sem perder a compreensão.',
  '',
  'Revise a ATENCAO antes de acelerar: compreensão vem antes da velocidade.',
].join('\n');

async function openText(page: Page) {
  await page.goto('/library');
  await page.getByTestId('empty-state-add-text-btn').click();
  await page.getByTestId('paste-content-textarea').fill(TEXT);
  await page.getByTestId('prepare-text-btn').click();
  await page.getByTestId('confirm-save-library-btn').click();
  await page.locator('[data-testid^="open-reader-btn-"]').first().click();
  await expect(page.getByTestId('rsvp-word-display')).toBeVisible();
}

test.describe('Busca no documento e marcadores', () => {
  test('busca ignora acentos/maiúsculas, mostra os trechos e leva o cursor ao resultado', async ({ page }) => {
    await openText(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    const dialog = page.getByTestId('search-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('search-input').fill('atencao');
    await expect(page.getByTestId('search-count')).toContainText('2 resultados');
    await page.getByTestId('search-result-1').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('rsvp-word-display')).toHaveText('ATENCAO');

    await page.getByTestId('search-open-btn').click();
    await page.getByTestId('search-input').fill('inexistente');
    await expect(page.getByTestId('search-no-results')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('search-dialog')).toHaveCount(0);
  });

  test('marca com M, anota, navega, persiste após recarregar e some ao excluir o documento', async ({ page }) => {
    await openText(page);
    const slider = page.getByTestId('rsvp-position-slider');
    await slider.fill('3'); // "é"
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('m');
    await expect(page.getByTestId('bookmark-item-3')).toBeVisible();
    await expect(page.getByTestId('bookmarks-count')).toHaveText('1');
    // M no mesmo ponto não duplica
    await page.keyboard.press('m');
    await expect(page.getByTestId('bookmarks-count')).toHaveText('1');

    await page.getByTestId('bookmark-note-edit-3').click();
    await page.getByTestId('bookmark-note-input-3').fill('Conceito central do capítulo');
    await page.getByTestId('bookmark-note-save-3').click();
    await expect(page.getByTestId('bookmark-note-3')).toHaveText('Conceito central do capítulo');

    await slider.fill('15');
    await page.getByTestId('bookmark-go-3').click();
    await expect(page.getByTestId('rsvp-cursor-position')).toContainText('Palavra 4 ');

    await page.reload();
    await expect(page.getByTestId('bookmark-note-3')).toHaveText('Conceito central do capítulo');

    const download = page.waitForEvent('download');
    await page.getByTestId('bookmarks-export-btn').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/marcadores\.md$/);

    await page.getByTestId('reader-exit-library-btn').click();
    await page.locator('[data-testid^="start-delete-btn-"]').first().click();
    await page.locator('[data-testid^="confirm-delete-btn-"]').first().click();
    const remaining = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const req = indexedDB.open('ledyn-local-db');
          req.onsuccess = () => {
            const countReq = req.result.transaction('bookmarks').objectStore('bookmarks').count();
            countReq.onsuccess = () => resolve(countReq.result);
          };
        }),
    );
    expect(remaining).toBe(0);
  });
});
