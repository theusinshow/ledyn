import { strFromU8, strToU8, Unzip, UnzipInflate, UnzipPassThrough, zipSync } from 'fflate';
import { z } from 'zod';
import { verifyQuestionSetIntegrity } from '@/domain/comprehension/quiz';
import type {
  ContentRecord,
  DocumentRecord,
  ProgressRecord,
  QuestionItem,
  QuestionOption,
  QuestionSetRecord,
  QuizAttemptRecord,
  ReflectionRecord,
  SessionRecord,
  SettingRecord,
  SourceFileRecord,
  TokenChunkRecord,
} from '@/domain/contracts';
import { NORMALIZATION_VERSION } from '@/domain/documents/normalizer';
import { TOKENIZER_VERSION } from '@/domain/documents/tokenizer';
import {
  DB_SCHEMA_VERSION,
  db,
  type LedynDatabase,
} from '@/infrastructure/db/database';
import { ACTIVE_READING_LEASE_KEY } from '@/infrastructure/db/leaseManager';
import { AppError, toAppError } from '@/shared/errors';
import { computeSha256Hex } from '@/shared/utils';

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_APP_VERSION = '0.1.0';

export const MAX_BACKUP_COMPRESSED_BYTES = 150 * 1024 * 1024; // 150 MiB
export const MAX_BACKUP_ENTRIES = 10_000;
export const MAX_BACKUP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MiB
export const MAX_BACKUP_SOURCE_FILE_BYTES = 40 * 1024 * 1024; // 40 MiB

export interface BackupLimitsConfig {
  maxCompressedBytes?: number;
  maxEntries?: number;
  maxUncompressedBytes?: number;
  maxSourceFileBytes?: number;
}

export interface BackupManifestFileEntry {
  path: string;
  byteSize: number;
  sha256: string;
}

export interface BackupManifest {
  formatVersion: number;
  appVersion: string;
  dbSchemaVersion: number;
  normalizationVersion: number;
  tokenizerVersion: number;
  exportedAt: string;
  encrypted: false;
  counts: {
    documents: number;
    sourceFiles: number;
    contents: number;
    tokenChunks: number;
    progress: number;
    sessions: number;
    questionSets: number;
    quizAttempts: number;
    reflections: number;
    settings: number;
  };
  files: BackupManifestFileEntry[];
}

export interface SerializedSourceFileMeta {
  documentId: string;
  originalName: string;
  mime: string;
  byteSize: number;
  sha256: string;
  archivePath: string;
}

export interface ExportedBackupResult {
  fileName: string;
  zipBytes: Uint8Array;
  blob: Blob;
  byteSize: number;
  manifest: BackupManifest;
  unencryptedNotice: string;
}

export interface RestoreBackupResult {
  manifest: BackupManifest;
  restoredCounts: BackupManifest['counts'];
}

function isZipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

export function isUnsafeBackupEntryPath(entryPath: string): boolean {
  if (!entryPath || entryPath.startsWith('/') || entryPath.startsWith('\\')) {
    return true;
  }
  if (
    entryPath.includes('\\') ||
    entryPath.includes('\0') ||
    /^[a-zA-Z]:/.test(entryPath)
  ) {
    return true;
  }
  const segments = entryPath.split('/');
  return segments.some((seg) => !seg || seg === '.' || seg === '..');
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    const ab = await blob.arrayBuffer();
    return new Uint8Array(ab);
  }
  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('Falha ao ler Blob binário.'));
      }
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('Erro de leitura de Blob.'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Descompacta incrementalmente um arquivo `.reading-backup.zip` aplicando limites reais
 * de tamanho comprimido, quantidade de entradas, caminhos seguros e bytes expandidos (AC-25 / FX-11).
 */
export function unpackBackupZipSafely(
  zipBytes: Uint8Array,
  limits?: BackupLimitsConfig,
): Map<string, Uint8Array> {
  const maxCompressedBytes =
    limits?.maxCompressedBytes ?? MAX_BACKUP_COMPRESSED_BYTES;
  const maxEntries = limits?.maxEntries ?? MAX_BACKUP_ENTRIES;
  const maxUncompressedBytes =
    limits?.maxUncompressedBytes ?? MAX_BACKUP_UNCOMPRESSED_BYTES;

  if (zipBytes.byteLength > maxCompressedBytes) {
    throw new AppError(
      'LIMIT_EXCEEDED',
      `O arquivo de backup comprimido excede o limite de ${Math.round(maxCompressedBytes / (1024 * 1024))} MiB.`,
    );
  }

  if (!isZipSignature(zipBytes)) {
    throw new AppError(
      'BACKUP_INVALID',
      'O arquivo selecionado não é um pacote ZIP válido (.reading-backup.zip).',
    );
  }

  const entries = new Map<string, Uint8Array>();
  let entryCount = 0;
  let totalUncompressedBytes = 0;
  let capturedError: AppError | null = null;

  const unzipper = new Unzip((file) => {
    if (capturedError) return;

    // Ignorar entradas de diretório vazio se existirem, mas validar caminho
    if (file.name.endsWith('/')) {
      return;
    }

    entryCount += 1;
    if (entryCount > maxEntries) {
      capturedError = new AppError(
        'LIMIT_EXCEEDED',
        `O backup excede o limite de ${maxEntries} entradas internas.`,
      );
      return;
    }

    if (isUnsafeBackupEntryPath(file.name)) {
      capturedError = new AppError(
        'BACKUP_INVALID',
        `Caminho interno inválido ou inseguro no pacote de backup: ${file.name}`,
      );
      return;
    }

    if (entries.has(file.name)) {
      capturedError = new AppError(
        'BACKUP_INVALID',
        `Entrada duplicada no pacote de backup: ${file.name}`,
      );
      return;
    }

    const chunks: Uint8Array[] = [];
    let fileBytes = 0;

    file.ondata = (err, chunk, final) => {
      if (capturedError) return;
      if (err) {
        capturedError = new AppError(
          'BACKUP_INVALID',
          `Falha ao descompactar a entrada ${file.name} do backup.`,
          { cause: err },
        );
        return;
      }

      if (chunk && chunk.byteLength > 0) {
        fileBytes += chunk.byteLength;
        totalUncompressedBytes += chunk.byteLength;

        if (totalUncompressedBytes > maxUncompressedBytes) {
          capturedError = new AppError(
            'LIMIT_EXCEEDED',
            `O conteúdo expandido do backup excede o limite de segurança (${Math.round(maxUncompressedBytes / (1024 * 1024))} MiB).`,
          );
          return;
        }
        chunks.push(chunk);
      }

      if (final) {
        const merged = new Uint8Array(fileBytes);
        let offset = 0;
        for (const part of chunks) {
          merged.set(part, offset);
          offset += part.byteLength;
        }
        entries.set(file.name, merged);
      }
    };

    file.start();
  });

  unzipper.register(UnzipPassThrough);
  unzipper.register(UnzipInflate);

  try {
    unzipper.push(zipBytes, true);
  } catch (err) {
    if (capturedError) {
      throw capturedError;
    }
    throw new AppError(
      'BACKUP_INVALID',
      'Não foi possível abrir o arquivo ZIP de backup (estrutura corrompida).',
      { cause: err },
    );
  }

  if (capturedError) {
    throw capturedError;
  }

  return entries;
}

/**
 * Verifica se a biblioteca local possui dados pessoais que impeçam restauração direta (AC-25).
 * Seeds de treino intocados (sem sessões, sem tentativas e com cursor em 0) e configurações padrão são permitidos.
 */
export async function hasPersonalDataInLibrary(
  database: LedynDatabase = db,
): Promise<{
  hasPersonalData: boolean;
  personalDocumentsCount: number;
  sessionsCount: number;
  quizAttemptsCount: number;
  reflectionsCount: number;
}> {
  const allDocs = await database.documents.toArray();
  const personalDocumentsCount = allDocs.filter((d) => !d.isTraining).length;
  const sessionsCount = await database.sessions.count();
  const quizAttemptsCount = await database.quizAttempts.count();
  const reflectionsCount = await database.reflections.count();

  const allProgress = await database.progress.toArray();
  const hasPracticedProgress = allProgress.some(
    (p) => p.cursor.tokenIndex > 0 || p.completed,
  );

  const hasPersonalData =
    personalDocumentsCount > 0 ||
    sessionsCount > 0 ||
    quizAttemptsCount > 0 ||
    reflectionsCount > 0 ||
    hasPracticedProgress;

  return {
    hasPersonalData,
    personalDocumentsCount,
    sessionsCount,
    quizAttemptsCount,
    reflectionsCount,
  };
}

/**
 * Limpa transacionalmente todos os dados pessoais da base local mediante confirmação explícita do usuário,
 * deixando a biblioteca vazia e pronta para receber a restauração de um backup.
 */
export async function clearAllPersonalDataTransactional(
  database: LedynDatabase = db,
  nowMs: number = Date.now(),
): Promise<void> {
  try {
    await database.transaction(
      'rw',
      [
        database.documents,
        database.sourceFiles,
        database.contents,
        database.tokenChunks,
        database.progress,
        database.sessions,
        database.questionSets,
        database.quizAttempts,
        database.reflections,
        database.leases,
      ],
      async () => {
        const activeLease = await database.leases.get(ACTIVE_READING_LEASE_KEY);
        if (activeLease && activeLease.expiresAt > nowMs) {
          throw new AppError(
            'SESSION_LOCKED',
            'Pause a leitura ativa antes de limpar os dados locais.',
          );
        }

        await database.quizAttempts.clear();
        await database.reflections.clear();
        await database.sessions.clear();
        await database.progress.clear();
        await database.questionSets.clear();
        await database.tokenChunks.clear();
        await database.contents.clear();
        await database.sourceFiles.clear();
        await database.documents.clear();
        await database.leases.clear();
      },
    );
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

// Schemas Zod para validação estrita na restauração (ARCHITECTURE.md seção 10)
const ManifestFileEntrySchema = z.object({
  path: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const BackupManifestSchema = z.object({
  formatVersion: z.number().int(),
  appVersion: z.string().min(1),
  dbSchemaVersion: z.number().int(),
  normalizationVersion: z.number().int(),
  tokenizerVersion: z.number().int(),
  exportedAt: z.string().min(1),
  encrypted: z.literal(false),
  counts: z.object({
    documents: z.number().int().nonnegative(),
    sourceFiles: z.number().int().nonnegative(),
    contents: z.number().int().nonnegative(),
    tokenChunks: z.number().int().nonnegative(),
    progress: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    questionSets: z.number().int().nonnegative(),
    quizAttempts: z.number().int().nonnegative(),
    reflections: z.number().int().nonnegative(),
    settings: z.number().int().nonnegative(),
  }),
  files: z.array(ManifestFileEntrySchema),
});

const SourceAnchorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    originalStart: z.number().int().nonnegative(),
    originalEnd: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('pdf'),
    page: z.number().int().positive(),
    itemStart: z.number().int().nonnegative(),
    itemEnd: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('epub'),
    spineIndex: z.number().int().nonnegative(),
    href: z.string(),
    blockPath: z.string(),
  }),
]);

const DocumentRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  format: z.enum(['pasted', 'txt', 'pdf', 'epub']),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  contentVersionId: z.string().min(1),
  tokenCount: z.number().int().positive(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  lastOpenedAt: z.string().min(1),
  warnings: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(['warning', 'error']),
      message: z.string(),
    }),
  ),
  isTraining: z.boolean(),
});

const SerializedSourceFileMetaSchema = z.object({
  documentId: z.string().min(1),
  originalName: z.string().min(1),
  mime: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  archivePath: z.string().min(1),
});

const ContentRecordSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  normalizationVersion: z.number().int(),
  tokenizerVersion: z.number().int(),
  normalizedText: z.string().min(1),
  blocks: z.array(
    z.object({
      id: z.string().min(1),
      index: z.number().int().nonnegative(),
      startOffset: z.number().int().nonnegative(),
      endOffset: z.number().int().nonnegative(),
      anchor: SourceAnchorSchema,
    }),
  ),
  tokenCount: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});

const TokenSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  blockId: z.string().min(1),
  boundary: z.enum(['none', 'clause', 'sentence', 'paragraph']),
});

const TokenChunkRecordSchema = z.object({
  contentVersionId: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  tokens: z.array(TokenSchema),
});

const ReadingCursorSchema = z.object({
  contentVersionId: z.string().min(1),
  tokenIndex: z.number().int().nonnegative(),
});

const ProgressRecordSchema = z.object({
  documentId: z.string().min(1),
  contentVersionId: z.string().min(1),
  cursor: ReadingCursorSchema,
  completed: z.boolean(),
  updatedAt: z.string().min(1),
  revision: z.number().int().nonnegative(),
});

const SessionRecordSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  contentVersionId: z.string().min(1),
  status: z.enum(['playing', 'paused', 'completed', 'interrupted']),
  currentMode: z.enum(['rsvp', 'guided']).optional(),
  modeSegments: z.array(
    z.object({
      mode: z.enum(['rsvp', 'guided']),
      startedAtActiveMs: z.number().nonnegative(),
      endedAtActiveMs: z.number().nonnegative(),
    }),
  ),
  startedAt: z.string().min(1),
  endedAt: z.string().nullable(),
  activeMs: z.number().int().nonnegative(),
  presentedCount: z.number().int().nonnegative(),
  coverageRanges: z.array(
    z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  ),
  settingsChanges: z.array(
    z.object({
      wpm: z.number().int().positive(),
      punctuationPauseEnabled: z.boolean(),
      atActiveMs: z.number().nonnegative(),
      tokenIndex: z.number().int().nonnegative(),
      changedAt: z.string().min(1),
    }),
  ),
  cursor: ReadingCursorSchema,
  checkpointRevision: z.number().int().nonnegative(),
  recoveredFromInterruption: z.boolean().optional(),
});

const QuestionOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

const QuestionSetRecordSchema = z.object({
  id: z.string().min(1),
  contentVersionId: z.string().min(1),
  version: z.number().int().positive(),
  questions: z.array(
    z.object({
      id: z.string().min(1),
      prompt: z.string().min(1),
      options: z.tuple([
        QuestionOptionSchema,
        QuestionOptionSchema,
        QuestionOptionSchema,
        QuestionOptionSchema,
      ]),
      correctOptionId: z.string().min(1),
      explanation: z.string().min(1),
      sourceQuote: z.string().min(1),
      sourceStartOffset: z.number().int().nonnegative(),
      sourceEndOffset: z.number().int().positive(),
    }),
  ),
  source: z.literal('built-in-training'),
  reviewStatus: z.enum([
    'technical_verified_pending_human',
    'human_reviewed',
  ]),
});

const QuizAttemptRecordSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  questionSetId: z.string().min(1),
  questionSetVersion: z.number().int().positive(),
  answers: z.record(z.string(), z.string()),
  status: z.enum(['draft', 'submitted', 'abandoned']),
  correctCount: z.number().int().nonnegative().nullable(),
  totalCount: z.number().int().positive(),
  submittedAt: z.string().nullable(),
  repeated: z.boolean(),
});

const ReflectionRecordSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  text: z.string().min(1),
  updatedAt: z.string().min(1),
});

const SettingRecordSchema = z.object({
  key: z.enum([
    'theme',
    'defaultWpm',
    'punctuationPauseEnabled',
    'guidedFontSizePx',
    'reducedMotion',
    'rsvpChunkSize',
  ]),
  value: z.unknown(),
  schemaVersion: z.number().int().positive(),
});

/**
 * Exporta o backup completo `.reading-backup.zip` contendo manifesto com SHA-256,
 * todas as entidades duráveis e os arquivos originais binários reais (RF-10 / AC-24).
 */
export async function exportFullBackupZip(options?: {
  database?: LedynDatabase;
  nowMs?: number;
  limits?: BackupLimitsConfig;
}): Promise<ExportedBackupResult> {
  const database = options?.database ?? db;
  const nowMs = options?.nowMs ?? Date.now();
  const maxCompressedBytes =
    options?.limits?.maxCompressedBytes ?? MAX_BACKUP_COMPRESSED_BYTES;
  const maxEntries = options?.limits?.maxEntries ?? MAX_BACKUP_ENTRIES;
  const maxUncompressedBytes =
    options?.limits?.maxUncompressedBytes ?? MAX_BACKUP_UNCOMPRESSED_BYTES;
  const maxSourceFileBytes =
    options?.limits?.maxSourceFileBytes ?? MAX_BACKUP_SOURCE_FILE_BYTES;

  const activeLease = await database.leases.get(ACTIVE_READING_LEASE_KEY);
  if (activeLease && activeLease.expiresAt > nowMs) {
    throw new AppError(
      'SESSION_LOCKED',
      'Pause a leitura ativa antes de exportar o backup para garantir consistência.',
    );
  }

  const [
    documents,
    sourceFiles,
    contents,
    tokenChunks,
    progress,
    sessions,
    questionSets,
    quizAttempts,
    reflections,
    settings,
  ] = await database.transaction(
    'r',
    [
      database.documents,
      database.sourceFiles,
      database.contents,
      database.tokenChunks,
      database.progress,
      database.sessions,
      database.questionSets,
      database.quizAttempts,
      database.reflections,
      database.settings,
    ],
    async () => {
      return Promise.all([
        database.documents.toArray(),
        database.sourceFiles.toArray(),
        database.contents.toArray(),
        database.tokenChunks.toArray(),
        database.progress.toArray(),
        database.sessions.toArray(),
        database.questionSets.toArray(),
        database.quizAttempts.toArray(),
        database.reflections.toArray(),
        database.settings.toArray(),
      ]);
    },
  );

  const zipFilesRecord: Record<string, Uint8Array> = {};
  const manifestFiles: BackupManifestFileEntry[] = [];
  let totalUncompressedBytes = 0;

  const addEntry = async (path: string, bytes: Uint8Array) => {
    if (isUnsafeBackupEntryPath(path)) {
      throw new AppError(
        'BACKUP_INVALID',
        `Caminho de exportação inválido: ${path}`,
      );
    }
    totalUncompressedBytes += bytes.byteLength;
    if (totalUncompressedBytes > maxUncompressedBytes) {
      throw new AppError(
        'LIMIT_EXCEEDED',
        `O acervo local excede o limite de exportação desta versão (${Math.round(maxUncompressedBytes / (1024 * 1024))} MiB não comprimidos). Remova documentos grandes antes de exportar.`,
      );
    }
    const sha256 = await computeSha256Hex(bytes);
    zipFilesRecord[path] = bytes;
    manifestFiles.push({
      path,
      byteSize: bytes.byteLength,
      sha256,
    });
  };

  // 1. Empacota os originais binários reais (nunca serializa Blob vazio)
  const serializedSourcesMeta: SerializedSourceFileMeta[] = [];
  for (const sf of sourceFiles) {
    const rawBytes = await readBlobBytes(sf.blob);
    if (rawBytes.byteLength > maxSourceFileBytes) {
      throw new AppError(
        'FILE_TOO_LARGE',
        `O arquivo original do documento ${sf.documentId} excede o limite de 40 MiB.`,
      );
    }
    const computedHash = await computeSha256Hex(rawBytes);
    const archivePath = `sources/${sf.documentId}.bin`;
    await addEntry(archivePath, rawBytes);
    serializedSourcesMeta.push({
      documentId: sf.documentId,
      originalName: sf.originalName,
      mime: sf.mime || 'application/octet-stream',
      byteSize: rawBytes.byteLength,
      sha256: computedHash,
      archivePath,
    });
  }

  // 2. Empacota todas as entidades JSON versionadas
  const jsonPayloads: Array<[string, unknown]> = [
    ['data/documents.json', documents],
    ['data/source-files.json', serializedSourcesMeta],
    ['data/contents.json', contents],
    ['data/token-chunks.json', tokenChunks],
    ['data/progress.json', progress],
    ['data/sessions.json', sessions],
    ['data/question-sets.json', questionSets],
    ['data/quiz-attempts.json', quizAttempts],
    ['data/reflections.json', reflections],
    ['data/settings.json', settings],
  ];

  for (const [path, data] of jsonPayloads) {
    const jsonBytes = strToU8(JSON.stringify(data, null, 2));
    await addEntry(path, jsonBytes);
  }

  // +1 para o manifest.json
  if (manifestFiles.length + 1 > maxEntries) {
    throw new AppError(
      'LIMIT_EXCEEDED',
      `O acervo excede o limite de ${maxEntries} entradas no arquivo de backup.`,
    );
  }

  const exportedAt = new Date(nowMs).toISOString();
  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: BACKUP_APP_VERSION,
    dbSchemaVersion: DB_SCHEMA_VERSION,
    normalizationVersion: NORMALIZATION_VERSION,
    tokenizerVersion: TOKENIZER_VERSION,
    exportedAt,
    encrypted: false,
    counts: {
      documents: documents.length,
      sourceFiles: serializedSourcesMeta.length,
      contents: contents.length,
      tokenChunks: tokenChunks.length,
      progress: progress.length,
      sessions: sessions.length,
      questionSets: questionSets.length,
      quizAttempts: quizAttempts.length,
      reflections: reflections.length,
      settings: settings.length,
    },
    files: manifestFiles,
  };

  zipFilesRecord['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  const zipBytes = zipSync(zipFilesRecord, { level: 6 });
  if (zipBytes.byteLength > maxCompressedBytes) {
    throw new AppError(
      'LIMIT_EXCEEDED',
      `O arquivo ZIP gerado excede o limite de ${Math.round(maxCompressedBytes / (1024 * 1024))} MiB.`,
    );
  }

  const buffer = new ArrayBuffer(zipBytes.byteLength);
  new Uint8Array(buffer).set(zipBytes);
  const blob = new Blob([buffer], { type: 'application/zip' });
  const dateSlug = exportedAt.slice(0, 10);
  const fileName = `ledyn-${dateSlug}.reading-backup.zip`;

  return {
    fileName,
    zipBytes,
    blob,
    byteSize: zipBytes.byteLength,
    manifest,
    unencryptedNotice:
      'Aviso de privacidade: o arquivo .reading-backup.zip contém seus textos, originais e histórico em formato legível sem criptografia.',
  };
}

/**
 * Restaura transacionalmente um backup `.reading-backup.zip` somente em biblioteca sem dados pessoais,
 * validando versão, limites de expansão, integridade SHA-256 e relacionamentos antes de abrir a transação (AC-24 / AC-25).
 */
export async function restoreFullBackupZip(
  zipBytes: Uint8Array,
  options?: {
    database?: LedynDatabase;
    nowMs?: number;
    limits?: BackupLimitsConfig;
    faultInjectionHook?: () => Promise<void> | void;
  },
): Promise<RestoreBackupResult> {
  const database = options?.database ?? db;
  const nowMs = options?.nowMs ?? Date.now();
  const maxSourceFileBytes =
    options?.limits?.maxSourceFileBytes ?? MAX_BACKUP_SOURCE_FILE_BYTES;

  // 1. Verificar ausência de sessão ativa e ausência de dados pessoais antes de processar
  const activeLease = await database.leases.get(ACTIVE_READING_LEASE_KEY);
  if (activeLease && activeLease.expiresAt > nowMs) {
    throw new AppError(
      'SESSION_LOCKED',
      'Existe uma sessão de leitura ativa. Pause a leitura antes de restaurar um backup.',
    );
  }

  const libraryStatus = await hasPersonalDataInLibrary(database);
  if (libraryStatus.hasPersonalData) {
    throw new AppError(
      'RESTORE_REQUIRES_EMPTY_LIBRARY',
      'A restauração exige uma biblioteca sem dados pessoais. Esta versão não mescla nem sobrescreve acervos automaticamente; exporte um backup atual ou use a opção de limpar dados locais antes de restaurar.',
    );
  }

  // 2. Descompactar com limites estritos de entradas, caminhos e tamanho real
  const entries = unpackBackupZipSafely(zipBytes, options?.limits);

  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes) {
    throw new AppError(
      'BACKUP_INVALID',
      'O pacote de backup não contém o arquivo obrigatório manifest.json.',
    );
  }

  let rawManifestJson: unknown;
  try {
    rawManifestJson = JSON.parse(strFromU8(manifestBytes));
  } catch (err) {
    throw new AppError(
      'BACKUP_INVALID',
      'O arquivo manifest.json do backup não é um JSON válido.',
      { cause: err },
    );
  }

  // Verificar versões antes da validação estrutural completa para reportar BACKUP_VERSION_UNSUPPORTED quando aplicável
  if (
    typeof rawManifestJson === 'object' &&
    rawManifestJson !== null &&
    'formatVersion' in rawManifestJson
  ) {
    const fv = (rawManifestJson as Record<string, unknown>).formatVersion;
    const dbv = (rawManifestJson as Record<string, unknown>).dbSchemaVersion;
    const nv = (rawManifestJson as Record<string, unknown>).normalizationVersion;
    const tv = (rawManifestJson as Record<string, unknown>).tokenizerVersion;

    if (
      typeof fv === 'number' &&
      typeof dbv === 'number' &&
      typeof nv === 'number' &&
      typeof tv === 'number' &&
      (fv !== BACKUP_FORMAT_VERSION ||
        dbv !== DB_SCHEMA_VERSION ||
        nv !== NORMALIZATION_VERSION ||
        tv !== TOKENIZER_VERSION)
    ) {
      throw new AppError(
        'BACKUP_VERSION_UNSUPPORTED',
        `Versão de backup incompatível (format=${fv}, schema=${dbv}, norm=${nv}, tok=${tv}).`,
      );
    }
  }

  const parsedManifestResult = BackupManifestSchema.safeParse(rawManifestJson);
  if (!parsedManifestResult.success) {
    throw new AppError(
      'BACKUP_INVALID',
      'O manifesto do backup possui formato ou campos inválidos.',
    );
  }
  const manifest = parsedManifestResult.data;

  // 3. Validar presença, tamanho exato e hash SHA-256 de cada arquivo declarado no manifesto
  const declaredPaths = new Set<string>(['manifest.json']);
  for (const fileEntry of manifest.files) {
    if (isUnsafeBackupEntryPath(fileEntry.path)) {
      throw new AppError(
        'BACKUP_INVALID',
        `Caminho inválido no manifesto: ${fileEntry.path}`,
      );
    }
    const actualBytes = entries.get(fileEntry.path);
    if (!actualBytes) {
      throw new AppError(
        'BACKUP_INVALID',
        `Arquivo listado no manifesto está ausente no pacote ZIP: ${fileEntry.path}`,
      );
    }
    if (actualBytes.byteLength !== fileEntry.byteSize) {
      throw new AppError(
        'BACKUP_INVALID',
        `Tamanho divergente para a entrada ${fileEntry.path} no backup.`,
      );
    }
    const actualSha256 = await computeSha256Hex(actualBytes);
    if (actualSha256 !== fileEntry.sha256) {
      throw new AppError(
        'BACKUP_INVALID',
        `Falha de integridade (SHA-256 divergente) na entrada ${fileEntry.path}.`,
      );
    }
    declaredPaths.add(fileEntry.path);
  }

  // Rejeitar arquivos extras não declarados no manifesto
  for (const archivePath of entries.keys()) {
    if (!declaredPaths.has(archivePath)) {
      throw new AppError(
        'BACKUP_INVALID',
        `O pacote ZIP contém entrada não declarada no manifesto: ${archivePath}`,
      );
    }
  }

  const parseJsonEntry = <T>(path: string, schema: z.ZodType<T>): T => {
    const bytes = entries.get(path);
    if (!bytes) {
      throw new AppError(
        'BACKUP_INVALID',
        `Arquivo obrigatório ausente no backup: ${path}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(strFromU8(bytes));
    } catch (err) {
      throw new AppError(
        'BACKUP_INVALID',
        `JSON malformado em ${path}.`,
        { cause: err },
      );
    }
    const res = schema.safeParse(parsed);
    if (!res.success) {
      throw new AppError(
        'BACKUP_INVALID',
        `Dados inválidos em ${path}: ${res.error.issues[0]?.message ?? 'falha de schema'}.`,
      );
    }
    return res.data;
  };

  const documents = parseJsonEntry(
    'data/documents.json',
    z.array(DocumentRecordSchema),
  ) as DocumentRecord[];
  const sourceMetas = parseJsonEntry(
    'data/source-files.json',
    z.array(SerializedSourceFileMetaSchema),
  );
  const contents = parseJsonEntry(
    'data/contents.json',
    z.array(ContentRecordSchema),
  ) as ContentRecord[];
  const tokenChunks = parseJsonEntry(
    'data/token-chunks.json',
    z.array(TokenChunkRecordSchema),
  ) as TokenChunkRecord[];
  const progressRecords = parseJsonEntry(
    'data/progress.json',
    z.array(ProgressRecordSchema),
  ) as ProgressRecord[];
  const rawSessions = parseJsonEntry(
    'data/sessions.json',
    z.array(SessionRecordSchema),
  ) as SessionRecord[];
  const rawQuestionSets = parseJsonEntry(
    'data/question-sets.json',
    z.array(QuestionSetRecordSchema),
  );
  const quizAttempts = parseJsonEntry(
    'data/quiz-attempts.json',
    z.array(QuizAttemptRecordSchema),
  ) as QuizAttemptRecord[];
  const reflections = parseJsonEntry(
    'data/reflections.json',
    z.array(ReflectionRecordSchema),
  ) as ReflectionRecord[];
  const settings = parseJsonEntry(
    'data/settings.json',
    z.array(SettingRecordSchema),
  ) as SettingRecord[];

  const questionSets: QuestionSetRecord[] = rawQuestionSets.map((qs) => ({
    ...qs,
    questions: qs.questions.map((q): QuestionItem => ({
      ...q,
      options: q.options as [
        QuestionOption,
        QuestionOption,
        QuestionOption,
        QuestionOption,
      ],
    })),
  }));

  // 4. Validar contagens do manifesto e relacionamentos cruzados
  if (
    documents.length !== manifest.counts.documents ||
    sourceMetas.length !== manifest.counts.sourceFiles ||
    contents.length !== manifest.counts.contents ||
    tokenChunks.length !== manifest.counts.tokenChunks ||
    progressRecords.length !== manifest.counts.progress ||
    rawSessions.length !== manifest.counts.sessions ||
    questionSets.length !== manifest.counts.questionSets ||
    quizAttempts.length !== manifest.counts.quizAttempts ||
    reflections.length !== manifest.counts.reflections ||
    settings.length !== manifest.counts.settings
  ) {
    throw new AppError(
      'BACKUP_INVALID',
      'As contagens de registros no manifesto divergem dos arquivos de dados.',
    );
  }

  const docById = new Map<string, DocumentRecord>();
  for (const doc of documents) {
    if (docById.has(doc.id)) {
      throw new AppError(
        'BACKUP_INVALID',
        `ID de documento duplicado no backup: ${doc.id}`,
      );
    }
    docById.set(doc.id, doc);
  }

  const contentById = new Map<string, ContentRecord>();
  for (const content of contents) {
    if (
      content.normalizationVersion !== NORMALIZATION_VERSION ||
      content.tokenizerVersion !== TOKENIZER_VERSION
    ) {
      throw new AppError(
        'BACKUP_VERSION_UNSUPPORTED',
        `Versão de normalização/tokenização não suportada no conteúdo ${content.id}.`,
      );
    }
    const parentDoc = docById.get(content.documentId);
    if (!parentDoc) {
      throw new AppError(
        'BACKUP_INVALID',
        `Conteúdo ${content.id} aponta para documento inexistente (${content.documentId}).`,
      );
    }
    const computedContentHash = await computeSha256Hex(content.normalizedText);
    if (computedContentHash !== content.contentHash) {
      throw new AppError(
        'BACKUP_INVALID',
        `Hash de conteúdo normalizado divergente em ${content.id}.`,
      );
    }
    contentById.set(content.id, content);
  }

  for (const doc of documents) {
    const activeContent = contentById.get(doc.contentVersionId);
    if (!activeContent || activeContent.documentId !== doc.id) {
      throw new AppError(
        'BACKUP_INVALID',
        `Documento ${doc.id} referencia contentVersionId inválido (${doc.contentVersionId}).`,
      );
    }
    if (activeContent.tokenCount !== doc.tokenCount) {
      throw new AppError(
        'BACKUP_INVALID',
        `Contagem de tokens divergente entre documento ${doc.id} e conteúdo ${activeContent.id}.`,
      );
    }
  }

  // Reconstruir e validar SourceFileRecords binários
  const sourceFileRecords: SourceFileRecord[] = [];
  const sourceByDocId = new Set<string>();
  for (const meta of sourceMetas) {
    const doc = docById.get(meta.documentId);
    if (!doc) {
      throw new AppError(
        'BACKUP_INVALID',
        `SourceFile aponta para documento inexistente (${meta.documentId}).`,
      );
    }
    const binBytes = entries.get(meta.archivePath);
    if (!binBytes) {
      throw new AppError(
        'BACKUP_INVALID',
        `Binário original ausente no pacote: ${meta.archivePath}`,
      );
    }
    if (binBytes.byteLength > maxSourceFileBytes) {
      throw new AppError(
        'FILE_TOO_LARGE',
        `O binário original ${meta.archivePath} excede o teto de 40 MiB.`,
      );
    }
    const binHash = await computeSha256Hex(binBytes);
    if (binHash !== meta.sha256 || binHash !== doc.sourceHash) {
      throw new AppError(
        'BACKUP_INVALID',
        `Hash SHA-256 do binário original ${meta.archivePath} diverge do documento ${doc.id}.`,
      );
    }
    const ab = new ArrayBuffer(binBytes.byteLength);
    new Uint8Array(ab).set(binBytes);
    sourceFileRecords.push({
      documentId: meta.documentId,
      blob: new Blob([ab], { type: meta.mime }),
      originalName: meta.originalName,
      mime: meta.mime,
      byteSize: binBytes.byteLength,
      sha256: binHash,
    });
    sourceByDocId.add(meta.documentId);
  }

  for (const doc of documents) {
    if (!sourceByDocId.has(doc.id)) {
      throw new AppError(
        'BACKUP_INVALID',
        `Documento ${doc.id} não possui arquivo original binário correspondente no backup.`,
      );
    }
  }

  // Validar chunks de tokens contra ContentRecord
  const chunksByCv = new Map<string, TokenChunkRecord[]>();
  for (const chunk of tokenChunks) {
    if (!contentById.has(chunk.contentVersionId)) {
      throw new AppError(
        'BACKUP_INVALID',
        `TokenChunk aponta para contentVersionId inexistente (${chunk.contentVersionId}).`,
      );
    }
    const list = chunksByCv.get(chunk.contentVersionId) ?? [];
    list.push(chunk);
    chunksByCv.set(chunk.contentVersionId, list);
  }

  for (const [cvId, content] of contentById.entries()) {
    const chunks = (chunksByCv.get(cvId) ?? []).sort(
      (a, b) => a.chunkIndex - b.chunkIndex,
    );
    let totalTokens = 0;
    for (const c of chunks) {
      for (const tok of c.tokens) {
        if (
          tok.index !== totalTokens ||
          tok.start < 0 ||
          tok.end <= tok.start ||
          tok.end > content.normalizedText.length
        ) {
          throw new AppError(
            'BACKUP_INVALID',
            `Token inválido ou fora de limites em ${cvId} (índice ${tok.index}).`,
          );
        }
        totalTokens += 1;
      }
    }
    if (totalTokens !== content.tokenCount) {
      throw new AppError(
        'BACKUP_INVALID',
        `Total de tokens nos chunks (${totalTokens}) diverge de content.tokenCount (${content.tokenCount}) em ${cvId}.`,
      );
    }
  }

  // Validar progress
  for (const prog of progressRecords) {
    const doc = docById.get(prog.documentId);
    const content = contentById.get(prog.contentVersionId);
    if (
      !doc ||
      !content ||
      prog.cursor.contentVersionId !== prog.contentVersionId ||
      prog.cursor.tokenIndex < 0 ||
      prog.cursor.tokenIndex > content.tokenCount
    ) {
      throw new AppError(
        'BACKUP_INVALID',
        `Progresso inválido para o documento ${prog.documentId}.`,
      );
    }
  }

  // Validar e normalizar sessões (playing -> interrupted, sem leases ativos)
  const sessionById = new Map<string, SessionRecord>();
  const normalizedSessions: SessionRecord[] = rawSessions.map((s) => {
    const doc = docById.get(s.documentId);
    const content = contentById.get(s.contentVersionId);
    if (
      !doc ||
      !content ||
      s.cursor.contentVersionId !== s.contentVersionId ||
      s.cursor.tokenIndex < 0 ||
      s.cursor.tokenIndex > content.tokenCount
    ) {
      throw new AppError(
        'BACKUP_INVALID',
        `Sessão ${s.id} possui referências ou cursor inválidos.`,
      );
    }
    const normalized: SessionRecord =
      s.status === 'playing'
        ? {
            ...s,
            status: 'interrupted',
            recoveredFromInterruption: true,
          }
        : s;
    sessionById.set(normalized.id, normalized);
    return normalized;
  });

  // Validar questionSets
  const questionSetById = new Map<string, QuestionSetRecord>();
  for (const qs of questionSets) {
    const content = contentById.get(qs.contentVersionId);
    if (!content) {
      throw new AppError(
        'BACKUP_INVALID',
        `QuestionSet ${qs.id} aponta para contentVersionId inexistente (${qs.contentVersionId}).`,
      );
    }
    try {
      verifyQuestionSetIntegrity(qs, content);
    } catch (err) {
      throw new AppError(
        'BACKUP_INVALID',
        `QuestionSet ${qs.id} falhou na validação de integridade: ${err instanceof Error ? err.message : 'erro'}`,
        { cause: err },
      );
    }
    questionSetById.set(qs.id, qs);
  }

  // Validar quizAttempts e reflections
  for (const att of quizAttempts) {
    if (!sessionById.has(att.sessionId)) {
      throw new AppError(
        'BACKUP_INVALID',
        `QuizAttempt ${att.id} aponta para sessionId inexistente (${att.sessionId}).`,
      );
    }
    const qs = questionSetById.get(att.questionSetId);
    if (!qs) {
      throw new AppError(
        'BACKUP_INVALID',
        `QuizAttempt ${att.id} aponta para questionSetId inexistente (${att.questionSetId}).`,
      );
    }
  }

  for (const ref of reflections) {
    if (!sessionById.has(ref.sessionId)) {
      throw new AppError(
        'BACKUP_INVALID',
        `Reflection ${ref.id} aponta para sessionId inexistente (${ref.sessionId}).`,
      );
    }
  }

  // 5. Commit transacional atômico em todas as stores duráveis (com rollback em caso de falha)
  try {
    await database.transaction(
      'rw',
      [
        database.documents,
        database.sourceFiles,
        database.contents,
        database.tokenChunks,
        database.progress,
        database.sessions,
        database.questionSets,
        database.quizAttempts,
        database.reflections,
        database.settings,
        database.leases,
      ],
      async () => {
        const currentLease = await database.leases.get(
          ACTIVE_READING_LEASE_KEY,
        );
        if (currentLease && currentLease.expiresAt > nowMs) {
          throw new AppError(
            'SESSION_LOCKED',
            'Uma leitura foi iniciada durante a preparação da restauração.',
          );
        }

        const innerStatus = await hasPersonalDataInLibrary(database);
        if (innerStatus.hasPersonalData) {
          throw new AppError(
            'RESTORE_REQUIRES_EMPTY_LIBRARY',
            'Dados pessoais foram detectados na biblioteca antes da confirmação da transação.',
          );
        }

        // Remove seeds de treino padrão e settings para substituir pelo estado exato do backup
        await database.quizAttempts.clear();
        await database.reflections.clear();
        await database.sessions.clear();
        await database.progress.clear();
        await database.questionSets.clear();
        await database.tokenChunks.clear();
        await database.contents.clear();
        await database.sourceFiles.clear();
        await database.documents.clear();
        await database.settings.clear();
        await database.leases.clear();

        if (documents.length > 0) {
          await database.documents.bulkAdd(documents);
        }
        if (sourceFileRecords.length > 0) {
          await database.sourceFiles.bulkAdd(sourceFileRecords);
        }
        if (contents.length > 0) {
          await database.contents.bulkAdd(contents);
        }
        if (tokenChunks.length > 0) {
          await database.tokenChunks.bulkAdd(tokenChunks);
        }
        if (progressRecords.length > 0) {
          await database.progress.bulkAdd(progressRecords);
        }
        if (normalizedSessions.length > 0) {
          await database.sessions.bulkAdd(normalizedSessions);
        }
        if (questionSets.length > 0) {
          await database.questionSets.bulkAdd(questionSets);
        }
        if (quizAttempts.length > 0) {
          await database.quizAttempts.bulkAdd(quizAttempts);
        }
        if (reflections.length > 0) {
          await database.reflections.bulkAdd(reflections);
        }
        if (settings.length > 0) {
          await database.settings.bulkAdd(settings);
        }

        if (options?.faultInjectionHook) {
          await options.faultInjectionHook();
        }
      },
    );
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }

  return {
    manifest,
    restoredCounts: manifest.counts,
  };
}
