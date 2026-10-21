import { describe, expect, it } from 'vitest';
import { normalizeText } from '@/domain/documents/normalizer';
import { tokenizeNormalizedText } from '@/domain/documents/tokenizer';
import { VirtualClock } from '@/domain/reading/clock';
import { ReadingEngine } from '@/domain/reading/engine';
import {
  calculateObservedWpm,
  countUniqueCoveredTokens,
  formatObservedWpm,
} from '@/domain/reading/metrics';
import { AppError } from '@/shared/errors';
import { FX_01_TEXT } from '../fixtures/corpus';

function createFx01Tokens() {
  const norm = normalizeText(FX_01_TEXT);
  return tokenizeNormalizedText(norm.normalizedText, norm.blocks).tokens;
}

describe('Motor de Leitura RSVP e Relógio Determinístico (AC-06 a AC-11 / AC-18)', () => {
  it('AC-06: 100 tokens a 300 PPM sem pausas extras completam exatamente 20.000 ms no relógio de teste', () => {
    const clock = new VirtualClock();
    const tokens = createFx01Tokens();
    expect(tokens).toHaveLength(100);

    const engine = new ReadingEngine({
      clock,
      contentVersionId: 'cv-fx01',
      tokens,
      initialWpm: 300,
      initialPunctuationPauseEnabled: false,
    });

    expect(engine.getSnapshot().status).toBe('ready');
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(0);

    engine.play();
    expect(engine.getSnapshot().status).toBe('playing');
    expect(clock.getActiveTimerCount()).toBe(1);

    // Antes de 200 ms (ex: em 199 ms), o primeiro token ainda está em exposição e não contou como concluído
    clock.advanceBy(199);
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(0);
    expect(engine.getSnapshot().presentedCount).toBe(0);

    // Ao completar 200 ms, o primeiro token é concluído e o cursor avança para 1
    clock.advanceBy(1);
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(1);
    expect(engine.getSnapshot().presentedCount).toBe(1);
    expect(engine.getSnapshot().activeMs).toBe(200);

    // Avançar até 19.999 ms (penúltimo milissegundo do 100º token): o último token recebe duração integral
    clock.advanceBy(19_799);
    expect(engine.getSnapshot().status).toBe('playing');
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(99);
    expect(engine.getSnapshot().presentedCount).toBe(99);

    // Último milissegundo completa os 20.000 ms (20 segundos)
    clock.advanceBy(1);
    const finalSnap = engine.getSnapshot();
    expect(clock.now()).toBe(20_000);
    expect(finalSnap.status).toBe('completed');
    expect(finalSnap.cursor.tokenIndex).toBe(100);
    expect(finalSnap.presentedCount).toBe(100);
    expect(finalSnap.activeMs).toBe(20_000);
    expect(countUniqueCoveredTokens(finalSnap.coverageRanges)).toBe(100);
    expect(calculateObservedWpm(finalSnap.presentedCount, finalSnap.activeMs)).toBe(300);
    expect(clock.getActiveTimerCount()).toBe(0);
  });

  it('AC-07: mantém no máximo um agendamento ativo, invalida callbacks antigos e não salta palavras em atraso leve', () => {
    const clock = new VirtualClock();
    const tokens = createFx01Tokens();
    const engine = new ReadingEngine({
      clock,
      contentVersionId: 'cv-fx01',
      tokens,
      initialWpm: 300,
      initialPunctuationPauseEnabled: false,
    });

    // Sequência rápida de play -> pause -> play -> seek -> play
    engine.play();
    expect(clock.getActiveTimerCount()).toBe(1);
    engine.pause();
    expect(clock.getActiveTimerCount()).toBe(0);
    engine.play();
    expect(clock.getActiveTimerCount()).toBe(1);
    engine.seek(5);
    expect(clock.getActiveTimerCount()).toBe(0);
    engine.play();
    expect(clock.getActiveTimerCount()).toBe(1);

    // Simular atraso moderado de callback (ex: 60 ms de atraso no navegador)
    // Não deve saltar múltiplos tokens para compensar o relógio
    clock.triggerNextWithLag(60);
    const snapAfterLag = engine.getSnapshot();
    expect(snapAfterLag.cursor.tokenIndex).toBe(6);
    expect(snapAfterLag.presentedCount).toBe(1);
    expect(clock.getActiveTimerCount()).toBe(1);

    engine.destroy();
    expect(clock.getActiveTimerCount()).toBe(0);
  });

  it('AC-08: pausar no meio da exposição mantém o cursor e retomar reapresenta o token por duração completa; seek não infla cobertura', () => {
    const clock = new VirtualClock();
    const tokens = createFx01Tokens();
    const engine = new ReadingEngine({
      clock,
      contentVersionId: 'cv-fx01',
      tokens,
      initialWpm: 300,
      initialPunctuationPauseEnabled: false,
    });

    engine.play();
    // Avança 80 ms de uma exposição de 200 ms e pausa
    clock.advanceBy(80);
    engine.pause('manual');

    const pausedSnap = engine.getSnapshot();
    expect(pausedSnap.status).toBe('paused');
    expect(pausedSnap.cursor.tokenIndex).toBe(0);
    expect(pausedSnap.presentedCount).toBe(0);
    expect(pausedSnap.activeMs).toBe(80);

    // Enquanto pausado, o passagem do tempo não altera métricas nem avança cursor
    clock.advanceBy(5_000);
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(0);
    expect(engine.getSnapshot().activeMs).toBe(80);

    // Retomar reapresenta o token 0 por uma duração completa de 200 ms
    engine.play();
    clock.advanceBy(150);
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(0);
    expect(engine.getSnapshot().presentedCount).toBe(0);

    clock.advanceBy(50);
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(1);
    expect(engine.getSnapshot().presentedCount).toBe(1);
    expect(engine.getSnapshot().activeMs).toBe(280);

    // Avançar +10 palavras (seek) pausa e não conta palavras saltadas como apresentadas
    engine.stepBy(10);
    const afterSeek = engine.getSnapshot();
    expect(afterSeek.status).toBe('paused');
    expect(afterSeek.cursor.tokenIndex).toBe(11);
    expect(afterSeek.presentedCount).toBe(1);
    expect(countUniqueCoveredTokens(afterSeek.coverageRanges)).toBe(1);

    // Pular diretamente para o fim não gera cobertura integral falsa
    engine.seek(100);
    const atEnd = engine.getSnapshot();
    expect(atEnd.status).toBe('completed');
    expect(atEnd.presentedCount).toBe(1);
    expect(countUniqueCoveredTokens(atEnd.coverageRanges)).toBe(1);
  });

  it('AC-09: alterar velocidade durante reprodução aplica o novo ritmo na próxima exposição sem truncar a atual', () => {
    const clock = new VirtualClock();
    const tokens = createFx01Tokens();
    const engine = new ReadingEngine({
      clock,
      contentVersionId: 'cv-fx01',
      tokens,
      initialWpm: 250, // 240 ms por token
      initialPunctuationPauseEnabled: false,
    });

    engine.play();
    clock.advanceBy(100);

    // Muda para 300 PPM (200 ms por token) no meio da exposição do token 0
    engine.setWpm(300);
    expect(clock.getActiveTimerCount()).toBe(1);
    expect(engine.getSnapshot().wpm).toBe(300);

    // Aos 200 ms totais (faltando 40 ms da exposição original de 240 ms), token 0 ainda não terminou
    clock.advanceBy(100);
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(0);

    // Aos 240 ms totais, token 0 conclui e token 1 é agendado com o novo ritmo de 200 ms (300 PPM)
    clock.advanceBy(40);
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(1);

    clock.advanceBy(200);
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(2);
    expect(engine.getSnapshot().settingsChanges).toHaveLength(1);
    expect(engine.getSnapshot().settingsChanges[0]?.wpm).toBe(300);

    // Validação de limites 100-800 PPM
    expect(() => engine.setWpm(90)).toThrowError(AppError);
    expect(() => engine.setWpm(850)).toThrowError(AppError);
  });

  it('AC-11 e AC-18: repetição de 10 tokens aumenta apresentações para 110 mantendo cobertura em 100; suspensão longa pausa sem inflar activeMs', () => {
    const clock = new VirtualClock();
    const tokens = createFx01Tokens();
    const engine = new ReadingEngine({
      clock,
      contentVersionId: 'cv-fx01',
      tokens,
      initialWpm: 300,
      initialPunctuationPauseEnabled: false,
    });

    // 1. Tempo zero exibe "—" para PPM observada
    expect(formatObservedWpm(0, 0)).toBe('—');

    // 2. Ler 20 tokens (4.000 ms), voltar 10 tokens e ler até o fim (mais 90 tokens = 18.000 ms)
    engine.play();
    clock.advanceBy(20 * 200);
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(20);
    expect(engine.getSnapshot().presentedCount).toBe(20);

    engine.seek(10);
    engine.play();
    clock.runToCompletion();

    const snap = engine.getSnapshot();
    expect(snap.status).toBe('completed');
    expect(snap.presentedCount).toBe(110);
    expect(countUniqueCoveredTokens(snap.coverageRanges)).toBe(100);

    // 3. Simular salto de suspensão do sistema operacional (> 1.000 ms de atraso)
    const engineSusp = new ReadingEngine({
      clock,
      contentVersionId: 'cv-fx01',
      tokens,
      initialWpm: 300,
      initialPunctuationPauseEnabled: false,
    });
    engineSusp.play();
    // Timer de 200 ms dispara com 5.000 ms de atraso por suspensão do SO
    clock.triggerNextWithLag(5_000);
    const suspSnap = engineSusp.getSnapshot();
    expect(suspSnap.status).toBe('paused');
    expect(suspSnap.lastPauseReason).toBe('system_suspension');
    // Não soma os 5.000 ms de suspensão ao tempo ativo
    expect(suspSnap.activeMs).toBe(200);
    expect(clock.getActiveTimerCount()).toBe(0);
  });
});
