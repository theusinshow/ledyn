import { expect, test, type Page } from '@playwright/test';

const TEXT = [
  'A leitura extraordinariamente concentrada depende de foco, ritmo e compreensão.',
  'Cada palavra aparece sozinha no mesmo ponto da tela.',
  '',
  'Um novo parágrafo começa aqui, com outra ideia importante para o leitor atento.',
].join('\n');

async function openPastedText(page: Page) {
  await page.goto('/library');
  await page.getByTestId('empty-state-add-text-btn').click();
  await page.getByTestId('paste-content-textarea').fill(TEXT);
  await page.getByTestId('prepare-text-btn').click();
  await page.getByTestId('confirm-save-library-btn').click();
  await page.locator('[data-testid^="open-reader-btn-"]').first().click();
  await expect(page.getByTestId('rsvp-word-display')).toBeVisible();
}

async function focalCenterX(page: Page): Promise<number> {
  const box = await page.getByTestId('rsvp-focal-letter').boundingBox();
  return box!.x + box!.width / 2;
}

test.describe('RSVP — precisão de leitura (ORP fixo, parágrafo e retomada)', () => {
  test('a letra de foco fica na mesma coluna da tela para palavras de comprimentos diferentes', async ({
    page,
  }) => {
    await openPastedText(page);
    const slider = page.getByTestId('rsvp-position-slider');
    const positions: number[] = [];
    // Índices com palavras de 1, 7, 19 e 11 letras: "A", "leitura", "extraordinariamente", "compreensão."
    for (const index of [0, 1, 2, 9]) {
      await slider.fill(String(index));
      await expect(page.getByTestId('rsvp-cursor-position')).toContainText(`Palavra ${index + 1} `);
      positions.push(await focalCenterX(page));
    }
    const spread = Math.max(...positions) - Math.min(...positions);
    // Tolerância de meio caractere: a largura da própria letra varia (ex.: "i" vs "m").
    expect(spread).toBeLessThan(12);
  });

  test('sinaliza o início de um novo parágrafo', async ({ page }) => {
    await openPastedText(page);
    const slider = page.getByTestId('rsvp-position-slider');
    await slider.fill('5');
    await expect(page.getByTestId('rsvp-paragraph-cue')).toHaveCount(0);
    // "Um" é o primeiro token do segundo parágrafo (após 19 tokens do primeiro).
    await slider.fill('19');
    await expect(page.getByTestId('rsvp-word-display')).toHaveText('Um');
    await expect(page.getByTestId('rsvp-paragraph-cue')).toBeVisible();
  });

  test('pausar e retomar volta ao início da frase atual com aviso discreto', async ({ page }) => {
    await openPastedText(page);
    const slider = page.getByTestId('rsvp-position-slider');
    // "Cada" (índice 10, palavra 11) inicia a 2ª frase; posicionar no meio dela.
    await slider.fill('15');
    await page.getByTestId('rsvp-play-pause-btn').click();
    await page.getByTestId('rsvp-play-pause-btn').click(); // pausa (sessão)
    await expect(page.getByTestId('rsvp-play-pause-btn')).toContainText('Iniciar');
    await page.getByTestId('rsvp-play-pause-btn').click(); // retoma
    await expect(page.getByTestId('rsvp-resume-rewind-hint')).toBeVisible();
    await page.getByTestId('rsvp-play-pause-btn').click();
    const position = await page.getByTestId('rsvp-cursor-position').textContent();
    const current = Number(/Palavra (\d+)/.exec(position ?? '')?.[1]);
    // Voltou para o início da frase ("Cada" = palavra 11), não ficou em 16+.
    expect(current).toBeGreaterThanOrEqual(11);
    expect(current).toBeLessThan(16);
  });
});
