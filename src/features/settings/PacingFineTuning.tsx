import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BOUNDARY_MIN_PAUSE_MS, PAUSE_LIMITS_MS } from '@/domain/reading/metrics';
import type { UserPreferences } from '@/infrastructure/db/repositories';

type PauseKey = 'pauseClauseMs' | 'pauseSentenceMs' | 'pauseParagraphMs';

const PAUSES: Array<{
  key: PauseKey;
  label: string;
  hint: string;
  limits: { min: number; max: number; step: number };
}> = [
  { key: 'pauseClauseMs', label: 'Vírgula, ponto e vírgula e dois-pontos', hint: 'Respiro curto entre partes da frase', limits: PAUSE_LIMITS_MS.clause },
  { key: 'pauseSentenceMs', label: 'Fim de frase', hint: 'Tempo para fechar a ideia antes da próxima', limits: PAUSE_LIMITS_MS.sentence },
  { key: 'pauseParagraphMs', label: 'Fim de parágrafo', hint: 'Troca de assunto; aparece o sinal ¶', limits: PAUSE_LIMITS_MS.paragraph },
];

export interface PacingFineTuningProps {
  preferences: UserPreferences;
  onSave: (partial: Partial<UserPreferences>) => Promise<void>;
}

/**
 * Ajuste fino do ritmo inteligente: pausas mínimas por pontuação, volta ao início
 * da frase ao retomar e trilha de contexto. Salva ao soltar o controle.
 */
export function PacingFineTuning({ preferences, onSave }: PacingFineTuningProps) {
  const [draft, setDraft] = useState<Partial<Record<PauseKey, number>>>({});
  const valueOf = (key: PauseKey) => draft[key] ?? preferences[key];

  const commit = (key: PauseKey) => {
    const value = draft[key];
    if (value === undefined || value === preferences[key]) return;
    void onSave({ [key]: value }).finally(() =>
      setDraft((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      }),
    );
  };

  const isDefault =
    preferences.pauseClauseMs === BOUNDARY_MIN_PAUSE_MS.clause &&
    preferences.pauseSentenceMs === BOUNDARY_MIN_PAUSE_MS.sentence &&
    preferences.pauseParagraphMs === BOUNDARY_MIN_PAUSE_MS.paragraph &&
    preferences.resumeRewindEnabled &&
    preferences.showContextTrail;

  return (
    <div
      className="space-y-4 rounded-lg border border-border bg-surface-sunken/50 p-4"
      data-testid="pacing-fine-tuning"
      aria-disabled={!preferences.punctuationPauseEnabled}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Ajuste fino do ritmo</p>
          <p className="text-xs text-muted-foreground">
            Pausas mínimas somadas depois da palavra. Em velocidades baixas a pausa pode ser maior, porque vale o maior entre o mínimo e o multiplicador da pontuação.
            {!preferences.punctuationPauseEnabled && ' Ligue o ritmo inteligente para estas opções terem efeito.'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={isDefault}
          data-testid="pacing-reset-btn"
          onClick={() =>
            void onSave({
              pauseClauseMs: BOUNDARY_MIN_PAUSE_MS.clause,
              pauseSentenceMs: BOUNDARY_MIN_PAUSE_MS.sentence,
              pauseParagraphMs: BOUNDARY_MIN_PAUSE_MS.paragraph,
              resumeRewindEnabled: true,
              showContextTrail: true,
            })
          }
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Padrão
        </Button>
      </div>

      {PAUSES.map(({ key, label, hint, limits }) => {
        const id = `pacing-${key}`;
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={id} className="text-[0.8125rem]">
                {label}
                <span className="ml-2 text-[0.6875rem] text-subtle-foreground">{hint}</span>
              </label>
              <output htmlFor={id} className="font-mono text-xs tabular-nums text-muted-foreground" data-testid={`${id}-value`}>
                {valueOf(key)} ms
              </output>
            </div>
            <input
              id={id}
              data-testid={id}
              type="range"
              min={limits.min}
              max={limits.max}
              step={limits.step}
              value={valueOf(key)}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
              onPointerUp={() => commit(key)}
              onKeyUp={() => commit(key)}
              onBlur={() => commit(key)}
              className="h-1.5 w-full cursor-pointer rounded-full"
            />
          </div>
        );
      })}

      <ToggleRow
        testId="pacing-resume-rewind-toggle"
        label="Ao retomar, voltar ao início da frase"
        hint="Depois de pausar, a leitura recomeça da frase atual para recuperar o contexto."
        checked={preferences.resumeRewindEnabled}
        onChange={(v) => void onSave({ resumeRewindEnabled: v })}
      />
      <ToggleRow
        testId="pacing-context-trail-toggle"
        label="Trilha do que acabou de ler"
        hint="Mostra, apagado abaixo da palavra, o trecho lido mais recente."
        checked={preferences.showContextTrail}
        onChange={(v) => void onSave({ showContextTrail: v })}
      />
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
      <div>
        <p className="text-[0.8125rem]">{label}</p>
        <p className="text-[0.6875rem] text-muted-foreground">{hint}</p>
      </div>
      <Button
        variant={checked ? 'default' : 'outline'}
        size="sm"
        aria-pressed={checked}
        data-testid={testId}
        onClick={() => onChange(!checked)}
      >
        {checked ? 'Ligado' : 'Desligado'}
      </Button>
    </div>
  );
}
