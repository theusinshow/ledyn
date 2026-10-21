import { useState } from 'react';
import { useAppStore } from '@/application/stores';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MAX_WPM, MIN_WPM, WPM_STEP } from '@/domain/reading/engine';
import type { ThemePreference } from '@/infrastructure/db/repositories';

export function SettingsPage() {
  const { preferences, updatePreferences } = useAppStore();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [wpmDraft, setWpmDraft] = useState<string>(
    String(preferences.defaultWpm),
  );

  const handleThemeChange = async (theme: ThemePreference) => {
    await updatePreferences({ theme });
    setStatusMessage('Tema salvo no armazenamento local (IndexedDB).');
  };

  const handlePunctuationChange = async (enabled: boolean) => {
    await updatePreferences({ punctuationPauseEnabled: enabled });
    setStatusMessage('Preferência de pontuação salva.');
  };

  const handleSaveDefaultWpm = async () => {
    const parsed = Number(wpmDraft);
    if (!Number.isFinite(parsed) || parsed < MIN_WPM || parsed > MAX_WPM) {
      setStatusMessage(
        `A velocidade padrão deve estar entre ${MIN_WPM} e ${MAX_WPM} PPM.`,
      );
      return;
    }
    await updatePreferences({ defaultWpm: Math.round(parsed) });
    setStatusMessage(`Velocidade padrão de ${Math.round(parsed)} PPM salva.`);
  };

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Preferências gravadas exclusivamente no IndexedDB local (sem duplicação em localStorage).
        </p>
      </div>

      {statusMessage && (
        <div
          role="status"
          data-testid="settings-status-banner"
          className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm"
        >
          {statusMessage}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Aparência</CardTitle>
          <CardDescription>
            Escolha o tema visual para leitura confortável.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(['system', 'light', 'dark'] as const).map((themeOpt) => (
            <Button
              key={themeOpt}
              variant={preferences.theme === themeOpt ? 'default' : 'outline'}
              onClick={() => void handleThemeChange(themeOpt)}
              data-testid={`theme-option-${themeOpt}`}
            >
              {themeOpt === 'system'
                ? 'Sistema'
                : themeOpt === 'light'
                  ? 'Claro'
                  : 'Escuro'}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Padrões de Leitura RSVP</CardTitle>
          <CardDescription>
            Ritmo inicial para novas sessões ({MIN_WPM}–{MAX_WPM} PPM, passo de{' '}
            {WPM_STEP}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="settings-default-wpm"
                className="text-sm font-medium block"
              >
                Velocidade padrão (PPM)
              </label>
              <Input
                id="settings-default-wpm"
                data-testid="settings-default-wpm"
                type="number"
                min={MIN_WPM}
                max={MAX_WPM}
                step={WPM_STEP}
                value={wpmDraft}
                onChange={(e) => setWpmDraft(e.target.value)}
                className="w-32"
              />
            </div>
            <Button
              onClick={() => void handleSaveDefaultWpm()}
              data-testid="save-default-wpm-btn"
            >
              Salvar velocidade
            </Button>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div>
              <p className="text-sm font-medium">
                Pausas de pontuação por padrão
              </p>
              <p className="text-xs text-muted-foreground">
                Multiplicadores: 1,5x cláusula · 2x frase · 2,5x parágrafo.
              </p>
            </div>
            <Button
              variant={
                preferences.punctuationPauseEnabled ? 'default' : 'outline'
              }
              onClick={() =>
                void handlePunctuationChange(
                  !preferences.punctuationPauseEnabled,
                )
              }
              data-testid="settings-punctuation-toggle"
            >
              {preferences.punctuationPauseEnabled ? 'Ligadas' : 'Desligadas'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
