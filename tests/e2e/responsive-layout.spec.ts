import { expect, test, type Page } from '@playwright/test';
import { createFx04oOutlinePdfBytes } from '../fixtures/corpus';

/**
 * Guarda de responsividade: com dados reais (títulos longos, sessão no histórico),
 * nenhuma tela pode ficar mais larga que a viewport. No celular isso faz o navegador
 * reduzir o zoom da página inteira — foi assim que um filtro do Histórico quebrou o layout.
 */
async function assertNoHorizontalOverflow(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const vw = window.innerWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1) {
        offenders.push(`${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? ''}] right=${Math.round(r.right)}`);
      }
    }
    return { vw, docW: document.documentElement.scrollWidth, offenders: offenders.slice(0, 5) };
  });
  expect(result.docW, `${label}: largura do documento (${result.offenders.join(', ')})`).toBeLessThanOrEqual(result.vw);
  expect(result.offenders, `${label}: elementos além da viewport`).toEqual([]);
}

const LONG_TITLE_TEXT =
  'Um texto pessoal com um titulo propositalmente muito longo para testar quebras de linha em todas as telas do aplicativo. ' +
  'Segunda frase para dar corpo ao documento e gerar uma sessao de leitura real no historico.';

for (const viewport of [
  { width: 360, height: 740, name: 'celular 360' },
  { width: 768, height: 1024, name: 'tablet 768' },
]) {
  test(`sem rolagem horizontal em nenhuma tela — ${viewport.name}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.width < 600,
      hasTouch: viewport.width < 600,
    });
    const page = await context.newPage();

    await page.goto('/library');
    await assertNoHorizontalOverflow(page, 'biblioteca vazia');

    // PDF com sumário (mapa + capítulos) e texto colado com título longo
    await page.getByTestId('empty-state-import-file-btn').click();
    await page.getByTestId('file-picker-input').setInputFiles({
      name: 'Manual com sumario e capitulos de nome bem comprido.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(createFx04oOutlinePdfBytes()),
    });
    await page.getByTestId('prepare-file-btn').click();
    await expect(page.getByTestId('import-preview-panel')).toBeVisible();
    await assertNoHorizontalOverflow(page, 'prévia de importação');
    await page.getByTestId('confirm-save-library-btn').click();

    await page.getByTestId('open-add-text-btn').click();
    await page.getByTestId('tab-paste-text').click();
    await page.getByTestId('paste-content-textarea').fill(LONG_TITLE_TEXT);
    await page.getByTestId('prepare-text-btn').click();
    await page.getByTestId('confirm-save-library-btn').click();
    await expect(page.getByTestId('library-items-list')).toBeVisible();
    await assertNoHorizontalOverflow(page, 'biblioteca com itens');

    // Leitor do PDF: RSVP, Guiada, Ouvir e busca
    await page.locator('[data-testid^="open-reader-btn-"]').last().click();
    await expect(page.getByTestId('pdf-scan-panel')).toBeVisible();
    await assertNoHorizontalOverflow(page, 'leitor RSVP');
    await page.getByTestId('mode-switch-guided').click();
    await assertNoHorizontalOverflow(page, 'leitor guiado');
    await page.getByTestId('mode-switch-rsvp').click();
    await page.getByTestId('listen-open-btn').click();
    await expect(page.getByTestId('listen-bar')).toBeVisible();
    await assertNoHorizontalOverflow(page, 'barra Ouvir');
    await page.getByTestId('listen-close-btn').click();
    await page.getByTestId('search-open-btn').click();
    await page.getByTestId('search-input').fill('metodo');
    await assertNoHorizontalOverflow(page, 'busca');
    await page.keyboard.press('Escape');

    // Gera uma sessão real no texto de título longo
    await page.getByTestId('reader-exit-library-btn').click();
    await page.locator('[data-testid^="open-reader-btn-"]').first().click();
    await page.getByTestId('rsvp-play-pause-btn').click();
    await page.waitForTimeout(1_200);
    await page.getByTestId('rsvp-play-pause-btn').click();
    await assertNoHorizontalOverflow(page, 'leitor de texto colado');

    for (const route of ['/training', '/history', '/settings']) {
      await page.goto(route);
      await page.waitForTimeout(400);
      await assertNoHorizontalOverflow(page, route);
    }

    await context.close();
  });
}
