import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  FileText,
  FileUp,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAppStore } from '@/application/stores';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { DocumentFormat } from '@/domain/contracts';
import {
  commitPreparedDocument,
  deleteDocumentTransactional,
  listLibraryItems,
  preparePastedTextDraft,
  renameDocument,
  type LibraryItemSummary,
} from '@/infrastructure/db/repositories';
import {
  cancelImportJob,
  createImportJob,
  isImportJobCancelled,
  prepareFileImportDraft,
} from '@/infrastructure/importers/pipeline';
import { DocumentCover } from '@/features/library/DocumentCover';
import { toAppError } from '@/shared/errors';
import { formatDateTimePtBr } from '@/shared/utils';

const HAS_WORD_CHAR_RE = /[\p{L}\p{N}]/u;
export const LIBRARY_WINDOW_STEP = 50;

type ImportTabMode = 'paste' | 'file';

function formatLabelForBadge(format: DocumentFormat): string {
  switch (format) {
    case 'pasted':
      return 'Texto colado';
    case 'txt':
      return 'TXT';
    case 'pdf':
      return 'PDF';
    case 'epub':
      return 'EPUB';
  }
}

export function LibraryPage() {
  const navigate = useNavigate();
  const {
    rawInputText,
    rawInputTitle,
    preparedDraft,
    isPreparingDraft,
    draftError,
    setRawInputText,
    setRawInputTitle,
    setPreparedDraft,
    setIsPreparingDraft,
    setDraftError,
    clearDraft,
  } = useAppStore();

  const [items, setItems] = useState<LibraryItemSummary[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [showAddPanel, setShowAddPanel] = useState<boolean>(() =>
    Boolean(preparedDraft),
  );
  const [activeTab, setActiveTab] = useState<ImportTabMode>('paste');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileCustomTitle, setFileCustomTitle] = useState('');
  const [importStageMessage, setImportStageMessage] = useState<string | null>(
    null,
  );
  const activeJobIdRef = useRef<string | null>(null);

  const [previewTitle, setPreviewTitle] = useState<string>(
    () => preparedDraft?.title ?? '',
  );
  const [previewSectionIdx, setPreviewSectionIdx] = useState(0);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(LIBRARY_WINDOW_STEP);

  const refreshLibrary = useCallback(async (query?: string) => {
    try {
      const result = await listLibraryItems(query);
      setItems(result);
      setLibraryError(null);
    } catch (err) {
      const appErr = toAppError(err);
      setLibraryError(appErr.userMessage);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    listLibraryItems(searchQuery)
      .then((result) => {
        if (active) {
          setItems(result);
          setLibraryError(null);
        }
      })
      .catch((err) => {
        if (active) {
          const appErr = toAppError(err);
          setLibraryError(appErr.userMessage);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingLibrary(false);
        }
      });

    return () => {
      active = false;
    };
  }, [searchQuery]);

  const canPreparePaste =
    HAS_WORD_CHAR_RE.test(rawInputText) && !isPreparingDraft;

  const canPrepareFile = selectedFile !== null && !isPreparingDraft;

  const handlePreparePasteDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPreparePaste) return;

    setIsPreparingDraft(true);
    setDraftError(null);
    setCommitError(null);
    setImportStageMessage('Normalizando e tokenizando texto...');

    try {
      const draft = await preparePastedTextDraft(rawInputText, rawInputTitle);
      setPreparedDraft(draft);
      setPreviewTitle(draft.title);
      setPreviewSectionIdx(0);
      setShowAddPanel(true);
    } catch (err) {
      const appErr = toAppError(err);
      setDraftError(appErr.userMessage);
    } finally {
      setIsPreparingDraft(false);
      setImportStageMessage(null);
    }
  };

  const handlePrepareFileDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || isPreparingDraft) return;

    const job = createImportJob();
    activeJobIdRef.current = job.jobId;
    setIsPreparingDraft(true);
    setDraftError(null);
    setCommitError(null);
    setImportStageMessage('Verificando arquivo...');

    try {
      const fileToProcess = selectedFile;
      const draft = await prepareFileImportDraft({
        fileName: fileToProcess.name,
        mimeType: fileToProcess.type,
        declaredByteSize: fileToProcess.size,
        readBytes: async () => {
          const buffer = await fileToProcess.arrayBuffer();
          return new Uint8Array(buffer);
        },
        explicitTitle: fileCustomTitle,
        jobId: job.jobId,
        signal: job.signal,
        onProgress: (update) => {
          if (activeJobIdRef.current === job.jobId) {
            setImportStageMessage(update.message);
          }
        },
      });

      // Descarta resultados tardios se o job tiver sido cancelado ou substituído
      if (
        isImportJobCancelled(job.jobId) ||
        activeJobIdRef.current !== job.jobId
      ) {
        return;
      }

      setPreparedDraft(draft);
      setPreviewTitle(draft.title);
      setPreviewSectionIdx(0);
      setShowAddPanel(true);
    } catch (err) {
      if (
        isImportJobCancelled(job.jobId) ||
        activeJobIdRef.current !== job.jobId
      ) {
        return;
      }
      const appErr = toAppError(err);
      if (appErr.code !== 'IMPORT_CANCELLED') {
        setDraftError(appErr.userMessage);
      }
    } finally {
      if (activeJobIdRef.current === job.jobId) {
        activeJobIdRef.current = null;
        setIsPreparingDraft(false);
        setImportStageMessage(null);
      }
    }
  };

  const handleCancelActivePreparation = () => {
    const jobId = activeJobIdRef.current;
    if (jobId) {
      cancelImportJob(jobId);
      activeJobIdRef.current = null;
    }
    setIsPreparingDraft(false);
    setImportStageMessage(null);
    setDraftError(null);
  };

  const handleConfirmSaveAndOpen = async () => {
    if (!preparedDraft || isCommitting || preparedDraft.duplicateDocument) {
      return;
    }

    setIsCommitting(true);
    setCommitError(null);

    try {
      const savedDoc = await commitPreparedDocument(preparedDraft, {
        customTitle: previewTitle,
      });
      clearDraft();
      setSelectedFile(null);
      setFileCustomTitle('');
      setShowAddPanel(false);
      await navigate(`/reader/${savedDoc.id}`);
    } catch (err) {
      const appErr = toAppError(err);
      setCommitError(appErr.userMessage);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleConfirmSaveToLibrary = async () => {
    if (!preparedDraft || isCommitting || preparedDraft.duplicateDocument) {
      return;
    }

    setIsCommitting(true);
    setCommitError(null);

    try {
      await commitPreparedDocument(preparedDraft, {
        customTitle: previewTitle,
      });
      clearDraft();
      setSelectedFile(null);
      setFileCustomTitle('');
      setShowAddPanel(false);
      await refreshLibrary(searchQuery);
    } catch (err) {
      const appErr = toAppError(err);
      setCommitError(appErr.userMessage);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCancelDraft = () => {
    if (activeJobIdRef.current) {
      cancelImportJob(activeJobIdRef.current);
      activeJobIdRef.current = null;
    }
    clearDraft();
    setSelectedFile(null);
    setFileCustomTitle('');
    setCommitError(null);
    setPreviewSectionIdx(0);
    setShowAddPanel(false);
  };

  const handleChooseAnotherFile = () => {
    setPreparedDraft(null);
    setSelectedFile(null);
    setDraftError(null);
    setCommitError(null);
    setPreviewSectionIdx(0);
  };

  const handleStartRename = (docId: string, currentTitle: string) => {
    setRenamingId(docId);
    setRenameValue(currentTitle);
  };

  const handleSaveRename = async (docId: string) => {
    try {
      await renameDocument(docId, renameValue);
      setRenamingId(null);
      await refreshLibrary(searchQuery);
    } catch (err) {
      const appErr = toAppError(err);
      setLibraryError(appErr.userMessage);
    }
  };

  const handleConfirmDelete = async (docId: string) => {
    try {
      await deleteDocumentTransactional(docId);
      void import('@/infrastructure/pdf/pdfCoverService').then((m) =>
        m.releasePdfCover(docId),
      );
      setDeletingId(null);
      await refreshLibrary(searchQuery);
    } catch (err) {
      const appErr = toAppError(err);
      setLibraryError(appErr.userMessage);
    }
  };

  const isPanelVisible = showAddPanel || Boolean(preparedDraft);
  const previewSections = preparedDraft?.previewSections ?? [];
  const currentPreviewSection =
    previewSections[
      Math.min(previewSectionIdx, Math.max(0, previewSections.length - 1))
    ] ?? null;

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Biblioteca */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sua Biblioteca</h1>
          <p className="text-sm text-muted-foreground">
            Seus textos ficam neste dispositivo. Você pode exportar um backup nas configurações.
          </p>
        </div>
        {!isPanelVisible && (
          <Button
            onClick={() => setShowAddPanel(true)}
            data-testid="open-add-text-btn"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar texto
          </Button>
        )}
      </div>

      {/* Painel de Entrada (Colar Texto ou Importar Arquivo) e Prévia */}
      {isPanelVisible && (
        <Card
          className="border-primary/30 shadow-sm"
          data-testid="add-content-card"
        >
          {!preparedDraft ? (
            <div>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>Adicionar conteúdo para leitura</CardTitle>
                    <CardDescription>
                      Cole um texto ou importe um arquivo local (.txt UTF-8, .pdf textual ou .epub sem DRM).
                    </CardDescription>
                  </div>

                  {/* Abas Colar Texto / Importar Arquivo */}
                  <div
                    role="tablist"
                    aria-label="Modo de entrada de conteúdo"
                    className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'paste'}
                      data-testid="tab-paste-text"
                      disabled={isPreparingDraft}
                      onClick={() => {
                        setActiveTab('paste');
                        setDraftError(null);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        activeTab === 'paste'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Colar texto
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'file'}
                      data-testid="tab-import-file"
                      disabled={isPreparingDraft}
                      onClick={() => {
                        setActiveTab('file');
                        setDraftError(null);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        activeTab === 'file'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Importar arquivo
                    </button>
                  </div>
                </div>
              </CardHeader>

              {activeTab === 'paste' ? (
                <form onSubmit={handlePreparePasteDraft}>
                  <CardContent className="space-y-4">
                    {draftError && (
                      <div
                        role="alert"
                        data-testid="draft-error-alert"
                        className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{draftError}</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label
                        htmlFor="paste-title-input"
                        className="text-sm font-medium leading-none"
                      >
                        Título (opcional)
                      </label>
                      <Input
                        id="paste-title-input"
                        data-testid="paste-title-input"
                        placeholder="Se deixado em branco, usaremos o primeiro trecho (até 80 caracteres)"
                        maxLength={80}
                        value={rawInputTitle}
                        onChange={(e) => setRawInputTitle(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="paste-content-textarea"
                        className="text-sm font-medium leading-none"
                      >
                        Texto para leitura
                      </label>
                      <Textarea
                        id="paste-content-textarea"
                        data-testid="paste-content-textarea"
                        placeholder="Cole ou digite seu texto aqui..."
                        rows={8}
                        value={rawInputText}
                        onChange={(e) => setRawInputText(e.target.value)}
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelDraft}
                      data-testid="cancel-paste-btn"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={!canPreparePaste}
                      data-testid="prepare-text-btn"
                    >
                      {isPreparingDraft ? 'Preparando...' : 'Preparar texto'}
                    </Button>
                  </CardFooter>
                </form>
              ) : (
                <form onSubmit={handlePrepareFileDraft}>
                  <CardContent className="space-y-4">
                    {draftError && (
                      <div
                        role="alert"
                        data-testid="draft-error-alert"
                        className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{draftError}</span>
                      </div>
                    )}

                    {isPreparingDraft && importStageMessage && (
                      <div
                        role="status"
                        data-testid="import-stage-progress"
                        className="flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm"
                      >
                        <span className="font-medium">
                          {importStageMessage}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCancelActivePreparation}
                          data-testid="cancel-active-import-btn"
                        >
                          Cancelar preparação
                        </Button>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label
                        htmlFor="file-title-input"
                        className="text-sm font-medium leading-none"
                      >
                        Título personalizado (opcional)
                      </label>
                      <Input
                        id="file-title-input"
                        data-testid="file-title-input"
                        placeholder="Se deixado em branco, usaremos o título/nome do arquivo"
                        maxLength={80}
                        disabled={isPreparingDraft}
                        value={fileCustomTitle}
                        onChange={(e) => setFileCustomTitle(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="file-picker-input"
                        className="text-sm font-medium leading-none block"
                      >
                        Selecionar arquivo (.txt, .pdf ou .epub — até 40 MiB)
                      </label>
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (isPreparingDraft) return;
                          const dropped = e.dataTransfer.files?.[0];
                          if (dropped) {
                            setSelectedFile(dropped);
                            setDraftError(null);
                          }
                        }}
                        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 p-6 text-center"
                      >
                        <FileUp
                          className="h-6 w-6 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          id="file-picker-input"
                          data-testid="file-picker-input"
                          type="file"
                          accept=".txt,.pdf,.epub,text/plain,application/pdf,application/epub+zip"
                          disabled={isPreparingDraft}
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            setSelectedFile(f);
                            setDraftError(null);
                          }}
                          className="max-w-sm cursor-pointer"
                        />
                        {selectedFile && (
                          <p
                            className="text-xs text-muted-foreground"
                            data-testid="selected-file-summary"
                          >
                            Selecionado: <strong>{selectedFile.name}</strong> (
                            {(selectedFile.size / 1024).toFixed(1)} KiB)
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Limites: até 40 MiB, 1.000 páginas PDF, 500.000 palavras. Sem OCR ou remoção de DRM.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelDraft}
                      data-testid="cancel-file-btn"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={!canPrepareFile}
                      data-testid="prepare-file-btn"
                    >
                      {isPreparingDraft ? 'Extraindo...' : 'Preparar arquivo'}
                    </Button>
                  </CardFooter>
                </form>
              )}
            </div>
          ) : (
            <div data-testid="import-preview-panel">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>Prévia da importação</CardTitle>
                    <CardDescription>
                      Confira os dados extraídos e eventuais avisos antes de salvar na biblioteca local.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" data-testid="preview-format-badge">
                    {formatLabelForBadge(preparedDraft.format)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {commitError && (
                  <div
                    role="alert"
                    data-testid="commit-error-alert"
                    className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">
                        Não foi possível salvar o documento.
                      </p>
                      <p>{commitError}</p>
                    </div>
                  </div>
                )}

                {preparedDraft.duplicateDocument && (
                  <div
                    role="status"
                    data-testid="duplicate-document-notice"
                    className="flex flex-col gap-3 rounded-md border border-warning/30 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold">
                        Este arquivo já está na biblioteca
                      </p>
                      <p className="text-muted-foreground">
                        Documento existente: &ldquo;
                        {preparedDraft.duplicateDocument.title}&rdquo;
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleChooseAnotherFile}
                        data-testid="choose-another-file-btn"
                      >
                        Escolher outro
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          const existingId =
                            preparedDraft.duplicateDocument!.id;
                          clearDraft();
                          setShowAddPanel(false);
                          void navigate(`/reader/${existingId}`);
                        }}
                        data-testid="open-existing-duplicate-btn"
                      >
                        Abrir existente
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="preview-title-input"
                    className="text-sm font-medium"
                  >
                    Título do documento
                  </label>
                  <Input
                    id="preview-title-input"
                    data-testid="preview-title-input"
                    maxLength={80}
                    value={previewTitle}
                    onChange={(e) => setPreviewTitle(e.target.value)}
                  />
                </div>

                {/* Métricas reais da prévia */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <span className="text-xs text-muted-foreground">
                      Palavras / Tokens
                    </span>
                    <p
                      className="text-lg font-bold"
                      data-testid="preview-token-count"
                    >
                      {preparedDraft.tokens.length.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <span className="text-xs text-muted-foreground">
                      Parágrafos
                    </span>
                    <p
                      className="text-lg font-bold"
                      data-testid="preview-block-count"
                    >
                      {preparedDraft.blocks.length.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-lg border border-border bg-muted/40 p-3 sm:col-span-1">
                    <span className="text-xs text-muted-foreground">
                      Tempo estimado a 250 PPM
                    </span>
                    <p className="text-lg font-bold">
                      {Math.max(
                        1,
                        Math.ceil(preparedDraft.tokens.length / 250),
                      )}{' '}
                      min
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Nota: A contagem de palavras segue a tokenização versionada do aplicativo (normalizador v
                  {preparedDraft.normalizationVersion} · tokenizador v
                  {preparedDraft.tokenizerVersion}), podendo diferir de editores externos.
                </p>

                {preparedDraft.warnings.length > 0 && (
                  <div
                    role="status"
                    data-testid="preview-warnings-box"
                    className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs space-y-1"
                  >
                    <p className="font-semibold">Avisos da extração:</p>
                    <ul className="list-disc pl-4">
                      {preparedDraft.warnings.map((w, idx) => (
                        <li key={idx}>{w.message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Navegação por Página (PDF) ou Capítulo (EPUB) na prévia */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {previewSections.length > 1
                        ? `Conferência por seção (${previewSectionIdx + 1} de ${previewSections.length})`
                        : 'Amostra do texto normalizado'}
                    </span>

                    {previewSections.length > 1 && (
                      <div
                        className="flex items-center gap-2"
                        data-testid="preview-section-nav"
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={previewSectionIdx <= 0}
                          onClick={() =>
                            setPreviewSectionIdx((idx) => Math.max(0, idx - 1))
                          }
                          data-testid="preview-prev-section-btn"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Anterior
                        </Button>
                        <label
                          htmlFor="preview-section-select"
                          className="sr-only"
                        >
                          Selecionar página ou capítulo
                        </label>
                        <select
                          id="preview-section-select"
                          data-testid="preview-section-select"
                          value={previewSectionIdx}
                          onChange={(e) =>
                            setPreviewSectionIdx(Number(e.target.value))
                          }
                          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          {previewSections.map((sec, idx) => (
                            <option key={sec.id} value={idx}>
                              {sec.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            previewSectionIdx >= previewSections.length - 1
                          }
                          onClick={() =>
                            setPreviewSectionIdx((idx) =>
                              Math.min(previewSections.length - 1, idx + 1),
                            )
                          }
                          data-testid="preview-next-section-btn"
                        >
                          Próxima
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div
                    className="max-h-60 overflow-y-auto rounded-md border border-border bg-muted/20 p-3 text-sm space-y-2"
                    data-testid="preview-text-sample"
                  >
                    {currentPreviewSection ? (
                      currentPreviewSection.paragraphs.length > 0 ? (
                        currentPreviewSection.paragraphs.map((p, idx) => (
                          <p key={idx} className="leading-relaxed">
                            {p}
                          </p>
                        ))
                      ) : (
                        <p className="text-xs italic text-muted-foreground">
                          Esta página/seção não possui texto extraível.
                        </p>
                      )
                    ) : (
                      preparedDraft.blocks.slice(0, 5).map((block) => (
                        <p key={block.id} className="leading-relaxed">
                          {preparedDraft.normalizedText.slice(
                            block.startOffset,
                            block.endOffset,
                          )}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleChooseAnotherFile}
                  disabled={isCommitting}
                  data-testid="back-to-edit-draft-btn"
                >
                  {preparedDraft.format === 'pasted'
                    ? 'Editar texto'
                    : 'Escolher outro arquivo'}
                </Button>
                <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:flex-wrap [&>button]:w-full sm:[&>button]:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelDraft}
                    disabled={isCommitting}
                    data-testid="cancel-preview-btn"
                  >
                    Cancelar
                  </Button>
                  {!preparedDraft.duplicateDocument && (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleConfirmSaveToLibrary}
                        disabled={isCommitting}
                        data-testid="confirm-save-library-btn"
                      >
                        Salvar na biblioteca
                      </Button>
                      <Button
                        type="button"
                        onClick={handleConfirmSaveAndOpen}
                        disabled={isCommitting}
                        data-testid="confirm-save-open-btn"
                      >
                        {isCommitting ? 'Salvando...' : 'Salvar e abrir'}
                      </Button>
                    </>
                  )}
                </div>
              </CardFooter>
            </div>
          )}
        </Card>
      )}

      {/* Barra de busca quando há itens ou busca ativa */}
      {(items.length > 0 || searchQuery.trim().length > 0) && (
        <div className="relative">
          <label htmlFor="library-search-input" className="sr-only">
            Buscar por título
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="library-search-input"
            data-testid="library-search-input"
            type="search"
            placeholder="Buscar documento por título..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(LIBRARY_WINDOW_STEP);
            }}
          />
        </div>
      )}

      {/* Erro de leitura do banco */}
      {libraryError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{libraryError}</span>
        </div>
      )}

      {/* Estados de Carregamento, Vazio ou Lista */}
      {isLoadingLibrary ? (
        <div
          className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground"
          role="status"
        >
          Carregando biblioteca local...
        </div>
      ) : items.length === 0 ? (
        isPanelVisible && searchQuery.trim().length === 0 ? null : (
        <Card data-testid="library-empty-state">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <div className="rounded-full bg-muted p-3">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            {searchQuery.trim().length > 0 ? (
              <div className="space-y-1">
                <p className="font-semibold">
                  Nenhum documento encontrado para &ldquo;{searchQuery}&rdquo;
                </p>
                <p className="text-sm text-muted-foreground">
                  Tente outro termo ou limpe o filtro de busca.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1 max-w-md">
                  <p className="font-semibold text-base">
                    Sua biblioteca está vazia
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Seus textos ficam neste dispositivo. Adicione um texto colado ou importe um arquivo (.txt, .pdf, .epub) para começar.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button
                    onClick={() => {
                      setActiveTab('paste');
                      setShowAddPanel(true);
                    }}
                    data-testid="empty-state-add-text-btn"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Adicionar texto
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActiveTab('file');
                      setShowAddPanel(true);
                    }}
                    data-testid="empty-state-import-file-btn"
                  >
                    <FileUp className="h-4 w-4" aria-hidden="true" />
                    Importar arquivo
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void navigate('/training')}
                    data-testid="empty-state-training-btn"
                  >
                    Experimentar um exercício
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span data-testid="library-total-count">
              Exibindo {Math.min(visibleCount, items.length)} de {items.length}{' '}
              {items.length === 1 ? 'documento' : 'documentos'}
            </span>
          </div>

          <div className="grid gap-4" data-testid="library-items-list">
            {items
              .slice(0, visibleCount)
              .map(({ document: doc, progress, progressPercent }) => {
                const currentTokenIdx = progress?.cursor.tokenIndex ?? 0;
                const isCompleted = Boolean(progress?.completed);
                const hasStarted = currentTokenIdx > 0 && !isCompleted;

                return (
                  <Card
                    key={doc.id}
                    data-testid={`library-item-${doc.id}`}
                    className="transition-colors hover:border-primary/40"
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex gap-4">
                      <DocumentCover
                        documentId={doc.id}
                        title={doc.title}
                        format={doc.format}
                        progressPercent={progressPercent}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="space-y-2 flex-1 min-w-0">
                          {renamingId === doc.id ? (
                            <div className="flex items-center gap-2 max-w-md">
                              <label
                                htmlFor={`rename-input-${doc.id}`}
                                className="sr-only"
                              >
                                Novo título
                              </label>
                              <Input
                                id={`rename-input-${doc.id}`}
                                data-testid={`rename-input-${doc.id}`}
                                value={renameValue}
                                maxLength={80}
                                onChange={(e) => setRenameValue(e.target.value)}
                              />
                              <Button
                                size="icon"
                                variant="default"
                                aria-label="Confirmar novo título"
                                onClick={() => void handleSaveRename(doc.id)}
                                data-testid={`confirm-rename-${doc.id}`}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Cancelar renomeação"
                                onClick={() => setRenamingId(null)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <h2
                                className="line-clamp-2 break-words text-base font-semibold"
                                data-testid={`library-item-title-${doc.id}`}
                              >
                                {doc.title}
                              </h2>
                              <Badge variant="secondary">
                                {formatLabelForBadge(doc.format)}
                              </Badge>
                              {isCompleted && (
                                <Badge variant="default">Concluído</Badge>
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {doc.tokenCount.toLocaleString('pt-BR')} palavras
                            </span>
                            <span
                              data-testid={`library-item-progress-${doc.id}`}
                            >
                              Progresso: {progressPercent}% (
                              {currentTokenIdx.toLocaleString('pt-BR')} /{' '}
                              {doc.tokenCount.toLocaleString('pt-BR')})
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              Último acesso:{' '}
                              {formatDateTimePtBr(doc.lastOpenedAt)}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 [&>button:first-child]:flex-1 sm:[&>button:first-child]:flex-none">
                          <Button
                            onClick={() => void navigate(`/reader/${doc.id}`)}
                            data-testid={`open-reader-btn-${doc.id}`}
                          >
                            <BookOpen className="h-4 w-4" aria-hidden="true" />
                            {hasStarted
                              ? 'Continuar'
                              : isCompleted
                                ? 'Ler novamente'
                                : 'Ler em RSVP'}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={`Renomear ${doc.title}`}
                            onClick={() => handleStartRename(doc.id, doc.title)}
                            data-testid={`start-rename-btn-${doc.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={`Remover ${doc.title}`}
                            onClick={() => setDeletingId(doc.id)}
                            data-testid={`start-delete-btn-${doc.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      </div>

                      {/* Confirmação de remoção transacional */}
                      {deletingId === doc.id && (
                        <div
                          role="alertdialog"
                          aria-label="Confirmar remoção de documento"
                          className="mt-4 flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                        >
                          <p className="text-muted-foreground">
                            Remover{' '}
                            <strong className="text-foreground">
                              {doc.title}
                            </strong>
                            ? O texto original, snapshot e todo o histórico associado a este documento também serão apagados.
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeletingId(null)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => void handleConfirmDelete(doc.id)}
                              data-testid={`confirm-delete-btn-${doc.id}`}
                            >
                              Confirmar remoção
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>

          {items.length > visibleCount && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setVisibleCount((prev) => prev + LIBRARY_WINDOW_STEP)
                }
                data-testid="library-load-more-btn"
              >
                Mostrar mais documentos ({items.length - visibleCount}{' '}
                restantes)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
