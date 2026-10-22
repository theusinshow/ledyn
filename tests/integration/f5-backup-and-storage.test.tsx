import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_TRAINING_BLUEPRINTS } from '@/content/training/catalog';
import {
  clearAllPersonalDataTransactional,
  exportFullBackupZip,
  hasPersonalDataInLibrary,
  restoreFullBackupZip,
} from '@/infrastructure/backup/backupService';
import { db } from '@/infrastructure/db/database';
import {
  commitPreparedDocument,
  ensureTrainingCatalogSeeded,
  preparePastedTextDraft,
  saveQuizDraftAnswer,
  saveReadingCheckpoint,
  saveSessionReflection,
  saveUserPreferences,
  startOrResumeQuizAttempt,
  submitQuizAttempt,
} from '@/infrastructure/db/repositories';
import { prepareFileImportDraft } from '@/infrastructure/importers/pipeline';
import {
  formatBytesPtBr,
  getStorageDiagnostics,
  requestPersistentStorage,
} from '@/infrastructure/storage/storageDiagnostics';
import { computeSha256Hex } from '@/shared/utils';
import {
  createFx03TxtUtf8Bytes,
  createFx04ThreePagePdfBytes,
  createFx06ThreeChapterEpubBytes,
  createFx11InvalidBackupZipBytes,
  FX_01_TEXT,
} from '../fixtures/corpus';

describe('F5 Integration — Backup Completo ZIP Round-Trip, Validação FX-11 e Armazenamento (AC-24, AC-25, AC-26)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('AC-24: exporta e restaura backup completo (.reading-backup.zip) com os 4 formatos, binários reais, sessões, quiz enviado, rascunho, reflexão e preferências sem retokenizar', async () => {
    // 1. Semeia catálogo de treinos
    await ensureTrainingCatalogSeeded();

    // 2. Importa os 4 formatos (pasted, txt, pdf, epub)
    const pastedDraft = await preparePastedTextDraft(
      FX_01_TEXT,
      'Documento Colado FX-10',
    );
    const pastedDoc = await commitPreparedDocument(pastedDraft);

    const txtBytes = createFx03TxtUtf8Bytes();
    const txtDraft = await prepareFileImportDraft({
      fileName: 'notas-estudo.txt',
      mimeType: 'text/plain',
      declaredByteSize: txtBytes.byteLength,
      readBytes: () => txtBytes,
    });
    const txtDoc = await commitPreparedDocument(txtDraft);

    const pdfBytes = createFx04ThreePagePdfBytes();
    const pdfDraft = await prepareFileImportDraft({
      fileName: 'artigo-3-paginas.pdf',
      mimeType: 'application/pdf',
      declaredByteSize: pdfBytes.byteLength,
      readBytes: () => pdfBytes,
    });
    const pdfDoc = await commitPreparedDocument(pdfDraft);

    const epubBytes = createFx06ThreeChapterEpubBytes();
    const epubDraft = await prepareFileImportDraft({
      fileName: 'manual-3-capitulos.epub',
      mimeType: 'application/epub+zip',
      declaredByteSize: epubBytes.byteLength,
      readBytes: () => epubBytes,
    });
    const epubDoc = await commitPreparedDocument(epubDraft);

    // 3. Registra sessões variadas (incluindo uma deixada como playing com lease expirado, uma concluída em texto pessoal com reflexão e duas de treino com quiz enviado e rascunho)
    await saveReadingCheckpoint({
      sessionId: 'sess-pasted-completed',
      documentId: pastedDoc.id,
      contentVersionId: pastedDoc.contentVersionId,
      ownerId: 'tab-a',
      startedAt: '2026-10-22T10:00:00.000Z',
      snapshot: {
        status: 'completed',
        mode: 'rsvp',
        cursor: {
          contentVersionId: pastedDoc.contentVersionId,
          tokenIndex: pastedDoc.tokenCount,
        },
        currentToken: null,
        tokenCount: pastedDoc.tokenCount,
        wpm: 300,
        punctuationPauseEnabled: true,
        activeMs: 20000,
        presentedCount: pastedDoc.tokenCount,
        coverageRanges: [[0, pastedDoc.tokenCount]],
        modeSegments: [
          { mode: 'rsvp', startedAtActiveMs: 0, endedAtActiveMs: 20000 },
        ],
        settingsChanges: [],
        lastPauseReason: null,
      },
      sessionStatusOverride: 'completed',
    });

    await saveSessionReflection(
      'sess-pasted-completed',
      'Reflexão preservada no round-trip do backup ZIP.',
    );

    // Sessão em documento PDF que ficou com status 'playing' (mas lease já expirou)
    await db.sessions.put({
      id: 'sess-pdf-playing',
      documentId: pdfDoc.id,
      contentVersionId: pdfDoc.contentVersionId,
      status: 'playing',
      currentMode: 'guided',
      modeSegments: [],
      startedAt: '2026-10-22T10:05:00.000Z',
      endedAt: null,
      activeMs: 4000,
      presentedCount: 12,
      coverageRanges: [[0, 12]],
      settingsChanges: [],
      cursor: {
        contentVersionId: pdfDoc.contentVersionId,
        tokenIndex: 12,
      },
      checkpointRevision: 2,
      recoveredFromInterruption: false,
    });

    // Lease expirado na tabela leases (não deve ser exportado)
    await db.leases.put({
      key: 'active-reading-session',
      ownerId: 'tab-old',
      sessionId: 'sess-pdf-playing',
      documentId: pdfDoc.id,
      expiresAt: Date.now() - 60_000,
      revision: 1,
    });

    // Sessão de treino 1 com quiz enviado (4/4 = 100%)
    const t1Id = BUILT_IN_TRAINING_BLUEPRINTS[0]!.documentId;
    const t1Doc = (await db.documents.get(t1Id))!;
    await saveReadingCheckpoint({
      sessionId: 'sess-t1-completed',
      documentId: t1Doc.id,
      contentVersionId: t1Doc.contentVersionId,
      ownerId: 'tab-a',
      startedAt: '2026-10-22T10:10:00.000Z',
      snapshot: {
        status: 'completed',
        mode: 'rsvp',
        cursor: {
          contentVersionId: t1Doc.contentVersionId,
          tokenIndex: t1Doc.tokenCount,
        },
        currentToken: null,
        tokenCount: t1Doc.tokenCount,
        wpm: 250,
        punctuationPauseEnabled: true,
        activeMs: 15000,
        presentedCount: t1Doc.tokenCount,
        coverageRanges: [[0, t1Doc.tokenCount]],
        modeSegments: [],
        settingsChanges: [],
        lastPauseReason: null,
      },
      sessionStatusOverride: 'completed',
    });

    const attemptT1 = await startOrResumeQuizAttempt(
      'sess-t1-completed',
      t1Doc.id,
    );
    const qsT1 = (await db.questionSets.get(attemptT1.questionSetId))!;
    for (const q of qsT1.questions) {
      await saveQuizDraftAnswer(attemptT1.id, q.id, q.correctOptionId);
    }
    await submitQuizAttempt(attemptT1.id);

    // Sessão de treino 2 com quiz em rascunho (draft)
    const t2Id = BUILT_IN_TRAINING_BLUEPRINTS[1]!.documentId;
    const t2Doc = (await db.documents.get(t2Id))!;
    await saveReadingCheckpoint({
      sessionId: 'sess-t2-completed',
      documentId: t2Doc.id,
      contentVersionId: t2Doc.contentVersionId,
      ownerId: 'tab-a',
      startedAt: '2026-10-22T10:20:00.000Z',
      snapshot: {
        status: 'completed',
        mode: 'guided',
        cursor: {
          contentVersionId: t2Doc.contentVersionId,
          tokenIndex: t2Doc.tokenCount,
        },
        currentToken: null,
        tokenCount: t2Doc.tokenCount,
        wpm: 275,
        punctuationPauseEnabled: false,
        activeMs: 14000,
        presentedCount: t2Doc.tokenCount,
        coverageRanges: [[0, t2Doc.tokenCount]],
        modeSegments: [],
        settingsChanges: [],
        lastPauseReason: null,
      },
      sessionStatusOverride: 'completed',
    });

    const attemptT2Draft = await startOrResumeQuizAttempt(
      'sess-t2-completed',
      t2Doc.id,
    );
    const qsT2 = (await db.questionSets.get(attemptT2Draft.questionSetId))!;
    await saveQuizDraftAnswer(
      attemptT2Draft.id,
      qsT2.questions[0]!.id,
      qsT2.questions[0]!.correctOptionId,
    );

    // 4. Salva preferências customizadas
    await saveUserPreferences({
      theme: 'dark',
      defaultWpm: 350,
      punctuationPauseEnabled: false,
      guidedFontSizePx: 24,
      reducedMotion: true,
    });

    // Captura snapshot de comparação antes de exportar
    const exported = await exportFullBackupZip();
    expect(exported.manifest.encrypted).toBe(false);
    expect(exported.unencryptedNotice).toContain('sem criptografia');
    expect(exported.manifest.counts.documents).toBe(7); // 3 treinos + 4 importados
    expect(exported.manifest.counts.sourceFiles).toBe(7);
    expect(exported.manifest.counts.sessions).toBe(4);
    expect(exported.manifest.counts.quizAttempts).toBe(2);
    expect(exported.manifest.counts.reflections).toBe(1);

    // 5. Simula Perfil B com apenas os seeds de treino intocados (permitido na restauração)
    await db.delete();
    await db.open();
    await ensureTrainingCatalogSeeded();

    const preRestoreStatus = await hasPersonalDataInLibrary();
    expect(preRestoreStatus.hasPersonalData).toBe(false);

    const restored = await restoreFullBackupZip(exported.zipBytes);
    expect(restored.restoredCounts).toEqual(exported.manifest.counts);

    // 6. Verifica integridade pós-restauração
    expect(await db.leases.count()).toBe(0);
    expect(await db.documents.count()).toBe(7);

    // Verifica que os binários restaurados preservam exatamente o SHA-256 original
    for (const docId of [pastedDoc.id, txtDoc.id, pdfDoc.id, epubDoc.id]) {
      const doc = (await db.documents.get(docId))!;
      const sf = (await db.sourceFiles.get(docId))!;
      const ab = await sf.blob.arrayBuffer();
      const restoredHash = await computeSha256Hex(new Uint8Array(ab));
      expect(restoredHash).toBe(doc.sourceHash);
      expect(restoredHash).toBe(sf.sha256);
    }

    // Sessão que estava 'playing' foi convertida para 'interrupted' (nunca retoma sozinha)
    const restoredPlayingSession = (await db.sessions.get('sess-pdf-playing'))!;
    expect(restoredPlayingSession.status).toBe('interrupted');
    expect(restoredPlayingSession.recoveredFromInterruption).toBe(true);
    expect(restoredPlayingSession.cursor.tokenIndex).toBe(12);

    // Tentativa enviada e tentativa em rascunho preservadas
    const restoredSubmitted = (await db.quizAttempts.get(attemptT1.id))!;
    expect(restoredSubmitted.status).toBe('submitted');
    expect(restoredSubmitted.correctCount).toBe(4);

    const restoredDraft = (await db.quizAttempts.get(attemptT2Draft.id))!;
    expect(restoredDraft.status).toBe('draft');
    expect(restoredDraft.correctCount).toBeNull();

    // Reflexão preservada
    const restoredReflections = await db.reflections.toArray();
    expect(restoredReflections).toHaveLength(1);
    expect(restoredReflections[0]!.text).toContain('round-trip do backup ZIP');
  });

  it('AC-25: bloqueia restauração em base com dados pessoais (RESTORE_REQUIRES_EMPTY_LIBRARY), rejeita FX-11 e faz rollback integral em falha transacional', async () => {
    // 1. Exporta um backup válido de base limpa com treinos
    await ensureTrainingCatalogSeeded();
    const validBackup = await exportFullBackupZip();

    // 2. Adiciona um documento pessoal à base atual -> deve bloquear restauração
    const draft = await preparePastedTextDraft(
      FX_01_TEXT,
      'Texto Pessoal Existente',
    );
    const personalDoc = await commitPreparedDocument(draft);

    await expect(
      restoreFullBackupZip(validBackup.zipBytes),
    ).rejects.toMatchObject({
      code: 'RESTORE_REQUIRES_EMPTY_LIBRARY',
    });

    // O documento pessoal existente permanece intacto
    expect(await db.documents.get(personalDoc.id)).toBeDefined();

    // 3. Limpa os dados pessoais explicitamente -> agora a biblioteca aceita validação
    await clearAllPersonalDataTransactional();
    await ensureTrainingCatalogSeeded();

    // 4. Rejeita todas as variantes inválidas/hostis de FX-11 mantendo os seeds intactos
    await expect(
      restoreFullBackupZip(createFx11InvalidBackupZipBytes('path_traversal')),
    ).rejects.toMatchObject({ code: 'BACKUP_INVALID' });

    await expect(
      restoreFullBackupZip(createFx11InvalidBackupZipBytes('future_version')),
    ).rejects.toMatchObject({ code: 'BACKUP_VERSION_UNSUPPORTED' });

    await expect(
      restoreFullBackupZip(createFx11InvalidBackupZipBytes('missing_entry')),
    ).rejects.toMatchObject({ code: 'BACKUP_INVALID' });

    await expect(
      restoreFullBackupZip(createFx11InvalidBackupZipBytes('corrupt_hash')),
    ).rejects.toMatchObject({ code: 'BACKUP_INVALID' });

    await expect(
      restoreFullBackupZip(
        createFx11InvalidBackupZipBytes('uncompressed_overflow'),
        { limits: { maxUncompressedBytes: 16 * 1024 } },
      ),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });

    // 5. Falha injetada dentro da transação de restauração faz rollback completo
    await expect(
      restoreFullBackupZip(validBackup.zipBytes, {
        faultInjectionHook: () => {
          throw new Error('Simulated IDB Transaction Abort');
        },
      }),
    ).rejects.toThrow();

    // Os 3 documentos de treino anteriores continuam intactos após o rollback
    expect(await db.documents.count()).toBe(3);
  });

  it('AC-26: consulta estimativa de armazenamento e persistência com suporte e com fallback quando ausentes', async () => {
    expect(formatBytesPtBr(512)).toBe('512 B');
    expect(formatBytesPtBr(2048)).toBe('2,0 KiB');
    expect(formatBytesPtBr(5 * 1024 * 1024)).toBe('5,0 MiB');
    expect(formatBytesPtBr(null)).toBe('Não informado pelo navegador');

    const originalStorage = navigator.storage;
    try {
      // Simula navegador com navigator.storage completo
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: vi
            .fn()
            .mockResolvedValue({ usage: 2 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
          persisted: vi.fn().mockResolvedValue(false),
          persist: vi.fn().mockResolvedValue(false),
        },
      });

      const diagSupported = await getStorageDiagnostics();
      expect(diagSupported.supported).toBe(true);
      expect(diagSupported.usageBytes).toBe(2 * 1024 * 1024);
      expect(diagSupported.quotaBytes).toBe(100 * 1024 * 1024);
      expect(diagSupported.persisted).toBe(false);

      // Recusa de persist() não é erro fatal
      const outcomeDenied = await requestPersistentStorage();
      expect(outcomeDenied.supported).toBe(true);
      expect(outcomeDenied.granted).toBe(false);
      expect(outcomeDenied.message).toContain('continuar lendo normalmente');

      // Simula navegador sem navigator.storage
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: undefined,
      });

      const diagFallback = await getStorageDiagnostics();
      expect(diagFallback.supported).toBe(false);
      expect(diagFallback.usageBytes).toBeNull();

      const outcomeUnsupported = await requestPersistentStorage();
      expect(outcomeUnsupported.supported).toBe(false);
      expect(outcomeUnsupported.granted).toBe(false);
    } finally {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: originalStorage,
      });
    }
  });
});
