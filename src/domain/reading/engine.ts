import type {
  CoverageRange,
  ModeSegment,
  ReadingCursor,
  ReadingMode,
  SpeedChangeEntry,
  Token,
  TokenBoundary,
} from '@/domain/contracts';
import type { Clock } from '@/domain/reading/clock';
import {
  calculateChunkDurationMs,
  findChunkEndIndex,
  findRewindTarget,
  findSentenceStartIndex,
  MAX_CHUNK_SIZE,
  mergeCoverageRange,
  BOUNDARY_MIN_PAUSE_MS,
  MIN_CHUNK_SIZE,
  RESUME_RAMP_FACTORS,
  type MinPauseConfig,
} from '@/domain/reading/metrics';
import { AppError } from '@/shared/errors';

export const MIN_WPM = 100;
export const MAX_WPM = 800;
export const DEFAULT_WPM = 250;
export const WPM_STEP = 25;

export type EngineStatus = 'ready' | 'playing' | 'paused' | 'completed' | 'error';

export type PauseReason =
  | 'manual'
  | 'seek'
  | 'mode_change'
  | 'visibility_hidden'
  | 'system_suspension'
  | 'lease_lost'
  | 'storage_error';

/** Pausas da sessão atual após as quais a retomada volta ao início da frase. */
const REWIND_ON_RESUME_REASONS: ReadonlySet<PauseReason> = new Set<PauseReason>([
  'manual',
  'visibility_hidden',
  'system_suspension',
  'lease_lost',
  'storage_error',
]);

export interface EngineSnapshot {
  status: EngineStatus;
  mode: ReadingMode;
  cursor: ReadingCursor;
  currentToken: Token | null;
  tokenCount: number;
  wpm: number;
  punctuationPauseEnabled: boolean;
  activeMs: number;
  presentedCount: number;
  coverageRanges: CoverageRange[];
  modeSegments: ModeSegment[];
  settingsChanges: SpeedChangeEntry[];
  lastPauseReason: PauseReason | null;
  /** Quantos tokens a última retomada recuou para o início da frase (0 = não recuou). */
  resumeRewindTokens: number;
  /** Palavras por apresentação no RSVP (1 a 3). */
  chunkSize: number;
  /** Fim (exclusivo) do bloco exibido a partir do cursor atual. */
  chunkEndIndex: number;
}

export interface ReadingEngineOptions {
  clock: Clock;
  contentVersionId: string;
  tokens: Token[];
  initialCursorIndex?: number;
  initialWpm?: number;
  initialPunctuationPauseEnabled?: boolean;
  initialMode?: ReadingMode;
  initialActiveMs?: number;
  initialPresentedCount?: number;
  initialCoverageRanges?: CoverageRange[];
  initialModeSegments?: ModeSegment[];
  initialSettingsChanges?: SpeedChangeEntry[];
  initialChunkSize?: number;
  /** Pausas mínimas ajustadas pelo usuário e volta ao início da frase ao retomar. */
  initialPacing?: Partial<PacingSettings>;
  onStateChange?: (snapshot: EngineSnapshot) => void;
  onTokenPresented?: (snapshot: EngineSnapshot) => void;
  onTransitionCheckpoint?: (
    snapshot: EngineSnapshot,
    reason: 'pause' | 'seek' | 'mode_change' | 'completed' | 'system_suspension',
  ) => void;
}

export interface PacingSettings {
  minPauses: MinPauseConfig;
  rewindOnResume: boolean;
}

export const DEFAULT_PACING_SETTINGS: PacingSettings = {
  minPauses: BOUNDARY_MIN_PAUSE_MS,
  rewindOnResume: true,
};

export function validateWpm(wpm: number): number {
  if (!Number.isFinite(wpm) || wpm < MIN_WPM || wpm > MAX_WPM) {
    throw new AppError(
      'INVALID_SPEED',
      `A velocidade deve estar entre ${MIN_WPM} e ${MAX_WPM} PPM.`,
    );
  }
  return Math.round(wpm);
}

function clampChunkSize(size: number): number {
  if (!Number.isFinite(size)) return MIN_CHUNK_SIZE;
  return Math.min(MAX_CHUNK_SIZE, Math.max(MIN_CHUNK_SIZE, Math.trunc(size)));
}

export function clampWpmStep(wpm: number): number {
  return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(wpm)));
}

/**
 * Motor puro de leitura dinâmica (RSVP e Guiado).
 * Garante um único temporizador ativo por vez, invalidação de callbacks antigos por geração,
 * aplicação de nova velocidade na exposição seguinte e detecção de suspensão longa.
 */
export class ReadingEngine {
  private readonly clock: Clock;
  private readonly contentVersionId: string;
  private readonly tokens: Token[];

  private status: EngineStatus;
  private mode: ReadingMode;
  private tokenIndex: number;
  private wpm: number;
  private punctuationPauseEnabled: boolean;

  private activeMs: number;
  private presentedCount: number;
  private coverageRanges: CoverageRange[];
  private modeSegments: ModeSegment[];
  private settingsChanges: SpeedChangeEntry[];
  private lastPauseReason: PauseReason | null = null;
  private resumeRewindTokens = 0;
  private chunkSize: number;
  private pacing: PacingSettings;
  private boundaries: TokenBoundary[];
  private currentChunkLength = 1;
  private rampStep = RESUME_RAMP_FACTORS.length;

  private activeTimerId: number | null = null;
  private generationId = 0;
  private currentExposureStartMs: number | null = null;
  private currentExposureExpectedDurationMs = 0;
  private currentSegmentStartActiveMs = 0;

  private readonly onStateChange?: (snapshot: EngineSnapshot) => void;
  private readonly onTokenPresented?: (snapshot: EngineSnapshot) => void;
  private readonly onTransitionCheckpoint?: (
    snapshot: EngineSnapshot,
    reason: 'pause' | 'seek' | 'mode_change' | 'completed' | 'system_suspension',
  ) => void;

  constructor(options: ReadingEngineOptions) {
    this.clock = options.clock;
    this.contentVersionId = options.contentVersionId;
    this.tokens = options.tokens;

    const clampedInitialIndex = Math.max(
      0,
      Math.min(this.tokens.length, options.initialCursorIndex ?? 0),
    );
    this.tokenIndex = clampedInitialIndex;
    this.wpm = validateWpm(options.initialWpm ?? DEFAULT_WPM);
    this.punctuationPauseEnabled = options.initialPunctuationPauseEnabled ?? true;
    this.mode = options.initialMode ?? 'rsvp';
    this.chunkSize = clampChunkSize(options.initialChunkSize ?? 1);
    this.pacing = { ...DEFAULT_PACING_SETTINGS, ...options.initialPacing };
    this.boundaries = this.tokens.map((t) => t.boundary);

    this.activeMs = Math.max(0, options.initialActiveMs ?? 0);
    this.presentedCount = Math.max(0, options.initialPresentedCount ?? 0);
    this.coverageRanges = options.initialCoverageRanges
      ? options.initialCoverageRanges.map((r): CoverageRange => [r[0], r[1]])
      : [];
    this.modeSegments = options.initialModeSegments
      ? [...options.initialModeSegments]
      : [];
    this.settingsChanges = options.initialSettingsChanges
      ? [...options.initialSettingsChanges]
      : [];

    this.status =
      this.tokenIndex >= this.tokens.length && this.tokens.length > 0
        ? 'completed'
        : this.activeMs > 0 || this.tokenIndex > 0
          ? 'paused'
          : 'ready';

    this.onStateChange = options.onStateChange;
    this.onTokenPresented = options.onTokenPresented;
    this.onTransitionCheckpoint = options.onTransitionCheckpoint;
  }

  getSnapshot(): EngineSnapshot {
    const currentToken =
      this.tokenIndex >= 0 && this.tokenIndex < this.tokens.length
        ? (this.tokens[this.tokenIndex] ?? null)
        : null;

    return {
      status: this.status,
      mode: this.mode,
      cursor: {
        contentVersionId: this.contentVersionId,
        tokenIndex: this.tokenIndex,
      },
      currentToken,
      tokenCount: this.tokens.length,
      wpm: this.wpm,
      punctuationPauseEnabled: this.punctuationPauseEnabled,
      activeMs: this.activeMs,
      presentedCount: this.presentedCount,
      coverageRanges: this.coverageRanges.map((r): CoverageRange => [r[0], r[1]]),
      modeSegments: [...this.modeSegments],
      settingsChanges: [...this.settingsChanges],
      lastPauseReason: this.lastPauseReason,
      resumeRewindTokens: this.resumeRewindTokens,
      chunkSize: this.chunkSize,
      chunkEndIndex:
        this.tokenIndex < this.tokens.length
          ? findChunkEndIndex(this.boundaries, this.tokenIndex, this.chunkSize)
          : this.tokenIndex,
    };
  }

  hasActiveTimer(): boolean {
    return this.activeTimerId !== null;
  }

  play(): void {
    if (this.status === 'playing') {
      return;
    }
    if (this.tokens.length === 0) {
      return;
    }
    if (this.tokenIndex >= this.tokens.length) {
      this.status = 'completed';
      this.emitStateChange();
      return;
    }

    this.cancelCurrentTimer();

    // Ritmo inteligente: ao retomar uma pausa da sessão, recomeça do início da frase
    // (contexto) e entra com rampa curta. Seek explícito e retomada após recarga
    // continuam exatamente no token escolhido/salvo.
    this.resumeRewindTokens = 0;
    if (
      this.punctuationPauseEnabled &&
      this.pacing.rewindOnResume &&
      this.lastPauseReason !== null &&
      REWIND_ON_RESUME_REASONS.has(this.lastPauseReason)
    ) {
      const start = findSentenceStartIndex(this.boundaries, this.tokenIndex);
      this.resumeRewindTokens = this.tokenIndex - start;
      this.tokenIndex = start;
    }
    this.rampStep = this.punctuationPauseEnabled ? 0 : RESUME_RAMP_FACTORS.length;

    this.status = 'playing';
    this.lastPauseReason = null;
    this.currentSegmentStartActiveMs = this.activeMs;
    this.scheduleCurrentToken();
    this.emitStateChange();
  }

  pause(reason: PauseReason = 'manual'): void {
    if (this.status !== 'playing') {
      if (reason === 'visibility_hidden' || reason === 'lease_lost' || reason === 'storage_error') {
        this.lastPauseReason = reason;
        this.emitStateChange();
      }
      return;
    }

    const now = this.clock.now();
    if (this.currentExposureStartMs !== null) {
      const elapsed = Math.max(0, now - this.currentExposureStartMs);
      // Tempo parcial ativo fica registrado, limitado à duração planejada da exposição interrompida,
      // mas a apresentação incompleta não é contada como concluída e o cursor permanece no token atual.
      const boundedElapsed = Math.min(elapsed, this.currentExposureExpectedDurationMs);
      this.activeMs += boundedElapsed;
    }

    this.recordModeSegmentIfNeeded();
    this.cancelCurrentTimer();
    this.status = 'paused';
    this.lastPauseReason = reason;

    const snapshot = this.getSnapshot();
    this.emitStateChange();
    this.onTransitionCheckpoint?.(snapshot, 'pause');
  }

  /**
   * Altera a velocidade (100-800 PPM).
   * Se estiver em reprodução, não interrompe nem recria o temporizador atual;
   * o novo ritmo entra em vigor na próxima palavra agendada.
   */
  setWpm(newWpm: number): void {
    const validated = validateWpm(newWpm);
    if (validated === this.wpm) {
      return;
    }
    this.wpm = validated;
    this.settingsChanges.push({
      wpm: this.wpm,
      punctuationPauseEnabled: this.punctuationPauseEnabled,
      atActiveMs: this.activeMs,
      tokenIndex: this.tokenIndex,
      changedAt: new Date().toISOString(),
    });
    this.emitStateChange();
  }

  adjustWpmByStep(deltaSteps: number): number {
    const target = clampWpmStep(this.wpm + deltaSteps * WPM_STEP);
    this.setWpm(target);
    return this.wpm;
  }

  setPunctuationPauseEnabled(enabled: boolean): void {
    if (this.punctuationPauseEnabled === enabled) {
      return;
    }
    this.punctuationPauseEnabled = enabled;
    this.settingsChanges.push({
      wpm: this.wpm,
      punctuationPauseEnabled: this.punctuationPauseEnabled,
      atActiveMs: this.activeMs,
      tokenIndex: this.tokenIndex,
      changedAt: new Date().toISOString(),
    });
    this.emitStateChange();
  }

  /** Ajuste fino do ritmo inteligente; vale a partir da próxima exposição. */
  setPacing(next: Partial<PacingSettings>): void {
    this.pacing = { ...this.pacing, ...next };
  }

  /** Palavras por apresentação (1–3); vale a partir da próxima exposição. */
  setChunkSize(size: number): void {
    const next = clampChunkSize(size);
    if (next === this.chunkSize) return;
    this.chunkSize = next;
    this.emitStateChange();
  }

  /**
   * "Perdi o fio": volta ao início da frase ou do parágrafo atual (ou anterior, se já
   * estiver no começo). Se estiver tocando, continua tocando a partir dali com rampa;
   * se estiver pausado, apenas reposiciona.
   */
  rewind(unit: 'sentence' | 'paragraph'): void {
    if (this.tokens.length === 0) return;
    const fromIndex = Math.min(this.tokenIndex, this.tokens.length - 1);
    const target = findRewindTarget(this.boundaries, fromIndex, unit);
    if (this.status !== 'playing') {
      this.seek(target);
      return;
    }
    const now = this.clock.now();
    if (this.currentExposureStartMs !== null) {
      const elapsed = Math.max(0, now - this.currentExposureStartMs);
      this.activeMs += Math.min(elapsed, this.currentExposureExpectedDurationMs);
    }
    this.cancelCurrentTimer();
    this.tokenIndex = target;
    this.resumeRewindTokens = 0;
    this.rampStep = this.punctuationPauseEnabled ? 0 : RESUME_RAMP_FACTORS.length;
    this.scheduleCurrentToken();
    const snapshot = this.getSnapshot();
    this.emitStateChange();
    this.onTransitionCheckpoint?.(snapshot, 'seek');
  }

  /**
   * Reposiciona o cursor pausando antes e sem contar tokens saltados como apresentados.
   */
  seek(targetIndex: number): void {
    if (this.status === 'playing') {
      const now = this.clock.now();
      if (this.currentExposureStartMs !== null) {
        const elapsed = Math.max(0, now - this.currentExposureStartMs);
        this.activeMs += Math.min(elapsed, this.currentExposureExpectedDurationMs);
      }
      this.recordModeSegmentIfNeeded();
      this.cancelCurrentTimer();
    } else {
      this.cancelCurrentTimer();
    }

    const clamped = Math.max(0, Math.min(this.tokens.length, Math.trunc(targetIndex)));
    this.tokenIndex = clamped;
    this.status = clamped >= this.tokens.length ? 'completed' : 'paused';
    this.lastPauseReason = 'seek';

    const snapshot = this.getSnapshot();
    this.emitStateChange();
    this.onTransitionCheckpoint?.(snapshot, 'seek');
  }

  stepBy(deltaTokens: number): void {
    const maxReadableIndex = Math.max(0, this.tokens.length - 1);
    const target = Math.max(0, Math.min(maxReadableIndex, this.tokenIndex + deltaTokens));
    this.seek(target);
  }

  setMode(newMode: ReadingMode): void {
    if (this.mode === newMode && this.status !== 'playing') {
      return;
    }
    if (this.status === 'playing') {
      const now = this.clock.now();
      if (this.currentExposureStartMs !== null) {
        const elapsed = Math.max(0, now - this.currentExposureStartMs);
        this.activeMs += Math.min(elapsed, this.currentExposureExpectedDurationMs);
      }
      this.recordModeSegmentIfNeeded();
      this.cancelCurrentTimer();
      this.status = 'paused';
      this.lastPauseReason = 'mode_change';
    }
    this.mode = newMode;
    const snapshot = this.getSnapshot();
    this.emitStateChange();
    this.onTransitionCheckpoint?.(snapshot, 'mode_change');
  }

  destroy(): void {
    this.cancelCurrentTimer();
  }

  private cancelCurrentTimer(): void {
    this.generationId++;
    if (this.activeTimerId !== null) {
      this.clock.cancel(this.activeTimerId);
      this.activeTimerId = null;
    }
    this.currentExposureStartMs = null;
    this.currentExposureExpectedDurationMs = 0;
  }

  private recordModeSegmentIfNeeded(): void {
    if (this.activeMs > this.currentSegmentStartActiveMs) {
      this.modeSegments.push({
        mode: this.mode,
        startedAtActiveMs: this.currentSegmentStartActiveMs,
        endedAtActiveMs: this.activeMs,
      });
      this.currentSegmentStartActiveMs = this.activeMs;
    }
  }

  private scheduleCurrentToken(): void {
    const token = this.tokens[this.tokenIndex];
    if (!token) {
      this.status = 'completed';
      this.emitStateChange();
      return;
    }

    const rampFactor = this.punctuationPauseEnabled
      ? (RESUME_RAMP_FACTORS[this.rampStep] ?? 1)
      : 1;
    const chunkEnd = findChunkEndIndex(this.boundaries, this.tokenIndex, this.chunkSize);
    this.currentChunkLength = Math.max(1, chunkEnd - this.tokenIndex);
    const durationMs = calculateChunkDurationMs(
      this.tokens.slice(this.tokenIndex, chunkEnd),
      this.wpm,
      this.punctuationPauseEnabled,
      rampFactor,
      this.pacing.minPauses,
    );

    const expectedGen = ++this.generationId;
    this.currentExposureStartMs = this.clock.now();
    this.currentExposureExpectedDurationMs = durationMs;

    this.activeTimerId = this.clock.schedule(() => {
      this.handleTokenTimerFired(expectedGen);
    }, durationMs);
  }

  private handleTokenTimerFired(firedGeneration: number): void {
    // Invalida qualquer callback antigo após pause, seek, remount ou troca de estado
    if (firedGeneration !== this.generationId || this.status !== 'playing') {
      return;
    }

    this.activeTimerId = null;
    const now = this.clock.now();
    const startMs = this.currentExposureStartMs ?? now;
    const expectedMs = this.currentExposureExpectedDurationMs;
    const actualElapsedMs = Math.max(expectedMs, now - startMs);
    const excessLagMs = actualElapsedMs - expectedMs;

    // Detecção de suspensão longa (ARCHITECTURE.md 6.2):
    // Se o atraso exceder 1 s E 3 durações previstas (ou > Math.max(1000, expectedMs * 3)),
    // pausar como interrupção e não somar o excesso ao tempo ativo nem saltar palavras.
    const suspensionThresholdMs = Math.max(1000, expectedMs * 3);
    if (excessLagMs > suspensionThresholdMs) {
      this.activeMs += expectedMs;
      this.recordModeSegmentIfNeeded();
      this.cancelCurrentTimer();
      this.status = 'paused';
      this.lastPauseReason = 'system_suspension';
      const snapshot = this.getSnapshot();
      this.emitStateChange();
      this.onTransitionCheckpoint?.(snapshot, 'system_suspension');
      return;
    }

    // Exposição concluída normalmente
    this.activeMs += actualElapsedMs;
    const presentedLength = this.currentChunkLength;
    this.presentedCount += presentedLength;
    this.rampStep += 1;
    this.coverageRanges = mergeCoverageRange(this.coverageRanges, [
      this.tokenIndex,
      this.tokenIndex + presentedLength,
    ]);
    this.tokenIndex += presentedLength;

    if (this.tokenIndex >= this.tokens.length) {
      this.recordModeSegmentIfNeeded();
      this.cancelCurrentTimer();
      this.status = 'completed';
      this.lastPauseReason = null;
      const finalSnapshot = this.getSnapshot();
      this.onTokenPresented?.(finalSnapshot);
      this.emitStateChange();
      this.onTransitionCheckpoint?.(finalSnapshot, 'completed');
      return;
    }

    // Agenda próximo token com sua duração integral (nunca salta tokens para compensar atraso)
    this.scheduleCurrentToken();
    const snapshot = this.getSnapshot();
    this.onTokenPresented?.(snapshot);
    this.emitStateChange();
  }

  private emitStateChange(): void {
    this.onStateChange?.(this.getSnapshot());
  }
}
