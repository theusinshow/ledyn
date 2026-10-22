import { expect, test } from '@playwright/test';

test.describe('F3 — Leitura Guiada, Alternância de Modo, Layout Responsivo e Preferências (AC-12, AC-13, AC-14, AC-27, AC-30)', () => {
  test('AC-12 e AC-13: alterna RSVP <-> Guiada no token 37 preservando cursor após recarga, clique em palavra e pausa por rolagem manual', async ({
    page,
  }) => {
    await page.goto('/library');
    await expect(page.getByTestId('library-empty-state')).toBeVisible();

    await page.getByTestId('empty-state-add-text-btn').click();
    const paragraphs: string[] = [];
    for (let p = 0; p < 6; p++) {
      const words = Array.from({ length: 15 }, (_, w) => {
        const idx = p * 15 + w;
        if (idx === 37) {
          return 'atenção-crítica!';
        }
        return `termo${String(idx + 1).padStart(3, '0')}`;
      });
      paragraphs.push(words.join(' '));
    }

    await page.getByTestId('paste-title-input').fill('Documento E2E F3 Guiado');
    await page
      .getByTestId('paste-content-textarea')
      .fill(paragraphs.join('\n\n'));
    await page.getByTestId('prepare-text-btn').click();
    await page.getByTestId('confirm-save-open-btn').click();

    await expect(page.getByTestId('reader-page')).toBeVisible();

    // Avançar para o índice 37 (Palavra 38 de 90): 3 cliques em +10 (= índice 30) e slider para 37
    await page.getByTestId('rsvp-position-slider').fill('37');
    await expect(page.getByTestId('rsvp-cursor-position')).toContainText(
      'Palavra 38 de 90',
    );
    await expect(page.getByTestId('rsvp-word-display')).toHaveText(
      'atenção-crítica!',
    );

    // Alternar RSVP -> Guiada -> RSVP -> Guiada
    await page.getByTestId('mode-switch-guided').click();
    await expect(page.getByTestId('guided-reading-view')).toBeVisible();
    await expect(page.getByTestId('guided-active-token')).toHaveText(
      'atenção-crítica!',
    );
    await expect(page.getByTestId('guided-active-token')).toHaveAttribute(
      'data-token-index',
      '37',
    );

    await page.getByTestId('mode-switch-rsvp').click();
    await expect(page.getByTestId('rsvp-word-display')).toHaveText(
      'atenção-crítica!',
    );

    await page.getByTestId('mode-switch-guided').click();
    await expect(page.getByTestId('guided-active-token')).toHaveAttribute(
      'data-token-index',
      '37',
    );
    await expect(page.getByTestId('checkpoint-status-saved')).toBeVisible();

    // Recarregar a página e confirmar que reabre pausado em modo Guiada no token 37
    await page.reload();
    await expect(page.getByTestId('guided-reading-view')).toBeVisible();
    await expect(page.getByTestId('rsvp-play-pause-btn')).toContainText(
      'Iniciar',
    );
    await expect(page.getByTestId('guided-active-token')).toHaveAttribute(
      'data-token-index',
      '37',
    );
    await expect(page.getByTestId('guided-active-token')).toHaveText(
      'atenção-crítica!',
    );

    // Clicar na palavra de índice 12 (termo013) reposiciona o cursor pausado
    await page.getByTestId('guided-token-12').click();
    await expect(page.getByTestId('guided-active-token')).toHaveAttribute(
      'data-token-index',
      '12',
    );
    await expect(page.getByTestId('rsvp-cursor-position')).toContainText(
      'Palavra 13 de 90',
    );

    // Iniciar reprodução no modo guiado e rolar manualmente para pausar
    await page.getByTestId('rsvp-play-pause-btn').click();
    await expect(page.getByTestId('rsvp-play-pause-btn')).toContainText(
      'Pausar',
    );

    await page
      .getByTestId('guided-scroll-container')
      .dispatchEvent('wheel', { deltaY: 160 });

    await expect(page.getByTestId('rsvp-play-pause-btn')).toContainText(
      'Iniciar',
    );
    await expect(
      page.getByTestId('manual-scroll-paused-banner'),
    ).toBeVisible();
    await expect(
      page.getByTestId('guided-return-to-cursor-btn'),
    ).toBeVisible();

    // Clicar em "Voltar ao ponto de leitura" mantém pausado e oculta o botão de descolamento
    await page.getByTestId('guided-return-to-cursor-btn').click();
    await expect(
      page.getByTestId('guided-return-to-cursor-btn'),
    ).toBeHidden();
  });

  test('AC-14: viewports 360x800, 768x1024, 1440x900, rotação, ajuste de fonte e texto longo com janela limitada de DOM', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/library');

    // Criar texto longo com 3.000 palavras em 60 parágrafos (> limite de janela de 1.200 tokens no DOM)
    const longParagraphs = Array.from({ length: 60 }, (_, p) =>
      Array.from(
        { length: 50 },
        (__, w) => `vocabulo${String(p * 50 + w + 1).padStart(4, '0')}`,
      ).join(' '),
    ).join('\n\n');

    await page.getByTestId('empty-state-add-text-btn').click();
    await page
      .getByTestId('paste-title-input')
      .fill('Texto Longo 3000 Palavras');
    await page.getByTestId('paste-content-textarea').fill(longParagraphs);
    await page.getByTestId('prepare-text-btn').click();
    await page.getByTestId('confirm-save-open-btn').click();

    await expect(page.getByTestId('reader-page')).toBeVisible();
    await page.getByTestId('rsvp-position-slider').fill('25');
    await page.getByTestId('mode-switch-guided').click();

    await expect(page.getByTestId('guided-window-navigation')).toBeVisible();

    // Confirmar que o DOM não monta as 3.000 palavras de uma só vez (limite <= 1.200)
    const domTokenCount = await page
      .locator('[data-token-index]')
      .count();
    expect(domTokenCount).toBeGreaterThan(0);
    expect(domTokenCount).toBeLessThanOrEqual(1200);

    // Alterar tamanho da fonte no modo guiado (20px -> 24px) e verificar que o cursor continua no token 25
    await page.getByTestId('guided-font-increase-btn').click();
    await page.getByTestId('guided-font-increase-btn').click();
    await expect(page.getByTestId('guided-font-size-value')).toHaveText('24px');
    await expect(page.getByTestId('guided-active-token')).toHaveAttribute(
      'data-token-index',
      '25',
    );

    // Testar viewports 768x1024, 360x800 e rotação 800x360 sem perder o cursor e sem overflow horizontal
    for (const vp of [
      { width: 768, height: 1024 },
      { width: 360, height: 800 },
      { width: 800, height: 360 },
    ]) {
      await page.setViewportSize(vp);
      const hasOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(hasOverflow).toBe(false);
      await expect(page.getByTestId('guided-active-token')).toHaveAttribute(
        'data-token-index',
        '25',
      );
    }
  });

  test('AC-30: salva preferências no Dexie (tema, PPM, pontuação, fonte guiada e movimento reduzido), persiste após recarga e não usa localStorage', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-page')).toBeVisible();

    // Alterar tema para Escuro
    await page.getByTestId('theme-option-dark').click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Alterar fonte guiada para 26 px
    await page.getByTestId('settings-guided-font-size').fill('26');
    await page.getByTestId('save-guided-font-size-btn').click();
    await expect(page.getByTestId('settings-font-preview')).toContainText(
      '26px',
    );

    // Ativar movimento reduzido
    await page.getByTestId('settings-reduced-motion-toggle').click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-reduced-motion',
      'true',
    );

    // Alterar velocidade padrão para 350 PPM e desligar pausas de pontuação
    await page.getByTestId('settings-default-wpm').fill('350');
    await page.getByTestId('save-default-wpm-btn').click();
    await expect(page.getByTestId('settings-status-banner')).toContainText(
      '350 PPM',
    );
    await page.getByTestId('settings-punctuation-toggle').click();
    await expect(page.getByTestId('settings-punctuation-toggle')).toHaveText(
      'Desligadas',
    );

    // Recarregar a página e verificar persistência exclusiva no IndexedDB
    await page.reload();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('html')).toHaveAttribute(
      'data-reduced-motion',
      'true',
    );
    await expect(page.getByTestId('settings-guided-font-size')).toHaveValue(
      '26',
    );
    await expect(page.getByTestId('settings-default-wpm')).toHaveValue('350');
    await expect(page.getByTestId('settings-punctuation-toggle')).toHaveText(
      'Desligadas',
    );

    const localStorageCount = await page.evaluate(
      () => window.localStorage.length,
    );
    expect(localStorageCount).toBe(0);
  });
});
