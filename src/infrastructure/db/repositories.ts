import { z } from 'zod';
import {
  buildVerifiedTrainingCatalog,
  type BuiltInTrainingBundle,
} from '@/content/training/catalog';
import {
  evaluateQuizAttempt,
  verifyQuestionSetIntegrity,
} from '@/domain/comprehension/quiz';
import type {
  ContentBlock,
  ContentRecord,
  DocumentFormat,
  DocumentRecord,
  ImportIssue,
  LeaseRecord,
  ProgressRecord,
  QuestionSetRecord,
  QuizAttemptRecord,
  ReflectionRecord,
  SessionRecord,
  SessionStatus,
  SettingKey,
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
  questionSet: QuestionSetRecord | null;
  hasPriorPractice: boolean;
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
        database.questionSets,
        database.quizAttempts,
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

        const questionSet =
          (await database.questionSets
            .where('contentVersionId')
            .equals(doc.contentVersionId)
            .first()) ?? null;

        let hasPriorPractice = false;
        if (questionSet) {
          const priorAttempts = await database.quizAttempts
            .where('questionSetId')
            .equals(questionSet.id)
            .toArray();
          if (priorAttempts.some((a) => a.status === 'submitted')) {
            hasPriorPractice = true;
          }
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

        const hadCompletedSessionBefore = docSessions.some(
          (s) => s.status === 'completed',
        );
        if (hadCompletedSessionBefore) {
          hasPriorPractice = true;
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
          questionSet,
          hasPriorPractice,
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
          currentMode: params.snapshot.mode,
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

export interface SessionHistoryItem {
  session: SessionRecord;
  documentTitle: string;
  hasQuestionSet: boolean;
  quizAttempt: QuizAttemptRecord | null;
  reflection: ReflectionRecord | null;
}

export async function listSessionsHistory(
  database: LedynDatabase = db,
): Promise<SessionHistoryItem[]> {
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

    const contentVersionIds = Array.from(
      new Set(sessions.map((s) => s.contentVersionId)),
    );
    const questionSets =
      contentVersionIds.length > 0
        ? await database.questionSets
            .where('contentVersionId')
            .anyOf(contentVersionIds)
            .toArray()
        : [];
    const cvWithQuestionSet = new Set(
      questionSets.map((qs) => qs.contentVersionId),
    );

    const sessionIds = sessions.map((s) => s.id);
    const attempts =
      sessionIds.length > 0
        ? await database.quizAttempts
            .where('sessionId')
            .anyOf(sessionIds)
            .toArray()
        : [];
    const attemptBySessionId = new Map<string, QuizAttemptRecord>();
    for (const att of attempts) {
      attemptBySessionId.set(att.sessionId, att);
    }

    const reflections =
      sessionIds.length > 0
        ? await database.reflections
            .where('sessionId')
            .anyOf(sessionIds)
            .toArray()
        : [];
    const reflectionBySessionId = new Map<string, ReflectionRecord>();
    for (const ref of reflections) {
      reflectionBySessionId.set(ref.sessionId, ref);
    }

    return sessions.map((session) => ({
      session,
      documentTitle: docTitleMap.get(session.documentId) ?? 'Documento local',
      hasQuestionSet: cvWithQuestionSet.has(session.contentVersionId),
      quizAttempt: attemptBySessionId.get(session.id) ?? null,
      reflection: reflectionBySessionId.get(session.id) ?? null,
    }));
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

export interface TrainingCatalogOverviewItem {
  bundle: BuiltInTrainingBundle;
  progress: ProgressRecord | null;
  submittedAttempts: QuizAttemptRecord[];
  activeDraftAttempt: QuizAttemptRecord | null;
  hasBeenPracticed: boolean;
}

/**
 * Semeia ou restaura de forma idempotente os 3 treinos originais no Dexie,
 * sem sobrescrever progresso, sessões ou tentativas existentes (ARCHITECTURE.md 4).
 */
export async function ensureTrainingCatalogSeeded(
  database: LedynDatabase = db,
): Promise<BuiltInTrainingBundle[]> {
  const baseCatalog = buildVerifiedTrainingCatalog();
  const encoder = new TextEncoder();

  const preparedCatalog = await Promise.all(
    baseCatalog.map(async (item) => {
      const rawBytes = encoder.encode(item.blueprint.rawText);
      const sourceSha256 = await computeSha256Hex(rawBytes);
      const contentSha256 = await computeSha256Hex(item.content.normalizedText);
      return {
        rawBytes,
        bundle: {
          ...item,
          document: {
            ...item.document,
            sourceHash: sourceSha256,
          },
          content: {
            ...item.content,
            contentHash: contentSha256,
          },
        } satisfies BuiltInTrainingBundle,
      };
    }),
  );

  try {
    await database.transaction(
      'rw',
      [
        database.documents,
        database.sourceFiles,
        database.contents,
        database.tokenChunks,
        database.progress,
        database.questionSets,
      ],
      async () => {
        for (const { rawBytes, bundle: item } of preparedCatalog) {
          const existingDoc = await database.documents.get(item.document.id);
          if (!existingDoc) {
            await database.documents.put(item.document);
          }

          const existingSource = await database.sourceFiles.get(
            item.document.id,
          );
          if (!existingSource) {
            const buffer = new ArrayBuffer(rawBytes.byteLength);
            new Uint8Array(buffer).set(rawBytes);
            await database.sourceFiles.put({
              documentId: item.document.id,
              blob: new Blob([buffer], { type: 'text/plain;charset=utf-8' }),
              originalName: `${item.document.id}.txt`,
              mime: 'text/plain;charset=utf-8',
              byteSize: rawBytes.byteLength,
              sha256: item.document.sourceHash,
            });
          }

          const existingContent = await database.contents.get(item.content.id);
          if (!existingContent) {
            await database.contents.put(item.content);
            const chunks = chunkTokens(item.content.id, item.tokens);
            await database.tokenChunks.bulkPut(chunks);
          }

          const existingProgress = await database.progress.get(
            item.document.id,
          );
          if (!existingProgress) {
            await database.progress.put({
              documentId: item.document.id,
              contentVersionId: item.content.id,
              cursor: {
                contentVersionId: item.content.id,
                tokenIndex: 0,
              },
              completed: false,
              updatedAt: item.document.createdAt,
              revision: 1,
            });
          }

          const existingQs = await database.questionSets.get(
            item.questionSet.id,
          );
          if (!existingQs) {
            await database.questionSets.put(item.questionSet);
          }
        }
      },
    );

    return preparedCatalog.map((p) => p.bundle);
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

export async function listTrainingCatalogOverview(
  database: LedynDatabase = db,
): Promise<TrainingCatalogOverviewItem[]> {
  const catalog = await ensureTrainingCatalogSeeded(database);

  try {
    const result: TrainingCatalogOverviewItem[] = [];
    for (const bundle of catalog) {
      const progress =
        (await database.progress.get(bundle.document.id)) ?? null;
      const attempts = await database.quizAttempts
        .where('questionSetId')
        .equals(bundle.questionSet.id)
        .toArray();
      const sessions = await database.sessions
        .where('documentId')
        .equals(bundle.document.id)
        .toArray();

      const submittedAttempts = attempts
        .filter((a) => a.status === 'submitted')
        .sort((a, b) =>
          (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''),
        );
      const activeDraftAttempt =
        attempts.find((a) => a.status === 'draft') ?? null;
      const hasCompletedSession = sessions.some(
        (s) => s.status === 'completed',
      );

      result.push({
        bundle,
        progress,
        submittedAttempts,
        activeDraftAttempt,
        hasBeenPracticed: submittedAttempts.length > 0 || hasCompletedSession,
      });
    }
    return result;
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

/**
 * Prepara o treino para leitura (e se o progresso anterior já estava concluído,
 * reposiciona o cursor inicial em 0 para uma nova sessão, preservando o histórico anterior).
 */
export async function prepareTrainingForReading(
  documentId: string,
  database: LedynDatabase = db,
): Promise<void> {
  await ensureTrainingCatalogSeeded(database);
  await database.transaction('rw', database.progress, async () => {
    const existing = await database.progress.get(documentId);
    if (existing && existing.completed) {
      await database.progress.put({
        ...existing,
        cursor: {
          contentVersionId: existing.contentVersionId,
          tokenIndex: 0,
        },
        completed: false,
        updatedAt: new Date().toISOString(),
        revision: existing.revision + 1,
      });
    }
  });
}

export interface QuizAttemptBundle {
  attempt: QuizAttemptRecord;
  questionSet: QuestionSetRecord;
  document: DocumentRecord;
  content: ContentRecord;
  session: SessionRecord | null;
}

/**
 * Inicia (ou retoma se já existir para a sessão) uma tentativa de questionário em rascunho (`draft`).
 * Define `repeated = true` quando já existe tentativa enviada anterior para o mesmo questionSet (AC-21).
 */
export async function startOrResumeQuizAttempt(
  sessionId: string,
  documentId: string,
  database: LedynDatabase = db,
): Promise<QuizAttemptRecord> {
  try {
    return await database.transaction(
      'rw',
      [
        database.documents,
        database.contents,
        database.questionSets,
        database.quizAttempts,
      ],
      async () => {
        const doc = await database.documents.get(documentId);
        if (!doc) {
          throw new AppError('DOCUMENT_NOT_FOUND');
        }
        const content = await database.contents.get(doc.contentVersionId);
        if (!content) {
          throw new AppError('CORRUPT_FILE');
        }
        const questionSet = await database.questionSets
          .where('contentVersionId')
          .equals(doc.contentVersionId)
          .first();
        if (!questionSet) {
          throw new AppError(
            'DOCUMENT_NOT_FOUND',
            'Este documento não possui questionário vinculado.',
          );
        }

        verifyQuestionSetIntegrity(questionSet, content);

        const existingForSession = await database.quizAttempts
          .where('sessionId')
          .equals(sessionId)
          .first();

        if (
          existingForSession &&
          (existingForSession.status === 'draft' ||
            existingForSession.status === 'submitted')
        ) {
          return existingForSession;
        }

        const allForQuestionSet = await database.quizAttempts
          .where('questionSetId')
          .equals(questionSet.id)
          .toArray();
        const hasPriorSubmitted = allForQuestionSet.some(
          (a) => a.status === 'submitted' && a.sessionId !== sessionId,
        );

        const newAttempt: QuizAttemptRecord = {
          id: createId(),
          sessionId,
          questionSetId: questionSet.id,
          questionSetVersion: questionSet.version,
          answers: {},
          status: 'draft',
          correctCount: null,
          totalCount: questionSet.questions.length,
          submittedAt: null,
          repeated: hasPriorSubmitted,
        };

        await database.quizAttempts.put(newAttempt);
        return newAttempt;
      },
    );
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

export async function loadQuizAttemptBundle(
  attemptId: string,
  database: LedynDatabase = db,
): Promise<QuizAttemptBundle> {
  try {
    return await database.transaction(
      'r',
      [
        database.quizAttempts,
        database.questionSets,
        database.contents,
        database.documents,
        database.sessions,
      ],
      async () => {
        const attempt = await database.quizAttempts.get(attemptId);
        if (!attempt) {
          throw new AppError(
            'DOCUMENT_NOT_FOUND',
            'Tentativa de questionário não encontrada.',
          );
        }
        const questionSet = await database.questionSets.get(
          attempt.questionSetId,
        );
        if (!questionSet) {
          throw new AppError(
            'CORRUPT_FILE',
            'Questionário associado não encontrado.',
          );
        }
        const content = await database.contents.get(
          questionSet.contentVersionId,
        );
        if (!content) {
          throw new AppError('CORRUPT_FILE');
        }
        verifyQuestionSetIntegrity(questionSet, content);

        const doc = await database.documents.get(content.documentId);
        if (!doc) {
          throw new AppError('DOCUMENT_NOT_FOUND');
        }
        const session =
          (await database.sessions.get(attempt.sessionId)) ?? null;

        return {
          attempt,
          questionSet,
          document: doc,
          content,
          session,
        };
      },
    );
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

/**
 * Salva uma resposta no rascunho local da tentativa (AC-21).
 * Bloqueia edição caso a tentativa já tenha sido enviada (AC-20).
 */
export async function saveQuizDraftAnswer(
  attemptId: string,
  questionId: string,
  optionId: string,
  database: LedynDatabase = db,
): Promise<QuizAttemptRecord> {
  try {
    return await database.transaction('rw', database.quizAttempts, async () => {
      const existing = await database.quizAttempts.get(attemptId);
      if (!existing) {
        throw new AppError('DOCUMENT_NOT_FOUND');
      }
      if (existing.status === 'submitted') {
        throw new AppError('QUIZ_ALREADY_SUBMITTED');
      }
      const updated: QuizAttemptRecord = {
        ...existing,
        status: 'draft',
        answers: {
          ...existing.answers,
          [questionId]: optionId,
        },
      };
      await database.quizAttempts.put(updated);
      return updated;
    });
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

/**
 * Submete o questionário de forma idempotente (AC-20 / AC-21).
 * Se já estiver submetido (ex.: duplo clique ou retry), retorna o mesmo registro sem duplicar tentativa.
 */
export async function submitQuizAttempt(
  attemptId: string,
  database: LedynDatabase = db,
): Promise<QuizAttemptRecord> {
  try {
    return await database.transaction(
      'rw',
      [database.quizAttempts, database.questionSets],
      async () => {
        const existing = await database.quizAttempts.get(attemptId);
        if (!existing) {
          throw new AppError('DOCUMENT_NOT_FOUND');
        }
        if (existing.status === 'submitted') {
          return existing;
        }
        const questionSet = await database.questionSets.get(
          existing.questionSetId,
        );
        if (!questionSet) {
          throw new AppError('CORRUPT_FILE');
        }

        const evaluation = evaluateQuizAttempt(questionSet, existing.answers);

        const allForQuestionSet = await database.quizAttempts
          .where('questionSetId')
          .equals(questionSet.id)
          .toArray();
        const hasPriorSubmitted = allForQuestionSet.some(
          (a) => a.status === 'submitted' && a.id !== existing.id,
        );

        const submitted: QuizAttemptRecord = {
          ...existing,
          status: 'submitted',
          correctCount: evaluation.correctCount,
          totalCount: evaluation.totalCount,
          submittedAt: new Date().toISOString(),
          repeated: existing.repeated || hasPriorSubmitted,
        };

        await database.quizAttempts.put(submitted);
        return submitted;
      },
    );
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

/**
 * Descarta uma tentativa em rascunho marcando-a como `abandoned` sem atribuir nota zero (AC-21).
 */
export async function abandonQuizAttempt(
  attemptId: string,
  database: LedynDatabase = db,
): Promise<QuizAttemptRecord> {
  try {
    return await database.transaction('rw', database.quizAttempts, async () => {
      const existing = await database.quizAttempts.get(attemptId);
      if (!existing) {
        throw new AppError('DOCUMENT_NOT_FOUND');
      }
      if (existing.status === 'submitted') {
        throw new AppError('QUIZ_ALREADY_SUBMITTED');
      }
      const abandoned: QuizAttemptRecord = {
        ...existing,
        status: 'abandoned',
        correctCount: null,
        submittedAt: null,
      };
      await database.quizAttempts.put(abandoned);
      return abandoned;
    });
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

/**
 * Registra ou atualiza reflexão sem nota para sessões de conteúdo pessoal sem questionário (RF-06 / AC-22).
 */
export async function saveSessionReflection(
  sessionId: string,
  text: string,
  database: LedynDatabase = db,
): Promise<ReflectionRecord> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new AppError(
      'EMPTY_TEXT',
      'Escreva uma breve anotação ou reflexão antes de salvar.',
    );
  }

  try {
    return await database.transaction('rw', database.reflections, async () => {
      const existing = await database.reflections
        .where('sessionId')
        .equals(sessionId)
        .first();

      const nowIso = new Date().toISOString();
      const record: ReflectionRecord = {
        id: existing?.id ?? createId(),
        sessionId,
        text: trimmed,
        updatedAt: nowIso,
      };
      await database.reflections.put(record);
      return record;
    });
  } catch (error) {
    throw toAppError(error, 'STORAGE_UNAVAILABLE');
  }
}

export type ThemePreference = 'light' | 'dark' | 'system';

export const MIN_GUIDED_FONT_SIZE_PX = 16;
export const MAX_GUIDED_FONT_SIZE_PX = 32;
export const DEFAULT_GUIDED_FONT_SIZE_PX = 20;

export interface UserPreferences {
  theme: ThemePreference;
  defaultWpm: number;
  punctuationPauseEnabled: boolean;
  guidedFontSizePx: number;
  reducedMotion: boolean;
}

export interface LoadedPreferencesResult {
  preferences: UserPreferences;
  invalidKeys: SettingKey[];
  warningMessage: string | null;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'system',
  defaultWpm: DEFAULT_WPM,
  punctuationPauseEnabled: true,
  guidedFontSizePx: DEFAULT_GUIDED_FONT_SIZE_PX,
  reducedMotion: false,
};

const themeSchema = z.enum(['light', 'dark', 'system']);
const wpmSchema = z.number().int().min(MIN_WPM).max(MAX_WPM);
const boolSchema = z.boolean();
const fontSizeSchema = z
  .number()
  .int()
  .min(MIN_GUIDED_FONT_SIZE_PX)
  .max(MAX_GUIDED_FONT_SIZE_PX);

export async function loadUserPreferencesWithDiagnostics(
  database: LedynDatabase = db,
): Promise<LoadedPreferencesResult> {
  try {
    const rows = await database.settings.toArray();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const invalidKeys: SettingKey[] = [];

    const parsedTheme = themeSchema.safeParse(map.get('theme'));
    if (map.has('theme') && !parsedTheme.success) {
      invalidKeys.push('theme');
    }

    const parsedWpm = wpmSchema.safeParse(map.get('defaultWpm'));
    if (map.has('defaultWpm') && !parsedWpm.success) {
      invalidKeys.push('defaultWpm');
    }

    const parsedPunct = boolSchema.safeParse(map.get('punctuationPauseEnabled'));
    if (map.has('punctuationPauseEnabled') && !parsedPunct.success) {
      invalidKeys.push('punctuationPauseEnabled');
    }

    const parsedFont = fontSizeSchema.safeParse(map.get('guidedFontSizePx'));
    if (map.has('guidedFontSizePx') && !parsedFont.success) {
      invalidKeys.push('guidedFontSizePx');
    }

    const parsedMotion = boolSchema.safeParse(map.get('reducedMotion'));
    if (map.has('reducedMotion') && !parsedMotion.success) {
      invalidKeys.push('reducedMotion');
    }

    const preferences: UserPreferences = {
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

    const warningMessage =
      invalidKeys.length > 0
        ? `Algumas preferências salvas estavam fora dos limites válidos (${invalidKeys.join(', ')}) e receberam o valor padrão seguro.`
        : null;

    return {
      preferences,
      invalidKeys,
      warningMessage,
    };
  } catch {
    return {
      preferences: { ...DEFAULT_USER_PREFERENCES },
      invalidKeys: [],
      warningMessage: null,
    };
  }
}

export async function loadUserPreferences(
  database: LedynDatabase = db,
): Promise<UserPreferences> {
  const result = await loadUserPreferencesWithDiagnostics(database);
  return result.preferences;
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
