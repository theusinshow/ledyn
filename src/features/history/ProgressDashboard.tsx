import { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  summarizeProgress,
  type DailyReading,
  type SpeedPoint,
} from '@/domain/reading/progressStats';
import type { SessionHistoryItem } from '@/infrastructure/db/repositories';
import { cn } from '@/shared/utils';

/** Duração compacta para tiles e eixos: "1 h 12 min", "18 min", "40 s". */
function formatCompactDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes === 0) return ms > 0 ? `${Math.round(ms / 1000)} s` : '0 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function dayLabel(dateKey: string, style: 'short' | 'long'): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  return style === 'short'
    ? String(date.getDate())
    : date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/** Passo "redondo" para os ticks do eixo Y. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

export function ProgressDashboard({ entries }: { entries: SessionHistoryItem[] }) {
  // Data de referência fixada na montagem: o painel é um retrato do momento em que abriu.
  const [now] = useState(() => new Date());
  const summary = useMemo(
    () =>
      summarizeProgress(
        entries.map((e) => e.session),
        entries.flatMap((e) => (e.quizAttempt ? [e.quizAttempt] : [])),
        now,
      ),
    [entries, now],
  );

  if (!summary.hasAnyReading) return null;

  const timeDelta = summary.last7.activeMs - summary.previous7.activeMs;

  return (
    <section aria-labelledby="progress-dashboard-title" data-testid="progress-dashboard" className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 id="progress-dashboard-title" className="text-[0.9375rem] font-semibold">
          Sua evolução
        </h2>
        <span className="text-xs text-subtle-foreground">últimos 7 dias</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          testId="stat-reading-time"
          label="Tempo lendo"
          value={formatCompactDuration(summary.last7.activeMs)}
          delta={
            summary.previous7.activeMs > 0 || summary.last7.activeMs > 0
              ? `${timeDelta >= 0 ? '+' : '−'}${formatCompactDuration(Math.abs(timeDelta))} vs 7 dias anteriores`
              : undefined
          }
          deltaTone={timeDelta > 0 ? 'up' : timeDelta < 0 ? 'down' : 'flat'}
        />
        <StatTile
          testId="stat-streak"
          label="Dias seguidos"
          value={String(summary.streakDays)}
          hint={summary.streakDays === 0 ? 'Leia hoje para começar' : summary.streakDays === 1 ? 'dia com leitura' : 'dias com leitura'}
        />
        <StatTile
          testId="stat-words"
          label="Palavras apresentadas"
          value={formatCompactNumber(summary.last7.presentedCount)}
          hint={`${summary.completedDocuments} ${summary.completedDocuments === 1 ? 'documento concluído' : 'documentos concluídos'} no total`}
        />
        <StatTile
          testId="stat-observed-wpm"
          label="PPM observada"
          value={summary.last7.observedWpm !== null ? String(summary.last7.observedWpm) : '—'}
          hint={
            summary.quizAverage
              ? `Treinos: ${summary.quizAverage.percent}% de acerto (${summary.quizAverage.attempts})`
              : 'Inclui pausas; não mede compreensão'
          }
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <ChartCard
          title="Minutos lendo por dia"
          subtitle="Últimos 14 dias · cada sessão conta no dia em que começou"
        >
          <DailyBars daily={summary.daily} />
        </ChartCard>
        <ChartCard
          title="PPM observada por sessão"
          subtitle="Últimas sessões com 30 s ou mais · palavras apresentadas ÷ tempo ativo"
        >
          {summary.speedSeries.length >= 2 ? (
            <SpeedLine points={summary.speedSeries} />
          ) : (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Leia pelo menos duas sessões de 30 s ou mais para ver a tendência.
            </p>
          )}
        </ChartCard>
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  delta,
  deltaTone = 'flat',
  hint,
  testId,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'flat';
  hint?: string;
  testId: string;
}) {
  return (
    <div data-testid={testId} className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]" data-testid={`${testId}-value`}>
        {value}
      </p>
      {delta && (
        <p
          className={cn(
            'mt-1 text-[0.6875rem]',
            deltaTone === 'up' ? 'text-success' : 'text-muted-foreground',
          )}
        >
          {deltaTone === 'up' ? '▲ ' : deltaTone === 'down' ? '▼ ' : ''}
          {delta}
        </p>
      )}
      {hint && <p className="mt-1 text-[0.6875rem] text-subtle-foreground">{hint}</p>}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-[0.8125rem] font-medium">{title}</h3>
      <p className="mb-3 text-[0.6875rem] text-subtle-foreground">{subtitle}</p>
      {children}
    </div>
  );
}

/** Colunas por dia: um único baseline, topo arredondado, valor só no maior dia. */
function DailyBars({ daily }: { daily: DailyReading[] }) {
  const maxMs = Math.max(...daily.map((d) => d.activeMs));
  const maxMinutes = niceMax(maxMs / 60_000);
  const peakIndex = maxMs > 0 ? daily.findIndex((d) => d.activeMs === maxMs) : -1;

  return (
    <div data-testid="daily-bars-chart">
      <div className="relative h-40">
        {/* Grade recessiva: 0, metade e topo */}
        {[0, 0.5, 1].map((f) => (
          <div
            key={f}
            aria-hidden="true"
            className="absolute inset-x-8 border-t border-border"
            style={{ bottom: `${f * 100}%` }}
          >
            <span className="absolute -left-8 -translate-y-1/2 font-mono text-[0.625rem] tabular-nums text-subtle-foreground">
              {Math.round(maxMinutes * f)}
            </span>
          </div>
        ))}
        <ol className="absolute inset-y-0 left-8 right-0 flex items-end gap-0.5" aria-label="Minutos lendo por dia">
          {daily.map((d, i) => {
            const minutes = d.activeMs / 60_000;
            const heightPct = Math.min(100, (minutes / maxMinutes) * 100);
            return (
              <li key={d.dateKey} className="group relative flex h-full flex-1 items-end justify-center">
                <button
                  type="button"
                  data-testid={`daily-bar-${d.dateKey}`}
                  aria-label={`${dayLabel(d.dateKey, 'long')}: ${formatCompactDuration(d.activeMs)}`}
                  className="flex h-full w-full cursor-default items-end justify-center focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      'block w-full max-w-6 rounded-t-[4px] transition-[filter]',
                      d.activeMs > 0 ? 'bg-primary group-hover:brightness-110' : 'bg-transparent',
                    )}
                    style={{ height: d.activeMs > 0 ? `max(${heightPct}%, 2px)` : 0 }}
                  />
                </button>
                {i === peakIndex && (
                  <span className="pointer-events-none absolute -translate-y-1 whitespace-nowrap font-mono text-[0.625rem] text-muted-foreground" style={{ bottom: `${heightPct}%` }}>
                    {formatCompactDuration(d.activeMs)}
                  </span>
                )}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute z-10 hidden whitespace-nowrap rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-[0.6875rem] shadow-sm group-hover:block group-focus-within:block"
                  style={{ bottom: `calc(${heightPct}% + 0.5rem)` }}
                >
                  <strong className="font-semibold text-foreground">{formatCompactDuration(d.activeMs)}</strong>{' '}
                  <span className="text-muted-foreground">{dayLabel(d.dateKey, 'long')}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="ml-8 mt-1 flex gap-0.5" aria-hidden="true">
        {daily.map((d, i) => (
          <span key={d.dateKey} className="flex-1 text-center font-mono text-[0.625rem] tabular-nums text-subtle-foreground">
            {i % 2 === daily.length % 2 || i === daily.length - 1 ? dayLabel(d.dateKey, 'short') : ''}
          </span>
        ))}
      </div>
      <TableView
        caption="Minutos lendo por dia"
        headers={['Dia', 'Tempo']}
        rows={daily.map((d) => [dayLabel(d.dateKey, 'long'), formatCompactDuration(d.activeMs)])}
      />
    </div>
  );
}

/** Linha de 2px com marcadores de 8px, crosshair que encaixa no ponto mais próximo e tooltip. */
function SpeedLine({ points }: { points: SpeedPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const [hover, setHover] = useState<number | null>(null);
  const height = 160;
  const pad = { left: 36, right: 40, top: 12, bottom: 20 };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.max(240, Math.round(entries[0]?.contentRect.width ?? 480)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxWpm = niceMax(Math.max(...points.map((p) => p.observedWpm)) * 1.1);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (wpm: number) => pad.top + innerH - (wpm / maxWpm) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.observedWpm).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;
  const hovered = hover !== null ? points[hover] : undefined;

  const onPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * innerW;
    const index = Math.round((px / innerW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  };

  return (
    <div ref={wrapRef} className="relative" data-testid="speed-line-chart">
      <svg width={width} height={height} role="img" aria-label={`PPM observada nas últimas ${points.length} sessões; a mais recente foi ${last.observedWpm}`} className="block overflow-visible">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.left} x2={width - pad.right} y1={y(maxWpm * f)} y2={y(maxWpm * f)} stroke="var(--border)" strokeWidth={1} />
            <text x={pad.left - 6} y={y(maxWpm * f)} dy="0.32em" textAnchor="end" className="fill-subtle-foreground font-mono text-[0.625rem]">
              {Math.round(maxWpm * f)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hovered && (
          <line x1={x(hover!)} x2={x(hover!)} y1={pad.top} y2={pad.top + innerH} stroke="var(--border-strong)" strokeWidth={1} />
        )}
        {points.map((p, i) => (
          <circle
            key={p.startedAt}
            cx={x(i)}
            cy={y(p.observedWpm)}
            r={i === hover || i === points.length - 1 ? 4 : 3}
            fill="var(--primary)"
            stroke="var(--card)"
            strokeWidth={2}
          />
        ))}
        <text x={x(points.length - 1) + 8} y={y(last.observedWpm)} dy="0.32em" className="fill-muted-foreground font-mono text-[0.6875rem]">
          {last.observedWpm}
        </text>
        <rect
          x={pad.left - 12}
          y={pad.top}
          width={innerW + 24}
          height={innerH}
          fill="transparent"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-[0.6875rem] shadow-sm"
          style={{ left: x(hover!), top: Math.max(0, y(hovered.observedWpm) - 44) }}
        >
          <span className="mr-1.5 inline-block h-0.5 w-3 align-middle bg-primary" aria-hidden="true" />
          <strong className="font-semibold text-foreground">{hovered.observedWpm} PPM</strong>{' '}
          <span className="text-muted-foreground">
            {new Date(hovered.startedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {formatCompactDuration(hovered.activeMs)}
          </span>
        </div>
      )}
      <TableView
        caption="PPM observada por sessão"
        headers={['Sessão', 'PPM observada', 'Tempo ativo']}
        rows={points.map((p) => [
          new Date(p.startedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
          String(p.observedWpm),
          formatCompactDuration(p.activeMs),
        ])}
      />
    </div>
  );
}

function TableView({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  return (
    <details className="mt-3 text-[0.6875rem]">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver como tabela</summary>
      <table className="mt-2 w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="border-b border-border py-1 text-left font-medium text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="border-b border-border py-1 tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
