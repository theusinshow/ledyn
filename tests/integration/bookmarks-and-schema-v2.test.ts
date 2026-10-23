import Dexie from 'dexie';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  exportFullBackupZip,
  hasPersonalDataInLibrary,
  restoreFullBackupZip,
} from '@/infrastructure/backup/backupService';
import { DB_SCHEMA_VERSION, LedynDatabase } from '@/infrastructure/db/database';
import {
  addBookmark,
  commitPreparedDocument,
  deleteBookmark,
  deleteDocumentTransactional,
  listBookmarks,
  preparePastedTextDraft,
  updateBookmarkNote,
} from '@/infrastructure/db/repositories';
import { computeSha256Hex } from '@/shared/utils';
import { FX_02_TEXT } from '../fixtures/corpus';

async function seedDocument(database: LedynDatabase) {
  const draft = await preparePastedTextDraft(FX_02_TEXT, 'Documento com marcadores', database);
  return commitPreparedDocument(draft, { database });
}

describe('Schema v2 — migração aditiva para marcadores', () => {
  it('abre uma base v1 existente sem perder dados e com a tabela de marcadores vazia', async () => {
    const name = `mig-v1-${Date.now()}-${Math.random()}`;

    // Base criada pela versão anterior do app (somente schema v1).
    const legacy = new Dexie(name);
    legacy.version(1).stores({
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
    await legacy.open();
    await legacy.table('documents').put({ id: 'doc-legado', title: 'Legado', isTraining: false, sourceHash: 'h', lastOpenedAt: 'x', updatedAt: 'x' });
    await legacy.table('settings').put({ key: 'defaultWpm', value: 325, schemaVersion: 1 });
    legacy.close();

    const upgraded = new LedynDatabase(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(DB_SCHEMA_VERSION);
    expect(await upgraded.documents.get('doc-legado')).toMatchObject({ title: 'Legado' });
    expect(await upgraded.settings.get('defaultWpm')).toMatchObject({ value: 325 });
    expect(await upgraded.bookmarks.count()).toBe(0);
    upgraded.close();
  });
});

describe('Marcadores — repositório', () => {
  let testDb: LedynDatabase;

  beforeEach(async () => {
    testDb = new LedynDatabase(`bm-${Date.now()}-${Math.random()}`);
    await testDb.open();
  });

  it('cria, evita duplicata no mesmo token, lista em ordem do texto, edita nota e remove', async () => {
    const doc = await seedDocument(testDb);
    const base = { documentId: doc.id, contentVersionId: doc.contentVersionId };
    const later = await addBookmark({ ...base, tokenIndex: 8, excerpt: 'trecho oito' }, testDb);
    const earlier = await addBookmark({ ...base, tokenIndex: 2, excerpt: 'trecho dois' }, testDb);
    const again = await addBookmark({ ...base, tokenIndex: 8, excerpt: 'outro' }, testDb);
    expect(again.id).toBe(later.id);

    expect((await listBookmarks(doc.id, testDb)).map((b) => b.tokenIndex)).toEqual([2, 8]);

    await updateBookmarkNote(earlier.id, 'Revisar este conceito', testDb);
    expect((await listBookmarks(doc.id, testDb))[0]!.note).toBe('Revisar este conceito');

    await deleteBookmark(earlier.id, testDb);
    expect((await listBookmarks(doc.id, testDb)).map((b) => b.id)).toEqual([later.id]);
  });

  it('recusa versão de conteúdo divergente e conta como dado pessoal', async () => {
    const doc = await seedDocument(testDb);
    await expect(
      addBookmark({ documentId: doc.id, contentVersionId: 'outra-versao', tokenIndex: 1, excerpt: 'x' }, testDb),
    ).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
    await addBookmark({ documentId: doc.id, contentVersionId: doc.contentVersionId, tokenIndex: 1, excerpt: 'x' }, testDb);
    expect((await hasPersonalDataInLibrary(testDb)).hasPersonalData).toBe(true);
  });

  it('excluir o documento remove os marcadores na mesma transação', async () => {
    const doc = await seedDocument(testDb);
    await addBookmark({ documentId: doc.id, contentVersionId: doc.contentVersionId, tokenIndex: 3, excerpt: 'x' }, testDb);
    await deleteDocumentTransactional(doc.id, testDb);
    expect(await testDb.bookmarks.count()).toBe(0);
  });
});

describe('Marcadores — backup', () => {
  let source: LedynDatabase;

  beforeEach(async () => {
    source = new LedynDatabase(`bk-src-${Date.now()}-${Math.random()}`);
    await source.open();
  });

  async function freshTarget() {
    const target = new LedynDatabase(`bk-dst-${Date.now()}-${Math.random()}`);
    await target.open();
    return target;
  }

  it('backup v2 leva os marcadores e a restauração os devolve idênticos', async () => {
    const doc = await seedDocument(source);
    const bm = await addBookmark({ documentId: doc.id, contentVersionId: doc.contentVersionId, tokenIndex: 4, excerpt: 'trecho' }, source);
    await updateBookmarkNote(bm.id, 'nota', source);

    const exported = await exportFullBackupZip({ database: source });
    expect(exported.manifest.dbSchemaVersion).toBe(2);
    expect(exported.manifest.counts.bookmarks).toBe(1);

    const target = await freshTarget();
    await restoreFullBackupZip(exported.zipBytes, { database: target });
    expect(await target.bookmarks.toArray()).toEqual([await source.bookmarks.get(bm.id)]);
  });

  /** Reescreve um backup v2 como se tivesse sido exportado pela versão v1 do app. */
  async function downgradeToV1(zipBytes: Uint8Array): Promise<Uint8Array> {
    const files = unzipSync(zipBytes);
    delete files['data/bookmarks.json'];
    const manifest = JSON.parse(strFromU8(files['manifest.json']!));
    manifest.dbSchemaVersion = 1;
    delete manifest.counts.bookmarks;
    manifest.files = manifest.files.filter((f: { path: string }) => f.path !== 'data/bookmarks.json');
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    return zipSync(files);
  }

  it('backups antigos (schema v1, sem marcadores) continuam restaurando', async () => {
    await seedDocument(source);
    const exported = await exportFullBackupZip({ database: source });
    const v1Zip = await downgradeToV1(exported.zipBytes);

    const target = await freshTarget();
    const result = await restoreFullBackupZip(v1Zip, { database: target });
    expect(result).toBeTruthy();
    expect(await target.documents.count()).toBe(await source.documents.count());
    expect(await target.bookmarks.count()).toBe(0);
  });

  it('recusa marcador que aponta para posição inexistente, sem gravar nada', async () => {
    const doc = await seedDocument(source);
    await addBookmark({ documentId: doc.id, contentVersionId: doc.contentVersionId, tokenIndex: 1, excerpt: 'x' }, source);
    const exported = await exportFullBackupZip({ database: source });

    const files = unzipSync(exported.zipBytes);
    const bookmarks = JSON.parse(strFromU8(files['data/bookmarks.json']!));
    bookmarks[0].tokenIndex = 9_999_999;
    const tampered = strToU8(JSON.stringify(bookmarks));
    files['data/bookmarks.json'] = tampered;
    const manifest = JSON.parse(strFromU8(files['manifest.json']!));
    const entry = manifest.files.find((f: { path: string }) => f.path === 'data/bookmarks.json');
    entry.sha256 = await computeSha256Hex(tampered);
    entry.byteSize = tampered.byteLength;
    files['manifest.json'] = strToU8(JSON.stringify(manifest));

    const target = await freshTarget();
    await expect(restoreFullBackupZip(zipSync(files), { database: target })).rejects.toMatchObject({
      code: 'BACKUP_INVALID',
    });
    expect(await target.bookmarks.count()).toBe(0);
    expect(await target.documents.filter((d) => !d.isTraining).count()).toBe(0);
  });
});
