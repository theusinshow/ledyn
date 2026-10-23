import { describe, expect, it } from 'vitest';
import {
  localDateKey,
  summarizeProgress,
  type ProgressSessionInput,
} from '@/domain/reading/progressStats';

const NOW = new Date(2026, 9, 23, 15, 0, 0); // 23/10/2026 15h (horário local)

function at(daysAgo: number, hour = 10): string {
  return new Date(2026, 9, 23 - daysAgo, hour, 0, 0).toISOString();
}

function session(
  daysAgo: number,
  activeMs: number,
  presentedCount: number,
  extra: Partial<ProgressSessionInput> = {},
): ProgressSessionInput {
  return {
    startedAt: at(daysAgo),
    activeMs,
    presentedCount,
    status: 'paused',
    documentId: 'd1',
    ...extra,
  };
}

describe('Painel de evolução — agregação honesta das sessões', () => {
  it('soma o tempo por dia local nos últimos 14 dias, com zeros nos dias sem leitura', () => {
    const summary = summarizeProgress(
      [session(0, 60_000, 250), session(0, 30_000, 100), session(2, 120_000, 500), session(20, 999_000, 1)],
      [],
      NOW,
    );
    expect(summary.daily).toHaveLength(14);
    expect(summary.daily.at(-1)).toEqual({ dateKey: localDateKey(NOW), activeMs: 90_000 });
    expect(summary.daily.at(-3)!.activeMs).toBe(120_000);
    expect(summary.daily.at(-2)!.activeMs).toBe(0);
  });

  it('compara os últimos 7 dias com os 7 anteriores e calcula a PPM observada do período', () => {
    const summary = summarizeProgress(
      [session(1, 60_000, 300), session(6, 60_000, 300), session(7, 120_000, 100), session(13, 60_000, 50)],
      [],
      NOW,
    );
    expect(summary.last7).toEqual({ activeMs: 120_000, presentedCount: 600, observedWpm: 300 });
    expect(summary.previous7).toEqual({ activeMs: 180_000, presentedCount: 150 });
  });

  it('conta dias seguidos terminando hoje, ou ontem se hoje ainda não houve leitura', () => {
    expect(summarizeProgress([session(0, 1, 1), session(1, 1, 1), session(2, 1, 1), session(4, 1, 1)], [], NOW).streakDays).toBe(3);
    expect(summarizeProgress([session(1, 1, 1), session(2, 1, 1)], [], NOW).streakDays).toBe(2);
    expect(summarizeProgress([session(3, 1, 1)], [], NOW).streakDays).toBe(0);
  });

  it('série de velocidade ignora sessões curtas, ordena por data e limita a quantidade', () => {
    const sessions = [
      session(3, 20_000, 200), // curta demais
      session(2, 60_000, 250),
      session(5, 120_000, 400),
    ];
    const summary = summarizeProgress(sessions, [], NOW, 14, 20);
    expect(summary.speedSeries.map((p) => p.observedWpm)).toEqual([200, 250]);
    const many = Array.from({ length: 30 }, (_, i) => session(i % 10, 60_000, 100 + i));
    expect(summarizeProgress(many, [], NOW, 14, 20).speedSeries).toHaveLength(20);
  });

  it('documentos concluídos são distintos e a média dos treinos usa só tentativas enviadas', () => {
    const summary = summarizeProgress(
      [
        session(0, 1000, 10, { status: 'completed', documentId: 'a' }),
        session(1, 1000, 10, { status: 'completed', documentId: 'a' }),
        session(1, 1000, 10, { status: 'completed', documentId: 'b' }),
      ],
      [
        { submittedAt: at(0), correctCount: 4, totalCount: 4 },
        { submittedAt: at(1), correctCount: 2, totalCount: 4 },
        { submittedAt: null, correctCount: null, totalCount: 4 }, // rascunho
      ],
      NOW,
    );
    expect(summary.completedDocuments).toBe(2);
    expect(summary.quizAverage).toEqual({ percent: 75, attempts: 2 });
  });

  it('sem sessões: tudo zerado, sem média de treino e sem PPM inventada', () => {
    const summary = summarizeProgress([], [], NOW);
    expect(summary.hasAnyReading).toBe(false);
    expect(summary.last7.observedWpm).toBeNull();
    expect(summary.quizAverage).toBeNull();
    expect(summary.streakDays).toBe(0);
  });
});
