import { expect, test, type Page } from '@playwright/test';

const TEXT = [
  'Primeira frase curta para o teste.',
  'Segunda frase continua o raciocínio com calma.',
  'Terceira frase encerra o parágrafo de exemplo.',
].join(' ');

async function openText(page: Page) {
  await page.goto('/library');
  await page.getByTestId('empty-state-add-text-btn').click();
  await page.getByTestId('paste-content-textarea').fill(TEXT);
  await page.getByTestId('prepare-text-btn').click();
  await page.getByTestId('confirm-save-library-btn').click();
  await page.locator('[data-testid^="open-reader-btn-"]').first().click();
  await expect(page.getByTestId('rsvp-word-display')).toBeVisible();
}

test.describe('Modo foco, trilha de contexto e ajuste fino do ritmo', () => {
  test('modo foco abre pelo botão e pela tecla F, lê, some com os controles parado e fecha com Esc pausado', async ({
    page,
  }) => {
    await openText(page);
    await page.getByTestId('focus-mode-btn').click();
    const overlay = page.getByTestId('focus-mode-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.getByTestId('rsvp-word-display')).toHaveText('Primeira');

    await page.getByTestId('focus-play-pause-btn').click();
    // Trilha de contexto aparece enquanto toca
    await expect(overlay.getByTestId('rsvp-context-trail')).toBeVisible({ timeout: 5_000 });
    // Sem mexer o mouse, os controles somem
    await expect(page.getByTestId('focus-mode-controls')).toHaveAttribute('data-hidden', 'true', { timeout: 5_000 });
    await page.mouse.move(200, 200);
    await expect(page.getByTestId('focus-mode-controls')).toHaveAttribute('data-hidden', 'false');

    await page.keyboard.press('Escape'); // tocando: pausa
    await expect(page.getByTestId('focus-play-pause-btn')).toContainText('Iniciar');
    await page.keyboard.press('Escape'); // pausado: sai
    await expect(overlay).toHaveCount(0);

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('f');
    await expect(page.getByTestId('focus-mode-overlay')).toBeVisible();
    await page.getByTestId('focus-exit-btn').click();
    await expect(page.getByTestId('focus-mode-overlay')).toHaveCount(0);
  });

  test('ajuste fino: pausas e opções salvam, persistem após recarregar e voltam ao padrão', async ({ page }) => {
    await page.goto('/settings');
    const sentence = page.getByTestId('pacing-pauseSentenceMs');
    await sentence.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('pacing-pauseSentenceMs-value')).toHaveText('600 ms');
    await page.getByTestId('pacing-context-trail-toggle').click();
    await expect(page.getByTestId('pacing-context-trail-toggle')).toHaveAttribute('aria-pressed', 'false');

    await page.reload();
    await expect(page.getByTestId('pacing-pauseSentenceMs-value')).toHaveText('600 ms');
    await expect(page.getByTestId('pacing-context-trail-toggle')).toHaveAttribute('aria-pressed', 'false');

    // Trilha desligada não aparece no leitor
    await openText(page);
    await page.getByTestId('rsvp-play-pause-btn').click();
    await page.waitForTimeout(1_200);
    await expect(page.getByTestId('rsvp-context-trail')).toHaveCount(0);
    await page.getByTestId('rsvp-play-pause-btn').click();

    await page.goto('/settings');
    await page.getByTestId('pacing-reset-btn').click();
    await expect(page.getByTestId('pacing-pauseSentenceMs-value')).toHaveText('500 ms');
    await expect(page.getByTestId('pacing-context-trail-toggle')).toHaveAttribute('aria-pressed', 'true');
  });
});
