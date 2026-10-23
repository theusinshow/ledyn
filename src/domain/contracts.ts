export type TokenBoundary = 'none' | 'clause' | 'sentence' | 'paragraph';

export type Token = {
  index: number;
  text: string;
  start: number; // offset UTF-16 inclusivo no texto normalizado
  end: number;   // offset UTF-16 exclusivo
  blockId: string;
  boundary: TokenBoundary;
};

export type ReadingCursor = {
  contentVersionId: string;
  tokenIndex: number; // 0..tokenCount; tokenCount = fim
};

export type SourceAnchor =
  | { kind: 'text'; originalStart: number; originalEnd: number }
  | { kind: 'pdf'; page: number; itemStart: number; itemEnd: number }
  | { kind: 'epub'; spineIndex: number; href: string; blockPath: string };

export type ContentBlock = {
  id: string;
  index: number;
  startOffset: number; // offset UTF-16 inclusivo no normalizedText
  endOffset: number;   // offset UTF-16 exclusivo no normalizedText
  anchor: SourceAnchor;
};

export type ImportIssue = {
  code: string;
  severity: 'warning' | 'error';
  message: string;
};

export type DocumentFormat = 'pasted' | 'txt' | 'pdf' | 'epub';

export type DocumentRecord = {
  id: string;
  title: string;
  format: DocumentFormat;
  sourceHash: string;
  contentVersionId: string;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  warnings: ImportIssue[];
  isTraining: boolean;
};

export type SourceFileRecord = {
  documentId: string;
  blob: Blob;
  originalName: string;
  mime: string;
  byteSize: number;
  sha256: string;
};

export type ContentRecord = {
  id: string;
  documentId: string;
  normalizationVersion: number;
  tokenizerVersion: number;
  normalizedText: string;
  blocks: ContentBlock[];
  tokenCount: number;
  contentHash: string;
};

export type TokenChunkRecord = {
  contentVersionId: string;
  chunkIndex: number;
  tokens: Token[];
};

export type ProgressRecord = {
  documentId: string;
  contentVersionId: string;
  cursor: ReadingCursor;
  completed: boolean;
  updatedAt: string;
  revision: number;
};

/**
 * Intervalo [startTokenIndex, endTokenIndex) de tokens cuja exposição foi concluída.
 */
export type CoverageRange = [number, number];

export type ReadingMode = 'rsvp' | 'guided';

export type ModeSegment = {
  mode: ReadingMode;
  startedAtActiveMs: number;
  endedAtActiveMs: number;
};

export type SpeedChangeEntry = {
  wpm: number;
  punctuationPauseEnabled: boolean;
  atActiveMs: number;
  tokenIndex: number;
  changedAt: string;
};

export type SessionStatus = 'playing' | 'paused' | 'completed' | 'interrupted';

export type SessionRecord = {
  id: string;
  documentId: string;
  contentVersionId: string;
  status: SessionStatus;
  currentMode?: ReadingMode;
  modeSegments: ModeSegment[];
  startedAt: string;
  endedAt: string | null;
  activeMs: number;
  presentedCount: number;
  coverageRanges: CoverageRange[];
  settingsChanges: SpeedChangeEntry[];
  cursor: ReadingCursor;
  checkpointRevision: number;
  recoveredFromInterruption?: boolean;
};

export type QuestionOption = {
  id: string;
  text: string;
};

export type QuestionItem = {
  id: string;
  prompt: string;
  options: [QuestionOption, QuestionOption, QuestionOption, QuestionOption];
  correctOptionId: string;
  explanation: string;
  sourceQuote: string;
  sourceStartOffset: number;
  sourceEndOffset: number;
};

export type QuestionSetRecord = {
  id: string;
  contentVersionId: string;
  version: number;
  questions: QuestionItem[];
  source: 'built-in-training';
  reviewStatus: 'technical_verified_pending_human' | 'human_reviewed';
};

export type QuizAttemptStatus = 'draft' | 'submitted' | 'abandoned';

export type QuizAttemptRecord = {
  id: string;
  sessionId: string;
  questionSetId: string;
  questionSetVersion: number;
  answers: Record<string, string>;
  status: QuizAttemptStatus;
  correctCount: number | null;
  totalCount: number;
  submittedAt: string | null;
  repeated: boolean;
};

export type ReflectionRecord = {
  id: string;
  sessionId: string;
  text: string;
  updatedAt: string;
};

export type SettingKey =
  | 'theme'
  | 'defaultWpm'
  | 'punctuationPauseEnabled'
  | 'guidedFontSizePx'
  | 'reducedMotion'
  | 'rsvpChunkSize'
  | 'pauseClauseMs'
  | 'pauseSentenceMs'
  | 'pauseParagraphMs'
  | 'resumeRewindEnabled'
  | 'showContextTrail';

export type SettingRecord<T = unknown> = {
  key: SettingKey;
  value: T;
  schemaVersion: number;
};

export type LeaseRecord = {
  key: string;
  ownerId: string;
  sessionId: string;
  documentId: string;
  expiresAt: number;
  revision: number;
};
