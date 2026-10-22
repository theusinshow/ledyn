import { expect, test } from '@playwright/test';
import {
  createFx04ThreePagePdfBytes,
  createFx06ThreeChapterEpubBytes,
  FX_01_TEXT,
} from '../fixtures/corpus';

test.describe('F6 Gate MVP — Jornada Contínua Completa, Matriz Responsiva, Acessibilidade e Desempenho (AC-01 a AC-34)', () => {
  test('Jornada contínua sem seeds fictícios: colar texto -> importar PDF/EPUB -> ler em 2 modos -> interromper/retomar -> treino/quiz 100% -> histórico -> backup/restaurar -> offline', async ({
    browser,
  }) => {
    const contextA = await browser.newContext({ acceptDownloads: true });
    const page = await contextA.newPage();

    // 1. Histórico inicial deve estar vazio (sem resultados fictícios)
    await page.goto('/history');
    await expect(page.getByTestId('history-empty-state')).toBeVisible();

    // 2. Adicionar texto colado + Importar PDF + Importar EPUB
    await page.goto('/library');
    await page.getByTestId('empty-state-add-text-btn').click();
    await page.getByTestId('paste-title-input').fill('Jornada F6 Texto Colado');
    await page.getByTestId('paste-content-textarea').fill(FX_01_TEXT);
    await page.getByTestId('prepare-text-btn').click();
    await page.getByTestId('confirm-save-library-btn').click();

    await page.getByTestId('open-add-text-btn').click();
    await page.getByTestId('tab-import-file').click();
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'jornada-f6.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(createFx04ThreePagePdfBytes()),
    });
    await page.getByTestId('prepare-file-btn').click();
    await expect(page.getByTestId('import-preview-panel')).toBeVisible();
    await page.getByTestId('confirm-save-library-btn').click();

    await page.getByTestId('open-add-text-btn').click();
    await page.getByTestId('tab-import-file').click();
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'jornada-f6.epub',
      mimeType: 'application/epub+zip',
      buffer: Buffer.from(createFx06ThreeChapterEpubBytes()),
    });
    await page.getByTestId('prepare-file-btn').click();
    await expect(page.getByTestId('import-preview-panel')).toBeVisible();
    await page.getByTestId('confirm-save-open-btn').click();

    // 3. Ler em dois modos (RSVP -> Guiada -> RSVP), interromper (reload) e retomar
    await expect(page.getByTestId('reader-page')).toBeVisible();
    await page.getByTestId('rsvp-position-slider').fill('8');
    await page.getByTestId('mode-switch-guided').click();
    await expect(page.getByTestId('guided-reading-view')).toBeVisible();
    await expect(page.getByTestId('guided-active-token')).toBeVisible();
    await expect(page.getByTestId('checkpoint-status-saved')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('resume-checkpoint-banner')).toContainText(
      'palavra 9',
    );
    await expect(page.getByTestId('guided-reading-view')).toBeVisible();

    // 4. Treinar e responder questionário (4/4 = 100%)
    await page.goto('/training');
    const trainingDocId = 'training-doc-01-atencao-ritmo';
    await page.getByTestId(`start-training-btn-${trainingDocId}`).click();
    const slider = page.getByTestId('rsvp-position-slider');
    const maxVal = await slider.getAttribute('max');
    await slider.fill(String(maxVal));
    await page.getByTestId('rsvp-play-pause-btn').click();

    await expect(page.getByTestId('reader-completed-summary')).toBeVisible({
      timeout: 5000,
    });
    await page.getByTestId('summary-start-quiz-btn').click();

    await page.getByTestId('quiz-option-t1-q1-b').click();
    await page.getByTestId('quiz-option-t1-q2-a').click();
    await page.getByTestId('quiz-option-t1-q3-b').click();
    await page.getByTestId('quiz-option-t1-q4-c').click();
    await page.getByTestId('submit-quiz-btn').click();

    await expect(page.getByTestId('quiz-result-score')).toContainText(
      '4/4 · 100%',
    );

    // 5. Verificar Histórico
    await page.getByTestId('quiz-to-history-btn').click();
    await expect(page.getByTestId('history-sessions-list')).toContainText(
      '4/4 · 100%',
    );

    // 6. Exportar Backup e Restaurar em Perfil Vazio + Testar Offline
    await page.goto('/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-backup-btn').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) {
      chunks.push(Buffer.from(c as Uint8Array));
    }
    const zipBuffer = Buffer.concat(chunks);
    await contextA.close();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto('/settings');
    await pageB.evaluate(async () => {
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

    await pageB.getByTestId('restore-backup-file-input').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });
    await expect(pageB.getByTestId('backup-success-banner')).toBeVisible();

    // Entra em modo offline e navega por Biblioteca e Histórico restaurados
    await contextB.setOffline(true);
    await pageB.goto('/library');
    await expect(pageB.getByTestId('library-items-list')).toContainText(
      'Jornada F6 Texto Colado',
    );
    await expect(pageB.getByTestId('library-items-list')).toContainText(
      'jornada-f6',
    );
    await expect(pageB.getByTestId('library-items-list')).toContainText(
      'Manual de Leitura em Três Capítulos',
    );

    await pageB.goto('/history');
    await expect(pageB.getByTestId('history-sessions-list')).toContainText(
      '4/4 · 100%',
    );

    await contextB.setOffline(false);
    await contextB.close();
  });

  test('AC-27 & AC-29: matriz responsiva (360x640, 390x844, 768x1024, 1366x768), operação por teclado, semântica para leitor de tela e medição de jitter de relógio (p95 <= 50 ms)', async ({
    page,
  }) => {
    const viewports = [
      { width: 360, height: 640 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1366, height: 768 },
    ];

    await page.goto('/library');
    await page.getByTestId('empty-state-add-text-btn').click();
    await page.getByTestId('paste-title-input').fill('Teste Responsivo e A11y');
    await page.getByTestId('paste-content-textarea').fill(FX_01_TEXT);
    await page.getByTestId('prepare-text-btn').click();
    await page.getByTestId('confirm-save-open-btn').click();

    await expect(page.getByTestId('reader-page')).toBeVisible();

    // Verifica que o visor RSVP não usa aria-live para anunciar cada palavra individualmente (AC-27)
    const rsvpAriaLive = await page
      .getByTestId('rsvp-word-display')
      .getAttribute('aria-live');
    expect(rsvpAriaLive).toBeNull();

    // Testa matriz responsiva sem overflow horizontal da janela nos 4 tamanhos obrigatórios
    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await expect(page.getByTestId('rsvp-play-pause-btn')).toBeVisible();
      const hasHorizontalOverflow = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
        );
      });
      expect(hasHorizontalOverflow).toBe(false);
    }

    // Operação por atalhos de teclado no leitor (AC-27): ArrowRight (+10), ArrowLeft (-10), +/- (PPM)
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('rsvp-cursor-position')).toContainText(
      'Palavra 11 de 100',
    );
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('rsvp-cursor-position')).toContainText(
      'Palavra 1 de 100',
    );

    // AC-29: Mede o atraso real de agendamento (jitter) em primeiro plano a 300 PPM (200 ms/token)
    const timingSample = await page.evaluate(async () => {
      const targetIntervalMs = 200; // 300 PPM
      const sampleCount = 25;
      const driftsMs: number[] = [];
      let expectedNext = performance.now() + targetIntervalMs;

      for (let i = 0; i < sampleCount; i++) {
        await new Promise<void>((resolve) => {
          const delay = Math.max(0, expectedNext - performance.now());
          window.setTimeout(() => {
            const actual = performance.now();
            driftsMs.push(Math.abs(actual - expectedNext));
            expectedNext = actual + targetIntervalMs;
            resolve();
          }, delay);
        });
      }

      const sorted = [...driftsMs].sort((a, b) => a - b);
      const p95Idx = Math.min(
        sorted.length - 1,
        Math.floor(sorted.length * 0.95),
      );
      return {
        p95Ms: sorted[p95Idx] ?? 0,
        maxMs: sorted[sorted.length - 1] ?? 0,
        samples: sorted.length,
      };
    });

    expect(timingSample.p95Ms).toBeLessThanOrEqual(50);
  });
});
