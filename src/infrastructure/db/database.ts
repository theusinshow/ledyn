import Dexie, { type Table } from 'dexie';
import type {
  BookmarkRecord,
  ContentRecord,
  DocumentRecord,
  LeaseRecord,
  ProgressRecord,
  QuestionSetRecord,
  QuizAttemptRecord,
  ReflectionRecord,
  SessionRecord,
  SettingRecord,
  SourceFileRecord,
  TokenChunkRecord,
} from '@/domain/contracts';
import { AppError } from '@/shared/errors';

export const DB_NAME = 'ledyn-local-db';
export const DB_SCHEMA_VERSION = 2;

export class LedynDatabase extends Dexie {
  documents!: Table<DocumentRecord, string>;
  sourceFiles!: Table<SourceFileRecord, string>;
  contents!: Table<ContentRecord, string>;
  tokenChunks!: Table<TokenChunkRecord, [string, number]>;
  progress!: Table<ProgressRecord, string>;
  sessions!: Table<SessionRecord, string>;
  questionSets!: Table<QuestionSetRecord, string>;
  quizAttempts!: Table<QuizAttemptRecord, string>;
  reflections!: Table<ReflectionRecord, string>;
  settings!: Table<SettingRecord, string>;
  bookmarks!: Table<BookmarkRecord, string>;
  leases!: Table<LeaseRecord, string>;

  constructor(name: string = DB_NAME) {
    super(name);

    this.version(1).stores({
      documents: 'id, sourceHash, lastOpenedAt, updatedAt, title, isTraining',
      sourceFiles: 'documentId, sha256',
      contents: 'id, documentId, contentHash',
      tokenChunks: '[contentVersionId+chunkIndex], contentVersionId',
      progress: 'documentId, contentVersionId, updatedAt',
      sessions: 'id, documentId, contentVersionId, startedAt, status',
      questionSets: 'id, contentVersionId',
      quizAttempts: 'id, sessionId, questionSetId, submittedAt',
      reflections: 'id, sessionId, updatedAt',
      settings: 'key',
      leases: 'key, ownerId, expiresAt',
    });

    // v2 (23/10/2026): marcadores pessoais. Migração aditiva: só cria a tabela nova,
    // sem tocar nos dados existentes (ADR-015).
    this.version(2).stores({
      bookmarks: 'id, documentId, [documentId+tokenIndex], createdAt',
    });
  }
}

export const db = new LedynDatabase();

/**
 * Verifica se a base IndexedDB existente possui versão superior à suportada
 * sem sobrescrever ou apagar dados existentes (ARCHITECTURE.md 4.2).
 */
export async function ensureDatabaseCompatible(
  database: LedynDatabase = db,
): Promise<void> {
  try {
    if (!database.isOpen()) {
      await database.open();
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'VersionError' ||
        error.message.includes('VersionError') ||
        (error.cause instanceof Error && error.cause.name === 'VersionError'))
    ) {
      throw new AppError(
        'DB_VERSION_UNSUPPORTED',
        'A base de dados local foi criada por uma versão mais recente do aplicativo. Atualize o aplicativo para abrir seus dados com segurança.',
        { cause: error, recoverable: false },
      );
    }
    throw new AppError(
      'STORAGE_UNAVAILABLE',
      'Não foi possível acessar o armazenamento local (IndexedDB) neste navegador.',
      { cause: error, recoverable: false },
    );
  }
}
