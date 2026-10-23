import { expect, test, type Page } from '@playwright/test';

/**
 * Substitui a Web Speech API por uma versão determinística: uma voz local e uma
 * online; "falar" emite onstart, um evento de fronteira por palavra (a cada 250 ms) e onend.
 */
async function installFakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const voices = [
      { voiceURI: 'local-pt', name: 'Microsoft Teste - Portuguese (Brazil)', lang: 'pt-BR', localService: true, default: true },
      { voiceURI: 'online-pt', name: 'Google português do Brasil', lang: 'pt-BR', localService: false, default: false },
    ];
    const spoken: string[] = [];
    let timers: number[] = [];
    let current: FakeUtterance | null = null;

    class FakeUtterance {
      text: string;
      voice: unknown = null;
      lang = '';
      rate = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onboundary: ((e: { name: string; charIndex: number }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    const synth = {
      getVoices: () => voices,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      speak(u: FakeUtterance) {
        current = u;
        spoken.push(u.text);
        const starts: number[] = [];
        u.text.replace(/\S+/g, (_m: string, offset: number) => {
          starts.push(offset);
          return _m;
        });
        timers.push(window.setTimeout(() => u.onstart?.(), 0));
        starts.forEach((charIndex, i) => {
          timers.push(window.setTimeout(() => u.onboundary?.({ name: 'word', charIndex }), 10 + i * 250));
        });
        timers.push(window.setTimeout(() => {
          if (current === u) u.onend?.();
        }, 20 + starts.length * 250));
      },
      cancel() {
        timers.forEach((t) => window.clearTimeout(t));
        timers = [];
        const u = current;
        current = null;
        u?.onerror?.({ error: 'interrupted' });
      },
    };

    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
  });
}

const TEXT = 'Primeira frase para ouvir com calma. Segunda frase continua a leitura em voz alta. Terceira frase encerra o teste.';

test.describe('Modo Ouvir — leitura acompanhada por voz local', () => {
  test('lista só vozes locais, a fala conduz o destaque e parar leva o cursor à última palavra falada', async ({
    page,
  }) => {
    await installFakeSpeech(page);
    await page.goto('/library');
    await page.getByTestId('empty-state-add-text-btn').click();
    await page.getByTestId('paste-content-textarea').fill(TEXT);
    await page.getByTestId('prepare-text-btn').click();
    await page.getByTestId('confirm-save-library-btn').click();
    await page.locator('[data-testid^="open-reader-btn-"]').first().click();

    await page.getByTestId('listen-open-btn').click();
    const select = page.getByTestId('listen-voice-select');
    await expect(select.locator('option')).toHaveCount(1);
    await expect(select).toContainText('Teste (pt-BR)');
    await expect(select).not.toContainText('Google');

    await page.getByTestId('listen-start-btn').click();
    await expect(page.getByTestId('listen-status')).toBeVisible();
    // A Leitura Guiada acompanha a fala: o destaque avança sozinho
    const activeIndex = () =>
      page.getByTestId('guided-active-token').getAttribute('data-token-index').then(Number);
    await expect.poll(activeIndex, { timeout: 3_000 }).toBeGreaterThanOrEqual(1);
    // Passa para a segunda frase (índice 6 = "Segunda") sem intervenção
    await expect.poll(activeIndex, { timeout: 6_000 }).toBeGreaterThanOrEqual(6);

    // Fala em trechos de uma frase
    const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
    expect(spoken[0]).toBe('Primeira frase para ouvir com calma.');

    await page.getByTestId('listen-stop-btn').click();
    await expect(page.getByTestId('listen-status')).toHaveCount(0);
    // Cursor de leitura sincronizado com a última palavra falada (frase 2 em diante)
    const position = await page.getByTestId('rsvp-cursor-position').textContent();
    expect(Number(/Palavra (\d+)/.exec(position ?? '')?.[1])).toBeGreaterThanOrEqual(7);
  });

  test('clicar numa palavra durante a fala recomeça dali; Espaço para a voz', async ({ page }) => {
    await installFakeSpeech(page);
    await page.goto('/library');
    await page.getByTestId('empty-state-add-text-btn').click();
    await page.getByTestId('paste-content-textarea').fill(TEXT);
    await page.getByTestId('prepare-text-btn').click();
    await page.getByTestId('confirm-save-library-btn').click();
    await page.locator('[data-testid^="open-reader-btn-"]').first().click();

    await page.getByTestId('listen-open-btn').click();
    await page.getByTestId('listen-start-btn').click();
    await expect(page.getByTestId('guided-active-token')).toBeVisible();
    await page.getByTestId('guided-token-15').click(); // "Terceira"
    await expect
      .poll(() => page.getByTestId('guided-active-token').getAttribute('data-token-index').then(Number), {
        timeout: 3_000,
      })
      .toBeGreaterThanOrEqual(15);

    await page.keyboard.press('Space');
    await expect(page.getByTestId('listen-status')).toHaveCount(0);
    const position = await page.getByTestId('rsvp-cursor-position').textContent();
    expect(Number(/Palavra (\d+)/.exec(position ?? '')?.[1])).toBeGreaterThanOrEqual(16);
  });
});
