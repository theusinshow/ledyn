import { expect, test } from '@playwright/test';

test.describe('Histórico — painel de evolução com sessões reais', () => {
  test('sem leitura não mostra o painel; após ler alguns segundos mostra tempo, dia seguido e gráficos', async ({
    page,
  }) => {
    await page.goto('/history');
    await expect(page.getByTestId('history-page')).toBeVisible();
    await expect(page.getByTestId('progress-dashboard')).toHaveCount(0);

    await page.goto('/library');
    await page.getByTestId('empty-state-add-text-btn').click();
    await page.getByTestId('paste-content-textarea').fill(
      Array.from({ length: 80 }, (_, i) => `palavra${String.fromCharCode(97 + (i % 26))}`).join(' '),
    );
    await page.getByTestId('prepare-text-btn').click();
    await page.getByTestId('confirm-save-library-btn').click();
    await page.locator('[data-testid^="open-reader-btn-"]').first().click();

    await page.getByTestId('rsvp-play-pause-btn').click();
    await page.waitForTimeout(2_500);
    await page.getByTestId('rsvp-play-pause-btn').click();
    await expect(page.getByTestId('checkpoint-status-saved')).toBeVisible();

    await page.getByTestId('reader-exit-library-btn').click();
    await page.getByRole('link', { name: 'Histórico' }).first().click();

    const dashboard = page.getByTestId('progress-dashboard');
    await expect(dashboard).toBeVisible();
    await expect(page.getByTestId('stat-reading-time-value')).toHaveText(/\d+ s|\d+ min/);
    await expect(page.getByTestId('stat-streak-value')).toHaveText('1');
    // Sessão < 30 s não entra na série de velocidade: o gráfico pede mais sessões, sem inventar ponto.
    await expect(dashboard).toContainText('Leia pelo menos duas sessões');
    await expect(page.getByTestId('daily-bars-chart')).toBeVisible();
  });
});
