import { z } from 'zod';
import type {
  ContentBlock,
  ContentRecord,
  DocumentFormat,
  DocumentRecord,
  ImportIssue,
  LeaseRecord,
  ProgressRecord,
  SessionRecord,
  SessionStatus,
  SourceFileRecord,
  Token,
} from '@/domain/contracts';
import {
  generateTitleFromText,
  normalizeText,
} from '@/domain/documents/normalizer';
import {
  chunkTokens,
  tokenizeNormalizedText,
} from '@/domain/documents/tokenizer';
import {
  DEFAULT_WPM,
  MAX_WPM,
  MIN_WPM,
  type EngineSnapshot,
} from '@/domain/reading/engine';
import { calculateProgressPercent } from '@/domain/reading/metrics';
import { db, type LedynDatabase } from '@/infrastructure/db/database';
import {
  ACTIVE_READING_LEASE_KEY,
  LEASE_TTL_MS,
} from '@/infrastructure/db/leaseManager';
import { isImportJobCancelled } from '@/infrastructure/importers/pipeline';
import type { PreviewSection } from '@/infrastructure/importers/types';
import { AppError, toAppError } from '@/shared/errors';
import { computeSha256Hex, createId } from '@/shared/utils';

export const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40 MiB

export interface PreparedDocumentDraft {
  draftId: string;
  jobId?: string;
  title: string;
  format: DocumentFormat;
  originalBytes: Uint8Array;
  originalName: string;
  mime: string;
  byteSize: number;
  sourceHash: string;
  normalizationVersion: number;
  tokenizerVersion: number;
  normalizedText: string;
  contentHash: string;
  blocks: ContentBlock[];
  tokens: Token[];
  previewSections?: PreviewSection[];
  warnings: ImportIssue[];
  duplicateDocument: DocumentRecord | null;
}

export interface LibraryItemSummary {
  document: DocumentRecord;
  progress: ProgressRecord | null;
  progressPercent: number;
}

export interface ReaderDocumentBundle {
  document: DocumentRecord;
  content: ContentRecord;
  tokens: Token[];
  progress: ProgressRecord;
  resumableSession: SessionRecord | null;
  wasInterrupted: boolean;
}

/**
 * Prepara um rascunho de texto colado fora de qualquer transação do banco.
 * Verifica limites, normaliza (NFC), tokeniza, calcula hashes SHA-256 e consulta duplicata.
 */
export async function preparePastedTextDraft(
  rawText: string,
  explicitTitle?: string,
  database: LedynDatabase = db,
): Promise<PreparedDocumentDraft> {
  if (!rawText || rawText.trim().length === 0) {
    throw new AppError(
      'EMPTY_TEXT',
      'Insira um texto com pelo menos uma palavra legível antes de preparar.',
    );
  }

  const encoder = new TextEncoder();
  const originalBytes = encoder.encode(rawText);

  if (originalBytes.byteLength > MAX_FILE_BYTES) {
    throw new AppError(
      'FILE_TOO_LARGE',
      'O texto excede o limite de 40 MiB desta versão. Importe um trecho menor.',
    );
  }

  const normalization = normalizeText(rawText);
  const tokenization = tokenizeNormalizedText(
    normalization.normalizedText,
    normalization.blocks,
  );

  const [sourceHash, contentHash] = await Promise.all([
    computeSha256Hex(originalBytes),
    computeSha256Hex(normalization.normalizedText),
  ]);

  let duplicateDocument: DocumentRecord | null;
  try {
    const existing = await database.documents
      .where('sourceHash')
      .equals(sourceHash)
      .first();
    duplicateDocument = existing ?? null;
  } catch {
    duplicateDocument = null;
  }

  const title = generateTitleFromText(
    normalization.normalizedText,
    explicitTitle,
  );

  const previewSections: PreviewSection[] = [
    {
      id: 'pasted-main',
      label: 'Texto completo',
      paragraphs: normalization.blocks.map((b) =>
        normalization.normalizedText.slice(b.startOffset, b.endOffset),
      ),
      hasText: normalization.blocks.length > 0,
    },
  ];

  return {
    draftId: createId(),
    title,
    format: 'pasted',
    originalBytes,
    originalName: 'texto-colado.txt',
    mime: 'text/plain;charset=utf-8',
    byteSize: originalBytes.byteLength,
    sourceHash,
    normalizationVersion: normalization.normalizationVersion,
    tokenizerVersion: tokenization.tokenizerVersion,
    normalizedText: normalization.normalizedText,
    contentHash,
    blocks: normalization.blocks,
    tokens: tokenization.tokens,
    previewSections,
    warnings: normalization.warnings,
    duplicateDocument,
  };
}

export interface CommitImportOptions {
  customTitle?: string;
  database?: LedynDatabase;
  /** Gancho opcional para injeção de falha controlada em testes de atomicidade (AC-02/AC-17). */
  beforeTransactionCommitHook?: () => Promise<void> | void;
}

/**
 * Grava metadados, arquivo original, snapshot de conteúdo, chunks de tokens e progresso inicial
 * em uma única transação atômica do Dexie. Em caso de erro, nada é persistido.
 */
export async function commitPreparedDocument(
  draft: PreparedDocumentDraft,
  options?: CommitImportOptions,
): Promise<DocumentRecord> {
  if (isImportJobCancelled(draft.jobId)) {
    throw new AppError(
      'IMPORT_CANCELLED',
      'Este trabalho de importação foi cancelado e não pode ser confirmado.',
    );
  }
  const database = options?.database ?? db;
  const nowIso = new Date().toISOString();
  const documentId = createId();
  const contentVersionId = createId();
  const finalTitle = generateTitleFromText(
    draft.normalizedText,
    options?.customTitle ?? draft.title,
  );

  const documentRecord: DocumentRecord = {
    id: documentId,
    title: finalTitle,
    format: draft.format,
    sourceHash: draft.sourceHash,
    contentVersionId,
    tokenCount: draft.tokens.length,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastOpenedAt: nowIso,
    warnings: draft.warnings,
    isTraining: false,
  };

  const blobBuffer = new ArrayBuffer(draft.originalBytes.byteLength);
  new Uint8Array(blobBuffer).set(draft.originalBytes);
  const blob = new Blob([blobBuffer], { type: draft.mime });

  const sourceFileRecord: SourceFileRecord = {
    documentId,
    blob,
    originalName: draft.originalName,
    mime: draft.mime,
    byteSize: draft.byteSize,
    sha256: draft.sourceHash,
  };

  const contentRecord: ContentRecord = {
    id: contentVersionId,
    documentId,
    normalizationVersion: draft.normalizationVersion,
    tokenizerVersion: draft.tokenizerVersion,
    normalizedText: draft.normalizedText,
    blocks: draft.blocks,
    tokenCount: draft.tokens.length,
    contentHash: draft.contentHash,
  };

  const tokenChunkRecords = chunkTokens(contentVersionId, draft.tokens);

  const progressRecord: ProgressRecord = {
    documentId,
    contentVersionId,
    cursor: {
      contentVersionId,
      tokenIndex: 0,
    },
    completed: false,
    updatedAt: nowIso,
    revision: 1,
  };

  try {
    await database.transaction(
      'rw',
      [
        database.documents,
        database.sourceFiles,
        database.contents,
        database.tokenChunks,
        database.progress,
      ],
      async () => {
        await database.documents.add(documentRecord);
        await database.sourceFiles.add(sourceFileRecord);
        await database.contents.add(contentRecord);
        if (tokenChunkRecords.length > 0) {
          await database.tokenChunks.bulkAdd(tokenChunkRecords);
        }
        await database.progress.add(progressRecord);

        if (options?.beforeTransactionCommitHook) {
          await options.beforeTransactionCommitHook();
        }
      },
    );

    return documentRecord;
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

/**
 * Lista documentos da biblioteca ordenados por `lastOpenedAt` decrescente,
 * consultando apenas metadados e progresso sem carregar blobs ou textos completos (RNF-08).
 */
export async function listLibraryItems(
  searchQuery?: string,
  database: LedynDatabase = db,
): Promise<LibraryItemSummary[]> {
  try {
    const docs = await database.documents
      .orderBy('lastOpenedAt')
      .reverse()
      .toArray();

    const normalizedSearch = searchQuery?.trim().toLowerCase() ?? '';
    const filteredDocs =
      normalizedSearch.length > 0
        ? docs.filter((d) => d.title.toLowerCase().includes(normalizedSearch))
        : docs;

    const progressRecords = await database.progress.bulkGet(
      filteredDocs.map((d) => d.id),
    );

    return filteredDocs.map((doc, idx) => {
      const prog = progressRecords[idx] ?? null;
      const cursorIndex = prog?.cursor.tokenIndex ?? 0;
      const progressPercent = calculateProgressPercent(
        cursorIndex,
        doc.tokenCount,
      );
      return {
        document: doc,
        progress: prog,
        progressPercent,
      };
    });
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

export async function renameDocument(
  documentId: string,
  newTitle: string,
  database: LedynDatabase = db,
): Promise<DocumentRecord> {
  const trimmed = newTitle.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!trimmed) {
    throw new AppError('EMPTY_TEXT', 'O título não pode ficar vazio.');
  }

  try {
    return await database.transaction('rw', database.documents, async () => {
      const existing = await database.documents.get(documentId);
      if (!existing) {
        throw new AppError('DOCUMENT_NOT_FOUND');
      }
      const updated: DocumentRecord = {
        ...existing,
        title: trimmed,
        updatedAt: new Date().toISOString(),
      };
      await database.documents.put(updated);
      return updated;
    });
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

/**
 * Remove um documento e todos os seus registros associados em uma única transação.
 */
export async function deleteDocumentTransactional(
  documentId: string,
  database: LedynDatabase = db,
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
      ],
      async () => {
        const contents = await database.contents
          .where('documentId')
          .equals(documentId)
          .toArray();
        const contentVersionIds = contents.map((c) => c.id);

        for (const cvId of contentVersionIds) {
          await database.tokenChunks
            .where('contentVersionId')
            .equals(cvId)
            .delete();
          await database.questionSets
            .where('contentVersionId')
            .equals(cvId)
            .delete();
        }

        const sessions = await database.sessions
          .where('documentId')
          .equals(documentId)
          .toArray();
        const sessionIds = sessions.map((s) => s.id);

        for (const sId of sessionIds) {
          await database.quizAttempts
            .where('sessionId')
            .equals(sId)
            .delete();
          await database.reflections
            .where('sessionId')
            .equals(sId)
            .delete();
        }

        await database.sessions.where('documentId').equals(documentId).delete();
        await database.progress.delete(documentId);
        await database.contents.where('documentId').equals(documentId).delete();
        await database.sourceFiles.delete(documentId);
        await database.documents.delete(documentId);
      },
    );
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

/**
 * Carrega documento, conteúdo versionado, tokens em chunks, progresso e sessão retomável.
 * Se houver uma sessão deixada como `playing` sem lease ativo de outra aba (ex.: aba fechada ou recarregada),
 * marca-a como `interrupted` no último checkpoint persistido e sempre retorna pronto para iniciar PAUSADO.
 */
export async function loadReaderDocumentBundle(
  documentId: string,
  currentTabOwnerId: string,
  nowMs: number = Date.now(),
  database: LedynDatabase = db,
): Promise<ReaderDocumentBundle> {
  try {
    return await database.transaction(
      'rw',
      [
        database.documents,
        database.contents,
        database.tokenChunks,
        database.progress,
        database.sessions,
        database.leases,
      ],
      async () => {
        const doc = await database.documents.get(documentId);
        if (!doc) {
          throw new AppError('DOCUMENT_NOT_FOUND');
        }

        const content = await database.contents.get(doc.contentVersionId);
        if (!content) {
          throw new AppError(
            'CORRUPT_FILE',
            'O conteúdo normalizado deste documento não foi encontrado.',
          );
        }

        const chunks = await database.tokenChunks
          .where('contentVersionId')
          .equals(doc.contentVersionId)
          .sortBy('chunkIndex');

        const tokens: Token[] = [];
        for (const chunk of chunks) {
          tokens.push(...chunk.tokens);
        }

        const nowIso = new Date(nowMs).toISOString();
        let progress = await database.progress.get(documentId);
        if (!progress) {
          progress = {
            documentId,
            contentVersionId: doc.contentVersionId,
            cursor: {
              contentVersionId: doc.contentVersionId,
              tokenIndex: 0,
            },
            completed: false,
            updatedAt: nowIso,
            revision: 1,
          };
          await database.progress.put(progress);
        }

        const docSessions = await database.sessions
          .where('documentId')
          .equals(documentId)
          .sortBy('startedAt');

        const activeLease = await database.leases.get(ACTIVE_READING_LEASE_KEY);
        const isLockedByOtherActiveTab =
          activeLease !== undefined &&
          activeLease.ownerId !== currentTabOwnerId &&
          activeLease.expiresAt > nowMs;

        let resumableSession: SessionRecord | null = null;
        let wasInterrupted = false;

        for (let i = docSessions.length - 1; i >= 0; i--) {
          const s = docSessions[i]!;
          if (s.contentVersionId !== doc.contentVersionId) {
            continue;
          }
          if (s.status === 'playing') {
            if (!isLockedByOtherActiveTab) {
              // Sessão ficou marcada como playing de um encerramento abrupto ou reload da mesma aba.
              // Recuperamos o último checkpoint confirmado e marcamos como interrompida, sem somar tempo fechado.
              const recovered: SessionRecord = {
                ...s,
                status: 'interrupted',
                recoveredFromInterruption: true,
              };
              await database.sessions.put(recovered);
              if (activeLease && activeLease.ownerId === currentTabOwnerId) {
                await database.leases.delete(ACTIVE_READING_LEASE_KEY);
              }
              resumableSession = recovered;
              wasInterrupted = true;
              break;
            }
          } else if (s.status === 'paused' || s.status === 'interrupted') {
            resumableSession = s;
            wasInterrupted =
              s.status === 'interrupted' || Boolean(s.recoveredFromInterruption);
            break;
          }
        }

        // Sincronizar o cursor do progresso com o último checkpoint confirmado da sessão retomável se aplicável
        if (resumableSession) {
          progress = {
            ...progress,
            cursor: {
              contentVersionId: doc.contentVersionId,
              tokenIndex: resumableSession.cursor.tokenIndex,
            },
            completed: resumableSession.cursor.tokenIndex >= content.tokenCount,
          };
          await database.progress.put(progress);
        }

        const updatedDoc: DocumentRecord = {
          ...doc,
          lastOpenedAt: nowIso,
        };
        await database.documents.put(updatedDoc);

        return {
          document: updatedDoc,
          content,
          tokens,
          progress,
          resumableSession,
          wasInterrupted,
        };
      },
    );
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

export interface SaveCheckpointParams {
  sessionId: string;
  documentId: string;
  contentVersionId: string;
  ownerId: string;
  startedAt: string;
  snapshot: EngineSnapshot;
  sessionStatusOverride?: SessionStatus;
  recoveredFromInterruption?: boolean;
  nowMs?: number;
  database?: LedynDatabase;
  /** Gancho opcional para simular erro de gravação em testes (AC-15/AC-17). */
  faultInjectionHook?: () => Promise<void> | void;
}

export interface SavedCheckpointResult {
  session: SessionRecord;
  progress: ProgressRecord;
}

/**
 * Persiste sessão e progresso do documento de forma idempotente e transacional.
 * Valida propriedade do lease antes de gravar para impedir sobrescrita por aba antiga/concorrente.
 */
export async function saveReadingCheckpoint(
  params: SaveCheckpointParams,
): Promise<SavedCheckpointResult> {
  const database = params.database ?? db;
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const resolvedStatus: SessionStatus =
    params.sessionStatusOverride ??
    (params.snapshot.status === 'completed'
      ? 'completed'
      : params.snapshot.status === 'playing'
        ? 'playing'
        : 'paused');

  try {
    return await database.transaction(
      'rw',
      [
        database.leases,
        database.sessions,
        database.progress,
        database.documents,
      ],
      async () => {
        if (params.faultInjectionHook) {
          await params.faultInjectionHook();
        }

        const existingLease = await database.leases.get(
          ACTIVE_READING_LEASE_KEY,
        );

        // Se outra aba detém um lease ativo, bloqueia qualquer gravação concorrente
        if (
          existingLease &&
          existingLease.ownerId !== params.ownerId &&
          existingLease.expiresAt > nowMs
        ) {
          throw new AppError(
            'SESSION_LOCKED',
            'Já existe uma leitura ativa em outra aba. Seu avanço local foi pausado para evitar conflito.',
          );
        }

        // Atualiza ou libera o lease conforme o estado da sessão
        if (resolvedStatus === 'playing') {
          const nextLeaseRev = (existingLease?.revision ?? 0) + 1;
          const leaseRecord: LeaseRecord = {
            key: ACTIVE_READING_LEASE_KEY,
            ownerId: params.ownerId,
            sessionId: params.sessionId,
            documentId: params.documentId,
            expiresAt: nowMs + LEASE_TTL_MS,
            revision: nextLeaseRev,
          };
          await database.leases.put(leaseRecord);
        } else if (existingLease && existingLease.ownerId === params.ownerId) {
          await database.leases.delete(ACTIVE_READING_LEASE_KEY);
        }

        const existingSession = await database.sessions.get(params.sessionId);
        const nextCheckpointRevision =
          (existingSession?.checkpointRevision ?? 0) + 1;

        const sessionRecord: SessionRecord = {
          id: params.sessionId,
          documentId: params.documentId,
          contentVersionId: params.contentVersionId,
          status: resolvedStatus,
          modeSegments: params.snapshot.modeSegments,
          startedAt: existingSession?.startedAt ?? params.startedAt,
          endedAt:
            resolvedStatus === 'completed'
              ? (existingSession?.endedAt ?? nowIso)
              : null,
          activeMs: Math.round(params.snapshot.activeMs),
          presentedCount: params.snapshot.presentedCount,
          coverageRanges: params.snapshot.coverageRanges,
          settingsChanges: params.snapshot.settingsChanges,
          cursor: {
            contentVersionId: params.contentVersionId,
            tokenIndex: params.snapshot.cursor.tokenIndex,
          },
          checkpointRevision: nextCheckpointRevision,
          recoveredFromInterruption:
            params.recoveredFromInterruption ??
            existingSession?.recoveredFromInterruption ??
            false,
        };

        await database.sessions.put(sessionRecord);

        const existingProgress = await database.progress.get(params.documentId);
        const progressRecord: ProgressRecord = {
          documentId: params.documentId,
          contentVersionId: params.contentVersionId,
          cursor: {
            contentVersionId: params.contentVersionId,
            tokenIndex: params.snapshot.cursor.tokenIndex,
          },
          completed: resolvedStatus === 'completed',
          updatedAt: nowIso,
          revision: (existingProgress?.revision ?? 0) + 1,
        };

        await database.progress.put(progressRecord);

        const existingDoc = await database.documents.get(params.documentId);
        if (existingDoc) {
          await database.documents.put({
            ...existingDoc,
            updatedAt: nowIso,
            lastOpenedAt: nowIso,
          });
        }

        return {
          session: sessionRecord,
          progress: progressRecord,
        };
      },
    );
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

export async function listSessionsHistory(
  database: LedynDatabase = db,
): Promise<Array<{ session: SessionRecord; documentTitle: string }>> {
  try {
    const sessions = await database.sessions
      .orderBy('startedAt')
      .reverse()
      .toArray();
    const docIds = Array.from(new Set(sessions.map((s) => s.documentId)));
    const docs = await database.documents.bulkGet(docIds);
    const docTitleMap = new Map<string, string>();
    docs.forEach((d, idx) => {
      if (d) {
        docTitleMap.set(d.id, d.title);
      } else if (docIds[idx]) {
        docTitleMap.set(docIds[idx]!, 'Documento removido');
      }
    });

    return sessions.map((session) => ({
      session,
      documentTitle: docTitleMap.get(session.documentId) ?? 'Documento local',
    }));
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserPreferences {
  theme: ThemePreference;
  defaultWpm: number;
  punctuationPauseEnabled: boolean;
  guidedFontSizePx: number;
  reducedMotion: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'system',
  defaultWpm: DEFAULT_WPM,
  punctuationPauseEnabled: true,
  guidedFontSizePx: 20,
  reducedMotion: false,
};

const themeSchema = z.enum(['light', 'dark', 'system']);
const wpmSchema = z.number().int().min(MIN_WPM).max(MAX_WPM);
const boolSchema = z.boolean();
const fontSizeSchema = z.number().int().min(16).max(32);

export async function loadUserPreferences(
  database: LedynDatabase = db,
): Promise<UserPreferences> {
  try {
    const rows = await database.settings.toArray();
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const parsedTheme = themeSchema.safeParse(map.get('theme'));
    const parsedWpm = wpmSchema.safeParse(map.get('defaultWpm'));
    const parsedPunct = boolSchema.safeParse(map.get('punctuationPauseEnabled'));
    const parsedFont = fontSizeSchema.safeParse(map.get('guidedFontSizePx'));
    const parsedMotion = boolSchema.safeParse(map.get('reducedMotion'));

    return {
      theme: parsedTheme.success
        ? parsedTheme.data
        : DEFAULT_USER_PREFERENCES.theme,
      defaultWpm: parsedWpm.success
        ? parsedWpm.data
        : DEFAULT_USER_PREFERENCES.defaultWpm,
      punctuationPauseEnabled: parsedPunct.success
        ? parsedPunct.data
        : DEFAULT_USER_PREFERENCES.punctuationPauseEnabled,
      guidedFontSizePx: parsedFont.success
        ? parsedFont.data
        : DEFAULT_USER_PREFERENCES.guidedFontSizePx,
      reducedMotion: parsedMotion.success
        ? parsedMotion.data
        : DEFAULT_USER_PREFERENCES.reducedMotion,
    };
  } catch {
    return { ...DEFAULT_USER_PREFERENCES };
  }
}

export async function saveUserPreferences(
  partial: Partial<UserPreferences>,
  database: LedynDatabase = db,
): Promise<UserPreferences> {
  try {
    const current = await loadUserPreferences(database);
    const merged: UserPreferences = {
      theme: partial.theme ? themeSchema.parse(partial.theme) : current.theme,
      defaultWpm:
        partial.defaultWpm !== undefined
          ? wpmSchema.parse(partial.defaultWpm)
          : current.defaultWpm,
      punctuationPauseEnabled:
        partial.punctuationPauseEnabled !== undefined
          ? boolSchema.parse(partial.punctuationPauseEnabled)
          : current.punctuationPauseEnabled,
      guidedFontSizePx:
        partial.guidedFontSizePx !== undefined
          ? fontSizeSchema.parse(partial.guidedFontSizePx)
          : current.guidedFontSizePx,
      reducedMotion:
        partial.reducedMotion !== undefined
          ? boolSchema.parse(partial.reducedMotion)
          : current.reducedMotion,
    };

    await database.transaction('rw', database.settings, async () => {
      await database.settings.bulkPut([
        { key: 'theme', value: merged.theme, schemaVersion: 1 },
        { key: 'defaultWpm', value: merged.defaultWpm, schemaVersion: 1 },
        {
          key: 'punctuationPauseEnabled',
          value: merged.punctuationPauseEnabled,
          schemaVersion: 1,
        },
        {
          key: 'guidedFontSizePx',
          value: merged.guidedFontSizePx,
          schemaVersion: 1,
        },
        {
          key: 'reducedMotion',
          value: merged.reducedMotion,
          schemaVersion: 1,
        },
      ]);
    });

    return merged;
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}
