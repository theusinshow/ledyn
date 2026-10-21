import { expect, test } from '@playwright/test';

test.describe('F1 — Fluxo Real no Navegador: Texto Colado, RSVP, Persistência, Recarga e Conflito de Abas', () => {
  test('AC-01, AC-08, AC-11, AC-15: colar texto -> prévia -> salvar -> ler em RSVP -> pausar -> recarregar -> retomar pausado -> concluir', async ({
    page,
  }) => {
    await page.goto('/library');

    // 1. Estado vazio inicial
    await expect(page.getByTestId('library-empty-state')).toBeVisible();

    // 2. Abrir painel de colar texto
    await page.getByTestId('empty-state-add-text-btn').click();
    await expect(page.getByTestId('prepare-text-btn')).toBeDisabled();

    // Preencher título e texto com 15 palavras
    const words = Array.from({ length: 15 }, (_, i) => `termo${i + 1}`).join(
      ' ',
    );
    await page.getByTestId('paste-title-input').fill('Artigo E2E F1');
    await page.getByTestId('paste-content-textarea').fill(words);

    // 3. Conferir prévia
    await page.getByTestId('prepare-text-btn').click();
    await expect(page.getByTestId('import-preview-panel')).toBeVisible();
    await expect(page.getByTestId('preview-token-count')).toHaveText('15');
    await expect(page.getByTestId('preview-block-count')).toHaveText('1');

    // 4. Salvar localmente e abrir no leitor RSVP pausado
    await page.getByTestId('confirm-save-open-btn').click();
    await expect(page.getByTestId('reader-page')).toBeVisible();
    await expect(page.getByTestId('reader-document-title')).toHaveText(
      'Artigo E2E F1',
    );
    await expect(page.getByTestId('rsvp-word-display')).toHaveText('termo1');
    await expect(page.getByTestId('rsvp-play-pause-btn')).toContainText(
      'Iniciar',
    );

    // 5. Avançar +10 palavras manualmente (pausado) e confirmar checkpoint salvo
    await page.getByTestId('rsvp-forward-10-btn').click();
    await expect(page.getByTestId('rsvp-word-display')).toHaveText('termo11');
    await expect(page.getByTestId('rsvp-cursor-position')).toContainText(
      'Palavra 11 de 15',
    );
    await expect(page.getByTestId('checkpoint-status-saved')).toBeVisible();

    // 6. Recarregar a página e verificar retomada sempre pausada no ponto salvo (termo11)
    await page.reload();
    await expect(page.getByTestId('reader-page')).toBeVisible();
    await expect(page.getByTestId('rsvp-play-pause-btn')).toContainText(
      'Iniciar',
    );
    await expect(page.getByTestId('rsvp-word-display')).toHaveText('termo11');
    await expect(page.getByTestId('resume-checkpoint-banner')).toContainText(
      'palavra 11 de 15',
    );

    // 7. Ajustar velocidade para 600 PPM (100 ms por palavra), iniciar leitura e concluir os 5 tokens restantes
    await page.getByTestId('rsvp-wpm-input').fill('600');
    await page.getByTestId('rsvp-play-pause-btn').click();

    await expect(page.getByTestId('reader-completed-summary')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('summary-presented-count')).toHaveText('5');
    await expect(page.getByTestId('partial-coverage-notice')).toBeVisible();

    // 8. Voltar à biblioteca e verificar que o item consta como Concluído (100%)
    await page.getByTestId('summary-to-library-btn').click();
    await expect(page.getByTestId('library-items-list')).toBeVisible();
    await expect(page.getByText('Concluído')).toBeVisible();
  });

  test('AC-02, AC-08, AC-09 e RNF-02: cancelamento na prévia, atalhos de teclado no leitor e viewport móvel 360x800 sem overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/library');

    // Cancelar na prévia não adiciona documento na biblioteca
    await page.getByTestId('empty-state-add-text-btn').click();
    await page.getByTestId('paste-content-textarea').fill('Texto que será cancelado na prévia.');
    await page.getByTestId('prepare-text-btn').click();
    await expect(page.getByTestId('import-preview-panel')).toBeVisible();
    await page.getByTestId('cancel-preview-btn').click();
    await expect(page.getByTestId('library-empty-state')).toBeVisible();

    // Adicionar documento real e testar atalhos de teclado
    await page.getByTestId('empty-state-add-text-btn').click();
    const twentyWords = Array.from({ length: 20 }, (_, i) => `item${i + 1}`).join(' ');
    await page.getByTestId('paste-title-input').fill('Teste Teclado e Mobile');
    await page.getByTestId('paste-content-textarea').fill(twentyWords);
    await page.getByTestId('prepare-text-btn').click();
    await page.getByTestId('confirm-save-open-btn').click();

    await expect(page.getByTestId('reader-page')).toBeVisible();

    // Garantir ausência de overflow horizontal em 360x800
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);

    // Atalhos '+' e '-' ajustam velocidade em passos de 25 PPM (padrão 250 -> 275 -> 250)
    await page.keyboard.press('+');
    await expect(page.getByTestId('rsvp-wpm-input')).toHaveValue('275');
    await page.keyboard.press('-');
    await expect(page.getByTestId('rsvp-wpm-input')).toHaveValue('250');

    // Seta direita avança 10 palavras pausado (item1 -> item11)
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('rsvp-word-display')).toHaveText('item11');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('rsvp-word-display')).toHaveText('item1');
  });

  test('AC-16: bloqueia reprodução simultânea em duas abas da mesma origem', async ({
    context,
  }) => {
    const pageA = await context.newPage();
    await pageA.goto('/library');

    await pageA.getByTestId('empty-state-add-text-btn').click();
    const longWords = Array.from(
      { length: 80 },
      (_, i) => `palavra${i + 1}`,
    ).join(' ');
    await pageA.getByTestId('paste-title-input').fill('Texto Conflito Abas');
    await pageA.getByTestId('paste-content-textarea').fill(longWords);
    await pageA.getByTestId('prepare-text-btn').click();
    await pageA.getByTestId('confirm-save-open-btn').click();

    await expect(pageA.getByTestId('reader-page')).toBeVisible();
    const readerUrl = pageA.url();

    // Abrir segunda aba (pageB) no mesmo documento
    const pageB = await context.newPage();
    await pageB.goto(readerUrl);
    await expect(pageB.getByTestId('reader-page')).toBeVisible();

    // Iniciar reprodução na Aba A
    await pageA.getByTestId('rsvp-play-pause-btn').click();
    await expect(pageA.getByTestId('rsvp-play-pause-btn')).toContainText(
      'Pausar',
    );

    // Tentar iniciar reprodução na Aba B enquanto Aba A está reproduzindo
    await pageB.getByTestId('rsvp-play-pause-btn').click();
    await expect(pageB.getByTestId('tab-conflict-alert')).toBeVisible();
    await expect(pageB.getByTestId('rsvp-play-pause-btn')).toContainText(
      'Iniciar',
    );

    // Pausar Aba A libera o lease, permitindo que Aba B inicie posteriormente
    await pageA.getByTestId('rsvp-play-pause-btn').click();
    await expect(pageA.getByTestId('rsvp-play-pause-btn')).toContainText(
      'Iniciar',
    );

    await pageB.getByTestId('rsvp-play-pause-btn').click();
    await expect(pageB.getByTestId('rsvp-play-pause-btn')).toContainText(
      'Pausar',
    );
    await pageB.getByTestId('rsvp-play-pause-btn').click();
  });
});
