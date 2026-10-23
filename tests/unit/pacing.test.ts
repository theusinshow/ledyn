import { describe, expect, it } from 'vitest';
import type { Token, TokenBoundary } from '@/domain/contracts';
import { VirtualClock } from '@/domain/reading/clock';
import { ReadingEngine } from '@/domain/reading/engine';
import {
  calculateTokenDurationMs,
  findSentenceStartIndex,
  wordLengthFactor,
} from '@/domain/reading/metrics';

describe('Ritmo inteligente — duração por pontuação, comprimento e rampa', () => {
  it('mantém a pausa mínima absoluta em velocidades altas e o multiplicador em velocidades baixas', () => {
    const sentence = { boundary: 'sentence' as const, text: 'fim.' };
    // 600 PPM: base 100 ms; 2× daria só +100 ms, a pausa mínima garante +500 ms
    expect(calculateTokenDurationMs(sentence, 600, true)).toBe(600);
    // 100 PPM: base 600 ms; o multiplicador (+600 ms) supera o mínimo de 500 ms
    expect(calculateTokenDurationMs(sentence, 100, true)).toBe(1200);
    // Parágrafo a 600 PPM: +750 ms mínimos
    expect(
      calculateTokenDurationMs({ boundary: 'paragraph', text: 'fim.' }, 600, true),
    ).toBe(850);
    // Vírgula a 600 PPM: +150 ms mínimos (antes seriam só +50 ms)
    expect(
      calculateTokenDurationMs({ boundary: 'clause', text: 'isso,' }, 600, true),
    ).toBe(250);
  });

  it('dá mais tempo para palavras longas e números, ignorando pontuação na contagem', () => {
    expect(wordLengthFactor('casa,')).toBe(1);
    expect(wordLengthFactor('“leitura”')).toBe(1);
    expect(wordLengthFactor('compreensão')).toBe(1.15); // 11 letras
    expect(wordLengthFactor('extraordinariamente')).toBe(1.3); // 19 letras
    expect(wordLengthFactor('2026')).toBe(1.3);
    expect(wordLengthFactor('3,14')).toBe(1.3);
    expect(
      calculateTokenDurationMs({ boundary: 'none', text: 'compreensão' }, 300, true),
    ).toBeCloseTo(230);
    // Desligado: comprimento não altera nada (relógio determinístico do AC-06)
    expect(
      calculateTokenDurationMs({ boundary: 'none', text: 'compreensão' }, 300, false),
    ).toBe(200);
  });

  it('aplica a rampa apenas à parte da palavra, não à pausa', () => {
    expect(
      calculateTokenDurationMs({ boundary: 'none', text: 'casa' }, 300, true, 1.6),
    ).toBeCloseTo(320);
    expect(
      calculateTokenDurationMs({ boundary: 'sentence', text: 'casa.' }, 300, true, 1.6),
    ).toBeCloseTo(820);
  });

  it('encontra o início da frase com recuo limitado', () => {
    const b: TokenBoundary[] = ['none', 'none', 'sentence', 'none', 'clause', 'none', 'none'];
    expect(findSentenceStartIndex(b, 6)).toBe(3);
    expect(findSentenceStartIndex(b, 3)).toBe(3);
    expect(findSentenceStartIndex(b, 1)).toBe(0);
    // Frase mais longa que o recuo máximo: volta só até o limite
    const long: TokenBoundary[] = Array.from({ length: 40 }, () => 'none');
    expect(findSentenceStartIndex(long, 35, 25)).toBe(10);
  });
});

function makeTokens(spec: Array<[string, TokenBoundary]>): Token[] {
  let offset = 0;
  return spec.map(([text, boundary], index) => {
    const token: Token = {
      index,
      text,
      start: offset,
      end: offset + text.length,
      blockId: 'b0',
      boundary,
    };
    offset += text.length + 1;
    return token;
  });
}

describe('Motor — retomada no início da frase e rampa (ritmo inteligente)', () => {
  const tokens = makeTokens([
    ['Primeira', 'none'],
    ['frase.', 'sentence'],
    ['Segunda', 'none'],
    ['frase', 'none'],
    ['longa', 'none'],
    ['aqui.', 'sentence'],
  ]);

  it('pausa manual + retomar volta ao início da frase atual e informa o recuo', () => {
    const clock = new VirtualClock();
    const engine = new ReadingEngine({
      clock,
      contentVersionId: 'v1',
      tokens,
      initialWpm: 300,
      initialCursorIndex: 4,
    });
    engine.play();
    engine.pause('manual');
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(4);
    engine.play();
    const snap = engine.getSnapshot();
    expect(snap.cursor.tokenIndex).toBe(2);
    expect(snap.resumeRewindTokens).toBe(2);
    engine.destroy();
  });

  it('retomada após recarga e seek explícito não recuam', () => {
    const clock = new VirtualClock();
    // Recarga: motor novo com cursor salvo e sem motivo de pausa da sessão
    const engine = new ReadingEngine({
      clock,
      contentVersionId: 'v1',
      tokens,
      initialWpm: 300,
      initialCursorIndex: 4,
    });
    engine.play();
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(4);
    engine.seek(3);
    engine.play();
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(3);
    expect(engine.getSnapshot().resumeRewindTokens).toBe(0);
    engine.destroy();
  });

  it('com ritmo inteligente desligado, retomar continua no mesmo token e sem rampa', () => {
    const clock = new VirtualClock();
    const engine = new ReadingEngine({
      clock,
      contentVersionId: 'v1',
      tokens,
      initialWpm: 300,
      initialCursorIndex: 4,
      initialPunctuationPauseEnabled: false,
    });
    engine.play();
    engine.pause('manual');
    engine.play();
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(4);
    clock.advanceBy(200);
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(5);
    engine.destroy();
  });

  it('rampa: as primeiras palavras após iniciar duram 1,6× / 1,4× / 1,2× / 1,1× e depois 1×', () => {
    const plain = makeTokens(
      Array.from({ length: 8 }, (): [string, TokenBoundary] => ['palavra', 'none']),
    );
    const clock = new VirtualClock();
    const engine = new ReadingEngine({
      clock,
      contentVersionId: 'v1',
      tokens: plain,
      initialWpm: 300,
    });
    engine.play();
    const expected = [320, 280, 240, 220, 200, 200];
    for (const [i, ms] of expected.entries()) {
      clock.advanceBy(ms - 1);
      expect(engine.getSnapshot().cursor.tokenIndex).toBe(i);
      clock.advanceBy(1);
      expect(engine.getSnapshot().cursor.tokenIndex).toBe(i + 1);
    }
    engine.destroy();
  });
});
