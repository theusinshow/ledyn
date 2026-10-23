import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  Info,
  Minus,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAppStore } from '@/application/stores';
import { Badge } from '@/components/ui/badge';
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
import {
  clearAllPersonalDataTransactional,
  exportFullBackupZip,
  hasPersonalDataInLibrary,
  restoreFullBackupZip,
  type ExportedBackupResult,
} from '@/infrastructure/backup/backupService';
import {
  MAX_GUIDED_FONT_SIZE_PX,
  MIN_GUIDED_FONT_SIZE_PX,
  type ThemePreference,
} from '@/infrastructure/db/repositories';
import {
  formatBytesPtBr,
  getStorageDiagnostics,
  requestPersistentStorage,
  type StorageDiagnostics,
} from '@/infrastructure/storage/storageDiagnostics';
import { toAppError } from '@/shared/errors';

export function SettingsPage() {
  const {
    preferences,
    preferencesWarning,
    updatePreferences,
    hydratePreferences,
    dismissPreferencesWarning,
  } = useAppStore();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [wpmDraft, setWpmDraft] = useState<string | null>(null);
  const [fontSizeDraft, setFontSizeDraft] = useState<string | null>(null);

  // Estado de Armazenamento Local (AC-26)
  const [storageDiag, setStorageDiag] = useState<StorageDiagnostics | null>(
    null,
  );
  const [persistFeedback, setPersistFeedback] = useState<string | null>(null);
  const [hasPersonalData, setHasPersonalData] = useState<boolean>(false);

  // Estado de Backup e Restauração (AC-24 / AC-25 / AC-26)
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [lastExportResult, setLastExportResult] =
    useState<ExportedBackupResult | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [backupErrorMessage, setBackupErrorMessage] = useState<string | null>(
    null,
  );
  const [backupErrorCode, setBackupErrorCode] = useState<string | null>(null);
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<
    string | null
  >(null);
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);

  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);

  const displayedWpmDraft = wpmDraft ?? String(preferences.defaultWpm);
  const displayedFontSizeDraft =
    fontSizeDraft ?? String(preferences.guidedFontSizePx);

  const refreshDiagnosticsAndLibraryStatus = async () => {
    const [diag, libStatus] = await Promise.all([
      getStorageDiagnostics(),
      hasPersonalDataInLibrary(),
    ]);
    setStorageDiag(diag);
    setHasPersonalData(libStatus.hasPersonalData);
  };

  useEffect(() => {
    let active = true;
    Promise.all([getStorageDiagnostics(), hasPersonalDataInLibrary()])
      .then(([diag, libStatus]) => {
        if (active) {
          setStorageDiag(diag);
          setHasPersonalData(libStatus.hasPersonalData);
        }
      })
      .catch(() => {
        // Ignora erro de diagnóstico não crítico
      });
    return () => {
      active = false;
    };
  }, []);

  const handleThemeChange = async (theme: ThemePreference) => {
    setValidationError(null);
    await updatePreferences({ theme });
    setStatusMessage('Tema salvo no armazenamento local (IndexedDB).');
  };

  const handlePunctuationChange = async (enabled: boolean) => {
    setValidationError(null);
    await updatePreferences({ punctuationPauseEnabled: enabled });
    setStatusMessage('Preferência de pontuação salva.');
  };

  const handleReducedMotionChange = async (enabled: boolean) => {
    setValidationError(null);
    await updatePreferences({ reducedMotion: enabled });
    setStatusMessage(
      enabled
        ? 'Movimento reduzido ativado (rolagem discreta sem animação).'
        : 'Movimento reduzido desativado.',
    );
  };

  const handleSaveDefaultWpm = async () => {
    const parsed = Number(displayedWpmDraft);
    if (
      displayedWpmDraft.trim() === '' ||
      !Number.isFinite(parsed) ||
      parsed < MIN_WPM ||
      parsed > MAX_WPM
    ) {
      setValidationError(
        `A velocidade padrão deve estar entre ${MIN_WPM} e ${MAX_WPM} PPM.`,
      );
      setStatusMessage(null);
      return;
    }
    setValidationError(null);
    const rounded = Math.round(parsed);
    await updatePreferences({ defaultWpm: rounded });
    setWpmDraft(null);
    setStatusMessage(`Velocidade padrão de ${rounded} PPM salva.`);
  };

  const handleSaveGuidedFontSize = async (explicitSize?: number) => {
    const parsed =
      explicitSize !== undefined ? explicitSize : Number(displayedFontSizeDraft);
    if (
      (explicitSize === undefined && displayedFontSizeDraft.trim() === '') ||
      !Number.isFinite(parsed) ||
      parsed < MIN_GUIDED_FONT_SIZE_PX ||
      parsed > MAX_GUIDED_FONT_SIZE_PX
    ) {
      setValidationError(
        `O tamanho da fonte no modo guiado deve estar entre ${MIN_GUIDED_FONT_SIZE_PX} e ${MAX_GUIDED_FONT_SIZE_PX} px.`,
      );
      setStatusMessage(null);
      return;
    }
    setValidationError(null);
    const rounded = Math.round(parsed);
    await updatePreferences({ guidedFontSizePx: rounded });
    setFontSizeDraft(null);
    setStatusMessage(`Tamanho da fonte guiada (${rounded} px) salvo.`);
  };

  const handleRequestPersistStorage = async () => {
    const outcome = await requestPersistentStorage();
    setPersistFeedback(outcome.message);
    await refreshDiagnosticsAndLibraryStatus();
  };

  const handleExportBackup = async () => {
    if (isExportingBackup) return;
    setIsExportingBackup(true);
    setBackupErrorMessage(null);
    setBackupErrorCode(null);
    setBackupSuccessMessage(null);

    try {
      const exported = await exportFullBackupZip();
      setLastExportResult(exported);

      if (
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
      ) {
        const objectUrl = URL.createObjectURL(exported.blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = exported.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      }

      setBackupSuccessMessage(
        `Backup exportado com sucesso: ${exported.fileName} (${formatBytesPtBr(exported.byteSize)}).`,
      );
      await refreshDiagnosticsAndLibraryStatus();
    } catch (err) {
      const appErr = toAppError(err);
      setBackupErrorCode(appErr.code);
      setBackupErrorMessage(appErr.userMessage);
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleRestoreFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isRestoringBackup) return;

    setIsRestoringBackup(true);
    setBackupErrorMessage(null);
    setBackupErrorCode(null);
    setBackupSuccessMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const zipBytes = new Uint8Array(buffer);
      const restored = await restoreFullBackupZip(zipBytes);
      await hydratePreferences();
      await refreshDiagnosticsAndLibraryStatus();

      setBackupSuccessMessage(
        `Backup restaurado com integridade verificada: ${restored.restoredCounts.documents} documento(s), ${restored.restoredCounts.sessions} sessão(ões) e ${restored.restoredCounts.quizAttempts} tentativa(s) de questionário.`,
      );
    } catch (err) {
      const appErr = toAppError(err, 'BACKUP_INVALID');
      setBackupErrorCode(appErr.code);
      setBackupErrorMessage(appErr.userMessage);
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleConfirmClearLocalData = async () => {
    setBackupErrorMessage(null);
    setBackupErrorCode(null);
    setBackupSuccessMessage(null);

    try {
      await clearAllPersonalDataTransactional();
      setShowClearDataConfirm(false);
      await refreshDiagnosticsAndLibraryStatus();
      setBackupSuccessMessage(
        'Dados pessoais locais removidos. A biblioteca está vazia e pronta para receber a restauração de um backup.',
      );
    } catch (err) {
      const appErr = toAppError(err);
      setBackupErrorCode(appErr.code);
      setBackupErrorMessage(appErr.userMessage);
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Preferências, armazenamento local e backup portátil (.reading-backup.zip) gravados exclusivamente no IndexedDB.
        </p>
      </div>

      {preferencesWarning && (
        <div
          role="alert"
          data-testid="settings-invalid-fallback-warning"
          className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>{preferencesWarning}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={dismissPreferencesWarning}
            data-testid="dismiss-preferences-warning-btn"
          >
            Entendi
          </Button>
        </div>
      )}

      {validationError && (
        <div
          role="alert"
          data-testid="settings-validation-error"
          className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
        >
          {validationError}
        </div>
      )}

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
          <CardTitle>Aparência e Acessibilidade Visual</CardTitle>
          <CardDescription>
            Escolha o tema visual, o tamanho do texto no modo guiado e o comportamento de rolagem.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <span className="text-sm font-medium block">Tema de cores</span>
            <div className="flex flex-wrap gap-2">
              {(['system', 'light', 'dark'] as const).map((themeOpt) => (
                <Button
                  key={themeOpt}
                  variant={
                    preferences.theme === themeOpt ? 'default' : 'outline'
                  }
                  aria-pressed={preferences.theme === themeOpt}
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
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-border">
            <label
              htmlFor="settings-guided-font-size"
              className="text-sm font-medium block"
            >
              Tamanho da fonte na Leitura Guiada ({MIN_GUIDED_FONT_SIZE_PX} a{' '}
              {MAX_GUIDED_FONT_SIZE_PX} px)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Diminuir fonte guiada em 2 px"
                disabled={preferences.guidedFontSizePx <= MIN_GUIDED_FONT_SIZE_PX}
                onClick={() =>
                  void handleSaveGuidedFontSize(
                    Math.max(
                      MIN_GUIDED_FONT_SIZE_PX,
                      preferences.guidedFontSizePx - 2,
                    ),
                  )
                }
                data-testid="settings-font-decrease-btn"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="settings-guided-font-size"
                data-testid="settings-guided-font-size"
                type="number"
                min={MIN_GUIDED_FONT_SIZE_PX}
                max={MAX_GUIDED_FONT_SIZE_PX}
                step={1}
                value={displayedFontSizeDraft}
                onChange={(e) => setFontSizeDraft(e.target.value)}
                className="w-24 text-center font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Aumentar fonte guiada em 2 px"
                disabled={preferences.guidedFontSizePx >= MAX_GUIDED_FONT_SIZE_PX}
                onClick={() =>
                  void handleSaveGuidedFontSize(
                    Math.min(
                      MAX_GUIDED_FONT_SIZE_PX,
                      preferences.guidedFontSizePx + 2,
                    ),
                  )
                }
                data-testid="settings-font-increase-btn"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveGuidedFontSize()}
                data-testid="save-guided-font-size-btn"
              >
                Salvar fonte
              </Button>
            </div>
            <p
              style={{ fontSize: `${preferences.guidedFontSizePx}px` }}
              className="mt-2 rounded-md border border-border bg-muted/20 p-3 leading-relaxed"
              data-testid="settings-font-preview"
            >
              Amostra do modo guiado em{' '}
              <strong>{preferences.guidedFontSizePx}px</strong>. O zoom do navegador permanece livre.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-3 border-t border-border sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Movimento reduzido</p>
              <p className="text-xs text-muted-foreground">
                Remove rolagem animada no modo guiado e usa saltos discretos, mantendo todos os controles do usuário ativos.
              </p>
            </div>
            <Button
              variant={preferences.reducedMotion ? 'default' : 'outline'}
              aria-pressed={preferences.reducedMotion}
              onClick={() =>
                void handleReducedMotionChange(!preferences.reducedMotion)
              }
              data-testid="settings-reduced-motion-toggle"
            >
              {preferences.reducedMotion ? 'Ativado' : 'Desativado'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Padrões de Leitura (RSVP e Guiada)</CardTitle>
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
                Velocidade padrão (PPM — palavras por minuto)
              </label>
              <Input
                id="settings-default-wpm"
                data-testid="settings-default-wpm"
                type="number"
                min={MIN_WPM}
                max={MAX_WPM}
                step={WPM_STEP}
                value={displayedWpmDraft}
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
                Ritmo inteligente por padrão
              </p>
              <p className="text-xs text-muted-foreground">
                Pausas mínimas na pontuação, tempo extra em palavras longas, entrada gradual e retomada do início da frase.
              </p>
            </div>
            <Button
              variant={
                preferences.punctuationPauseEnabled ? 'default' : 'outline'
              }
              aria-pressed={preferences.punctuationPauseEnabled}
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

      {/* Backup Completo ZIP e Restauração Segura (RF-10 / AC-24 / AC-25 / AC-26) */}
      <Card data-testid="settings-backup-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle>Backup Completo e Restauração (.reading-backup.zip)</CardTitle>
          </div>
          <CardDescription>
            Exporte ou restaure seu acervo completo incluindo arquivos originais binários (PDF/EPUB/TXT), snapshots normalizados, tokens, progresso, sessões, questionários e preferências.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            data-testid="backup-unencrypted-notice"
            className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-foreground">
                Aviso importante sobre privacidade e portabilidade (sem criptografia)
              </p>
              <p>
                O arquivo <code>.reading-backup.zip</code> não é criptografado no MVP: ele contém seus textos, arquivos originais e histórico em formato legível e verificável por hash SHA-256 (detecção de corrupção, não assinatura criptográfica). Guarde o arquivo em local de sua confiança.
              </p>
            </div>
          </div>

          {backupErrorMessage && (
            <div
              role="alert"
              data-testid="backup-error-alert"
              className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  Não foi possível concluir a operação de backup
                </span>
                {backupErrorCode && (
                  <Badge
                    variant="destructive"
                    data-testid="backup-error-code"
                    className="font-mono text-xs"
                  >
                    {backupErrorCode}
                  </Badge>
                )}
              </div>
              <p>{backupErrorMessage}</p>
            </div>
          )}

          {backupSuccessMessage && (
            <div
              role="status"
              data-testid="backup-success-banner"
              className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{backupSuccessMessage}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void handleExportBackup()}
              disabled={isExportingBackup || isRestoringBackup}
              data-testid="export-backup-btn"
            >
              <Download className="h-4 w-4" />
              {isExportingBackup
                ? 'Preparando pacote ZIP...'
                : 'Exportar backup (.reading-backup.zip)'}
            </Button>

            <input
              ref={restoreFileInputRef}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              data-testid="restore-backup-file-input"
              onChange={(e) => void handleRestoreFileSelected(e)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={isExportingBackup || isRestoringBackup}
              onClick={() => restoreFileInputRef.current?.click()}
              data-testid="restore-backup-btn"
            >
              <Upload className="h-4 w-4" />
              {isRestoringBackup
                ? 'Validando e restaurando...'
                : 'Restaurar backup (.reading-backup.zip)'}
            </Button>
          </div>

          {lastExportResult && (
            <div
              data-testid="last-export-summary"
              className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1"
            >
              <p className="font-medium text-foreground">
                Último pacote gerado: {lastExportResult.fileName} (
                {formatBytesPtBr(lastExportResult.byteSize)})
              </p>
              <p>
                Registros incluídos: {lastExportResult.manifest.counts.documents}{' '}
                documento(s), {lastExportResult.manifest.counts.sourceFiles}{' '}
                binário(s) original(is),{' '}
                {lastExportResult.manifest.counts.sessions} sessão(ões),{' '}
                {lastExportResult.manifest.counts.quizAttempts} tentativa(s) de
                quiz, {lastExportResult.manifest.counts.reflections} reflexão(ões).
              </p>
            </div>
          )}

          <div className="pt-3 border-t border-border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  Política de restauração segura (sem mesclagem automática)
                </p>
                <p>
                  A restauração exige uma biblioteca sem dados pessoais para evitar perda ou conflito silencioso.{' '}
                  {hasPersonalData
                    ? 'Sua biblioteca atual possui dados pessoais.'
                    : 'Sua biblioteca está pronta para receber uma restauração.'}
                </p>
              </div>
              {hasPersonalData && !showClearDataConfirm && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowClearDataConfirm(true)}
                  data-testid="open-clear-library-btn"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Limpar dados locais para restaurar
                </Button>
              )}
            </div>

            {showClearDataConfirm && (
              <div
                role="alertdialog"
                aria-label="Confirmar limpeza de dados locais"
                data-testid="clear-library-confirm-dialog"
                className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  Tem certeza de que deseja remover todos os documentos pessoais, sessões e tentativas deste navegador? Exporte um backup antes se quiser preservá-los.
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowClearDataConfirm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleConfirmClearLocalData()}
                    data-testid="confirm-clear-library-btn"
                  >
                    Confirmar limpeza
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Diagnóstico de Espaço, Persistência e Origem (RF-09 / AC-26) */}
      <Card data-testid="settings-storage-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            <CardTitle>Armazenamento Local, Persistência e Origem</CardTitle>
          </div>
          <CardDescription>
            Os dados locais (IndexedDB) pertencem exclusivamente ao perfil e à origem (protocolo + domínio + porta) deste navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3 space-y-1">
              <span className="text-muted-foreground block">
                Origem atual do banco
              </span>
              <span
                className="font-mono font-semibold text-foreground break-all"
                data-testid="storage-origin-value"
              >
                {storageDiag?.origin ?? 'local'}
              </span>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-1">
              <span className="text-muted-foreground block">
                Espaço estimado pelo navegador
              </span>
              <span
                className="font-semibold text-foreground"
                data-testid="storage-estimate-value"
              >
                {storageDiag?.supported
                  ? `${formatBytesPtBr(storageDiag.usageBytes)} usados de ${formatBytesPtBr(storageDiag.quotaBytes)}`
                  : 'Estimativa não informada por este navegador'}
              </span>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-1">
              <span className="text-muted-foreground block">
                Regime de persistência
              </span>
              <div className="flex items-center gap-2 pt-0.5">
                <Badge
                  variant={storageDiag?.persisted ? 'default' : 'outline'}
                  data-testid="storage-persisted-badge"
                >
                  {storageDiag?.persisted === true
                    ? 'Persistente concedido'
                    : storageDiag?.persisted === false
                      ? 'Padrão (best-effort)'
                      : 'Não informado'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
            <p className="text-muted-foreground max-w-xl">
              Mudar de navegador, perfil, porta local ou abrir em janela anônima utiliza outra base de dados isolada. Para transferir seus livros e histórico entre dispositivos ou perfis, utilize sempre o backup <code>.reading-backup.zip</code>.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRequestPersistStorage()}
              data-testid="request-persist-storage-btn"
            >
              Solicitar armazenamento persistente
            </Button>
          </div>

          {persistFeedback && (
            <div
              role="status"
              data-testid="storage-persist-feedback"
              className="rounded-md border border-border bg-muted/30 p-2.5 text-muted-foreground"
            >
              {persistFeedback}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
