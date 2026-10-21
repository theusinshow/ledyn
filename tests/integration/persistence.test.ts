import { beforeEach, describe, expect, it } from 'vitest';
import { VirtualClock } from '@/domain/reading/clock';
import { ReadingEngine } from '@/domain/reading/engine';
import { LedynDatabase } from '@/infrastructure/db/database';
import { ReadingLeaseManager } from '@/infrastructure/db/leaseManager';
import {
  commitPreparedDocument,
  deleteDocumentTransactional,
  listLibraryItems,
  loadReaderDocumentBundle,
  preparePastedTextDraft,
  saveReadingCheckpoint,
} from '@/infrastructure/db/repositories';
import { AppError } from '@/shared/errors';
import { FX_01_TEXT, FX_02_TEXT } from '../fixtures/corpus';

describe('Persistência Transacional, Checkpoints e Conflito de Abas (AC-01 / AC-02 / AC-15 / AC-16 / AC-17)', () => {
  let testDb: LedynDatabase;

  beforeEach(async () => {
    testDb = new LedynDatabase(`test-db-${Date.now()}-${Math.random()}`);
    await testDb.open();
  });

  it('AC-01: persiste documento, blob original UTF-8, snapshot normalizado, chunks de tokens e progresso inicial', async () => {
    const draft = await preparePastedTextDraft(
      FX_02_TEXT,
      'Artigo de Teste F1',
      testDb,
    );
    expect(draft.duplicateDocument).toBeNull();

    const doc = await commitPreparedDocument(draft, { database: testDb });
    expect(doc.title).toBe('Artigo de Teste F1');
    expect(doc.tokenCount).toBe(draft.tokens.length);

    // Verifica todas as stores
    const storedDoc = await testDb.documents.get(doc.id);
    const storedSource = await testDb.sourceFiles.get(doc.id);
    const storedContent = await testDb.contents.get(doc.contentVersionId);
    const storedChunks = await testDb.tokenChunks
      .where('contentVersionId')
      .equals(doc.contentVersionId)
      .toArray();
    const storedProgress = await testDb.progress.get(doc.id);

    expect(storedDoc).toBeDefined();
    expect(storedSource?.sha256).toBe(draft.sourceHash);
    expect(storedContent?.normalizedText).toBe(draft.normalizedText);
    expect(storedChunks.length).toBeGreaterThan(0);
    expect(storedProgress?.cursor.tokenIndex).toBe(0);
    expect(storedProgress?.completed).toBe(false);

    // Detecta duplicata ao preparar o mesmo texto novamente
    const secondDraft = await preparePastedTextDraft(
      FX_02_TEXT,
      'Outro Título',
      testDb,
    );
    expect(secondDraft.duplicateDocument?.id).toBe(doc.id);

    // Lista na biblioteca
    const list = await listLibraryItems(undefined, testDb);
    expect(list).toHaveLength(1);
    expect(list[0]?.document.id).toBe(doc.id);

    // Remoção transacional limpa todas as stores relacionadas
    await deleteDocumentTransactional(doc.id, testDb);
    expect(await testDb.documents.count()).toBe(0);
    expect(await testDb.sourceFiles.count()).toBe(0);
    expect(await testDb.contents.count()).toBe(0);
    expect(await testDb.tokenChunks.count()).toBe(0);
    expect(await testDb.progress.count()).toBe(0);
  });

  it('AC-02 e AC-17: reverte todas as stores se ocorrer falha durante a transação de commit (zero órfãos)', async () => {
    const draft = await preparePastedTextDraft(
      FX_01_TEXT,
      'Documento com Falha de Escrita',
      testDb,
    );

    await expect(
      commitPreparedDocument(draft, {
        database: testDb,
        beforeTransactionCommitHook: () => {
          const err = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          throw err;
        },
      }),
    ).rejects.toMatchObject({
      code: 'STORAGE_FULL',
    });

    expect(await testDb.documents.count()).toBe(0);
    expect(await testDb.sourceFiles.count()).toBe(0);
    expect(await testDb.contents.count()).toBe(0);
    expect(await testDb.tokenChunks.count()).toBe(0);
    expect(await testDb.progress.count()).toBe(0);
  });

  it('AC-15: grava checkpoints idempotentes e recupera sessão interrompida sempre pausada no último ponto salvo', async () => {
    const draft = await preparePastedTextDraft(FX_01_TEXT, 'Texto 100', testDb);
    const doc = await commitPreparedDocument(draft, { database: testDb });

    const bundle1 = await loadReaderDocumentBundle(
      doc.id,
      'tab-1',
      1_000,
      testDb,
    );
    const clock = new VirtualClock();
    const engine = new ReadingEngine({
      clock,
      contentVersionId: bundle1.content.id,
      tokens: bundle1.tokens,
      initialWpm: 300,
      initialPunctuationPauseEnabled: false,
    });

    // Inicia leitura e avança 10 palavras (2.000 ms)
    engine.play();
    clock.advanceBy(2_000);
    expect(engine.getSnapshot().cursor.tokenIndex).toBe(10);

    // Salva checkpoint aos 2 segundos enquanto ainda está 'playing'
    const cp1 = await saveReadingCheckpoint({
      sessionId: 'sess-1',
      documentId: doc.id,
      contentVersionId: bundle1.content.id,
      ownerId: 'tab-1',
      startedAt: new Date(1_000).toISOString(),
      snapshot: engine.getSnapshot(),
      nowMs: 3_000,
      database: testDb,
    });

    expect(cp1.session.status).toBe('playing');
    expect(cp1.session.cursor.tokenIndex).toBe(10);
    expect(cp1.session.activeMs).toBe(2_000);
    expect(cp1.session.checkpointRevision).toBe(1);

    // Simula fechamento abrupto e reabertura 60 segundos depois (após expiração do lease)
    const reopenedBundle = await loadReaderDocumentBundle(
      doc.id,
      'tab-new',
      65_000,
      testDb,
    );

    expect(reopenedBundle.wasInterrupted).toBe(true);
    expect(reopenedBundle.progress.cursor.tokenIndex).toBe(10);
    expect(reopenedBundle.resumableSession?.status).toBe('interrupted');
    // O tempo em que o navegador ficou fechado (62s) NÃO foi somado ao activeMs!
    expect(reopenedBundle.resumableSession?.activeMs).toBe(2_000);
    expect(reopenedBundle.resumableSession?.presentedCount).toBe(10);
  });

  it('AC-16: protege contra duas abas reproduzindo simultaneamente via lease transacional no Dexie', async () => {
    const draft = await preparePastedTextDraft(
      FX_01_TEXT,
      'Conflito Abas',
      testDb,
    );
    const doc = await commitPreparedDocument(draft, { database: testDb });

    let currentNow = 10_000;
    const leaseTabA = new ReadingLeaseManager({
      ownerId: 'tab-A',
      database: testDb,
      nowFn: () => currentNow,
      enableBroadcast: false,
    });
    const leaseTabB = new ReadingLeaseManager({
      ownerId: 'tab-B',
      database: testDb,
      nowFn: () => currentNow,
      enableBroadcast: false,
    });

    // Aba A adquire o lease
    await leaseTabA.acquireOrRenewLease('sess-A', doc.id);
    expect(await leaseTabA.verifyOwnership()).toBe(true);

    // Aba B tenta adquirir lease enquanto o de A está ativo -> bloqueado com SESSION_LOCKED
    await expect(
      leaseTabB.acquireOrRenewLease('sess-B', doc.id),
    ).rejects.toMatchObject({
      code: 'SESSION_LOCKED',
    });

    // Aba B tenta gravar checkpoint concorrente -> bloqueado com SESSION_LOCKED
    const clock = new VirtualClock();
    const engineB = new ReadingEngine({
      clock,
      contentVersionId: doc.contentVersionId,
      tokens: draft.tokens,
    });

    await expect(
      saveReadingCheckpoint({
        sessionId: 'sess-B',
        documentId: doc.id,
        contentVersionId: doc.contentVersionId,
        ownerId: 'tab-B',
        startedAt: new Date(currentNow).toISOString(),
        snapshot: engineB.getSnapshot(),
        nowMs: currentNow,
        database: testDb,
      }),
    ).rejects.toThrowError(AppError);

    // Após Aba A liberar o lease (ou após expiração de 10 s), Aba B consegue assumir com segurança
    currentNow += 11_000;
    const acquiredByB = await leaseTabB.acquireOrRenewLease('sess-B', doc.id);
    expect(acquiredByB.ownerId).toBe('tab-B');
    expect(acquiredByB.revision).toBe(2);

    leaseTabA.destroy();
    leaseTabB.destroy();
  });
});
