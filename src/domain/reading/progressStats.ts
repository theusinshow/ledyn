import { calculateObservedWpm } from '@/domain/reading/metrics';

/**
 * Estatísticas de evolução a partir das sessões já registradas.
 * Mede apenas o que foi observado: tempo ativo, palavras apresentadas e PPM observada.
 * Nada aqui estima compreensão ou "capacidade" de leitura.
 */
export type ProgressSessionInput = {
  startedAt: string;
  activeMs: number;
  presentedCount: number;
  status: 'playing' | 'paused' | 'completed' | 'interrupted';
  documentId: string;
};

export type ProgressQuizInput = {
  submittedAt: string | null;
  correctCount: number | null;
  totalCount: number;
};

export type DailyReading = {
  /** Data local AAAA-MM-DD. */
  dateKey: string;
  activeMs: number;
};

export type SpeedPoint = {
  startedAt: string;
  observedWpm: number;
  activeMs: number;
};

export type ProgressSummary = {
  daily: DailyReading[];
  last7: { activeMs: number; presentedCount: number; observedWpm: number | null };
  previous7: { activeMs: number; presentedCount: number };
  streakDays: number;
  completedDocuments: number;
  speedSeries: SpeedPoint[];
  quizAverage: { percent: number; attempts: number } | null;
  hasAnyReading: boolean;
};

/** Sessões curtas demais produzem PPM observada instável e ficam fora da série de velocidade. */
export const MIN_SESSION_MS_FOR_SPEED = 30_000;
const DAY_MS = 86_400_000;

export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function summarizeProgress(
  sessions: ReadonlyArray<ProgressSessionInput>,
  quizAttempts: ReadonlyArray<ProgressQuizInput>,
  now: Date,
  days = 14,
  maxSpeedPoints = 20,
): ProgressSummary {
  const today = startOfLocalDay(now);
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    if (s.activeMs <= 0) continue;
    // A sessão é atribuída ao dia em que começou.
    const key = localDateKey(new Date(s.startedAt));
    byDay.set(key, (byDay.get(key) ?? 0) + s.activeMs);
  }

  const daily: DailyReading[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = localDateKey(day);
    daily.push({ dateKey: key, activeMs: byDay.get(key) ?? 0 });
  }

  const sevenDaysAgo = today.getTime() - 6 * DAY_MS;
  const fourteenDaysAgo = today.getTime() - 13 * DAY_MS;
  const last7 = { activeMs: 0, presentedCount: 0 };
  const previous7 = { activeMs: 0, presentedCount: 0 };
  for (const s of sessions) {
    const t = startOfLocalDay(new Date(s.startedAt)).getTime();
    if (t >= sevenDaysAgo && t <= today.getTime()) {
      last7.activeMs += s.activeMs;
      last7.presentedCount += s.presentedCount;
    } else if (t >= fourteenDaysAgo && t < sevenDaysAgo) {
      previous7.activeMs += s.activeMs;
      previous7.presentedCount += s.presentedCount;
    }
  }

  // Dias seguidos com leitura, terminando hoje (ou ontem, se hoje ainda não houve).
  let streakDays = 0;
  const hasDay = (offset: number) =>
    (byDay.get(
      localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)),
    ) ?? 0) > 0;
  let offset = hasDay(0) ? 0 : 1;
  while (hasDay(offset)) {
    streakDays++;
    offset++;
  }

  const completedDocuments = new Set(
    sessions.filter((s) => s.status === 'completed').map((s) => s.documentId),
  ).size;

  const speedSeries = sessions
    .filter((s) => s.activeMs >= MIN_SESSION_MS_FOR_SPEED && s.presentedCount > 0)
    .map((s) => ({
      startedAt: s.startedAt,
      activeMs: s.activeMs,
      observedWpm: calculateObservedWpm(s.presentedCount, s.activeMs) ?? 0,
    }))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(-maxSpeedPoints);

  const submitted = quizAttempts.filter(
    (a) => a.submittedAt !== null && a.correctCount !== null && a.totalCount > 0,
  );
  const quizAverage =
    submitted.length > 0
      ? {
          percent: Math.round(
            (submitted.reduce((acc, a) => acc + a.correctCount! / a.totalCount, 0) /
              submitted.length) *
              100,
          ),
          attempts: submitted.length,
        }
      : null;

  return {
    daily,
    last7: {
      ...last7,
      observedWpm: calculateObservedWpm(last7.presentedCount, last7.activeMs),
    },
    previous7,
    streakDays,
    completedDocuments,
    speedSeries,
    quizAverage,
    hasAnyReading: sessions.some((s) => s.activeMs > 0),
  };
}
