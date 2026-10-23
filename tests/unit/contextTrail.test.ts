import { describe, expect, it } from 'vitest';
import type { Token, TokenBoundary } from '@/domain/contracts';
import { buildContextTrail } from '@/domain/reading/contextTrail';
import { VirtualClock } from '@/domain/reading/clock';
import { ReadingEngine } from '@/domain/reading/engine';
import { calculateTokenDurationMs } from '@/domain/reading/metrics';

function makeTokens(spec: Array<[string, TokenBoundary]>): Token[] {
  let offset = 0;
  return spec.map(([text, boundary], index) => {
    const t: Token = { index, text, start: offset, end: offset + text.length, blockId: 'b', boundary };
    offset += text.length + 1;
    return t;
  });
}

const tokens = makeTokens([
  ['Primeira', 'none'], ['frase.', 'sentence'],
  ['Segunda', 'none'], ['frase.', 'sentence'],
  ['Terceira', 'none'], ['agora', 'none'], ['aqui.', 'sentence'],
]);

describe('Trilha de contexto do RSVP', () => {
  it('mostra a frase anterior e o início da frase atual até a palavra exibida', () => {
    expect(buildContextTrail(tokens, 0)).toBe('');
    expect(buildContextTrail(tokens, 1)).toBe('Primeira');
    expect(buildContextTrail(tokens, 5)).toBe('Segunda frase. Terceira');
    expect(buildContextTrail(tokens, 4)).toBe('Segunda frase.');
  });

  it('recorta pelo começo para manter as palavras mais recentes', () => {
    const trail = buildContextTrail(tokens, 6, 16);
    expect(trail.startsWith('…')).toBe(true);
    expect(trail.endsWith('Terceira agora')).toBe(true);
  });

  it('tem custo limitado mesmo em textos enormes (olha no máximo 200 tokens para trás)', () => {
    const big = makeTokens(Array.from({ length: 300_000 }, () => ['palavra', 'none'] as [string, TokenBoundary]));
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) buildContextTrail(big, 299_000 + i);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('Ajuste fino do ritmo', () => {
  it('usa as pausas mínimas configuradas no lugar das padrão', () => {
    const custom = { clause: 300, sentence: 900, paragraph: 1500 };
    expect(calculateTokenDurationMs({ boundary: 'clause', text: 'isso,' }, 300, true, 1, custom)).toBe(500);
    expect(calculateTokenDurationMs({ boundary: 'sentence', text: 'fim.' }, 300, true, 1, custom)).toBe(1100);
    expect(calculateTokenDurationMs({ boundary: 'paragraph', text: 'fim.' }, 300, true, 1, custom)).toBe(1700);
    // Pausa zero: vale o multiplicador (frase 2× → +200 ms a 300 PPM)
    const zero = { clause: 0, sentence: 0, paragraph: 0 };
    expect(calculateTokenDurationMs({ boundary: 'sentence', text: 'fim.' }, 300, true, 1, zero)).toBe(400);
  });

  it('com a volta ao início da frase desligada, retomar continua na mesma palavra', () => {
    const clock = new VirtualClock();
    const engine = new ReadingEngine({
      clock, contentVersionId: 'v', tokens, initialWpm: 300, initialCursorIndex: 5,
      initialPacing: { rewindOnResume: false },
    });
    engine.play();
    engine.pause('manual');
    engine.play();
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(5);
    expect(engine.getSnapshot().resumeRewindTokens).toBe(0);
    engine.setPacing({ rewindOnResume: true });
    engine.pause('manual');
    engine.play();
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(4);
    engine.destroy();
  });
});
