import type { DocumentFormat, DocumentRecord } from '@/domain/contracts';
import { tokenizeNormalizedText } from '@/domain/documents/tokenizer';
import { db, type LedynDatabase } from '@/infrastructure/db/database';
import type { PreparedDocumentDraft } from '@/infrastructure/db/repositories';
import { extractEpubFile } from '@/infrastructure/importers/epubImporter';
import { extractPdfFile } from '@/infrastructure/importers/pdfImporter';
import { extractTxtFile } from '@/infrastructure/importers/txtImporter';
import {
  IMPORT_TIMEOUT_MS,
  MAX_IMPORT_FILE_BYTES,
  type ImporterLimitsConfig,
  type ImportProgressUpdate,
  type RawExtractionOutput,
} from '@/infrastructure/importers/types';
import { AppError, toAppError } from '@/shared/errors';
import { computeSha256Hex, createId } from '@/shared/utils';

const cancelledJobIds = new Set<string>();
const activeJobControllers = new Map<string, AbortController>();

export function isImportJobCancelled(jobId?: string): boolean {
  if (!jobId) return false;
  return cancelledJobIds.has(jobId);
}

export function cancelImportJob(jobId: string): void {
  cancelledJobIds.add(jobId);
  const controller = activeJobControllers.get(jobId);
  if (controller) {
    controller.abort();
    activeJobControllers.delete(jobId);
  }
}

export function createImportJob(): {
  jobId: string;
  signal: AbortSignal;
  cancel: () => void;
} {
  const jobId = createId();
  const controller = new AbortController();
  activeJobControllers.set(jobId, controller);

  return {
    jobId,
    signal: controller.signal,
    cancel: () => cancelImportJob(jobId),
  };
}

export function detectSupportedFormat(
  fileName: string,
  mimeType?: string,
): DocumentFormat {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.epub')) return 'epub';

  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'text/plain') return 'txt';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/epub+zip') return 'epub';

  throw new AppError(
    'UNSUPPORTED_FORMAT',
    'Formato de arquivo não suportado nesta versão. Selecione um arquivo .txt, .pdf ou .epub.',
  );
}

function defaultMimeForFormat(format: DocumentFormat): string {
  switch (format) {
    case 'pdf':
      return 'application/pdf';
    case 'epub':
      return 'application/epub+zip';
    default:
      return 'text/plain;charset=utf-8';
  }
}

export interface PrepareFileImportParams {
  fileName: string;
  mimeType?: string;
  declaredByteSize?: number;
  readBytes: () => Promise<Uint8Array> | Uint8Array;
  explicitTitle?: string;
  jobId?: string;
  signal?: AbortSignal;
  limits?: ImporterLimitsConfig;
  onProgress?: (update: ImportProgressUpdate) => void;
  database?: LedynDatabase;
}

/**
 * Pipeline completo de importação de arquivo (.txt, .pdf, .epub) com:
 * 1. Validação superficial de formato e tamanho declarado antes da leitura completa
 * 2. Controle de `jobId`, `AbortSignal` e timeout
 * 3. Hash SHA-256 local do original e detecção de duplicata
 * 4. Extração com limites aplicados durante o processamento
 * 5. Normalização, tokenização versionada e geração da prévia
 */
export async function prepareFileImportDraft(
  params: PrepareFileImportParams,
): Promise<PreparedDocumentDraft> {
  const database = params.database ?? db;
  const jobId = params.jobId ?? createId();
  const maxFileBytes = params.limits?.maxFileBytes ?? MAX_IMPORT_FILE_BYTES;
  const timeoutMs = params.limits?.timeoutMs ?? IMPORT_TIMEOUT_MS;

  const internalController = new AbortController();
  activeJobControllers.set(jobId, internalController);

  let timedOut = false;
  const timeoutHandle = globalThis.setTimeout(() => {
    timedOut = true;
    internalController.abort();
  }, timeoutMs);

  const onExternalAbort = () => {
    cancelImportJob(jobId);
  };
  params.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const checkAborted = () => {
    if (timedOut) {
      throw new AppError(
        'IMPORT_TIMEOUT',
        'A preparação demorou além do limite e foi interrompida.',
      );
    }
    if (
      cancelledJobIds.has(jobId) ||
      params.signal?.aborted ||
      internalController.signal.aborted
    ) {
      throw new AppError(
        'IMPORT_CANCELLED',
        'A preparação foi cancelada.',
      );
    }
  };

  try {
    checkAborted();

    params.onProgress?.({
      stage: 'validating',
      message: 'Verificando arquivo',
    });

    const format = detectSupportedFormat(params.fileName, params.mimeType);

    if (
      params.declaredByteSize !== undefined &&
      params.declaredByteSize > maxFileBytes
    ) {
      throw new AppError(
        'FILE_TOO_LARGE',
        `O arquivo excede o limite de ${(maxFileBytes / (1024 * 1024)).toFixed(0)} MiB desta versão. Reduza/divida o arquivo ou cole um trecho menor.`,
      );
    }

    const fileBytes = await params.readBytes();
    checkAborted();

    if (fileBytes.byteLength > maxFileBytes) {
      throw new AppError(
        'FILE_TOO_LARGE',
        `O arquivo excede o limite de ${(maxFileBytes / (1024 * 1024)).toFixed(0)} MiB desta versão. Reduza/divida o arquivo ou cole um trecho menor.`,
      );
    }

    params.onProgress?.({
      stage: 'hashing',
      message: 'Verificando integridade e duplicidade',
    });

    const sourceHash = await computeSha256Hex(fileBytes);
    checkAborted();

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

    let extracted: RawExtractionOutput;
    if (format === 'txt') {
      extracted = extractTxtFile(fileBytes, params.fileName, {
        explicitTitle: params.explicitTitle,
        signal: internalController.signal,
        limits: params.limits,
        onProgress: params.onProgress,
      });
    } else if (format === 'pdf') {
      extracted = await extractPdfFile(fileBytes, params.fileName, {
        explicitTitle: params.explicitTitle,
        signal: internalController.signal,
        limits: params.limits,
        onProgress: params.onProgress,
      });
    } else {
      extracted = extractEpubFile(fileBytes, params.fileName, {
        explicitTitle: params.explicitTitle,
        signal: internalController.signal,
        limits: params.limits,
        onProgress: params.onProgress,
      });
    }

    checkAborted();

    params.onProgress?.({
      stage: 'normalizing',
      message: 'Tokenizando texto extraído...',
    });

    const tokenization = tokenizeNormalizedText(
      extracted.normalizedText,
      extracted.blocks,
      { maxTokens: params.limits?.maxTokens },
    );

    const contentHash = await computeSha256Hex(extracted.normalizedText);
    checkAborted();

    return {
      draftId: createId(),
      jobId,
      title: extracted.suggestedTitle,
      format: extracted.format,
      originalBytes: fileBytes,
      originalName: params.fileName,
      mime: params.mimeType || defaultMimeForFormat(extracted.format),
      byteSize: fileBytes.byteLength,
      sourceHash,
      normalizationVersion: extracted.normalizationVersion,
      tokenizerVersion: tokenization.tokenizerVersion,
      normalizedText: extracted.normalizedText,
      contentHash,
      blocks: extracted.blocks,
      tokens: tokenization.tokens,
      previewSections: extracted.previewSections,
      warnings: extracted.warnings,
      duplicateDocument,
    };
  } catch (error) {
    if (timedOut) {
      throw new AppError(
        'IMPORT_TIMEOUT',
        'A preparação demorou além do limite e foi interrompida.',
      );
    }
    if (
      cancelledJobIds.has(jobId) ||
      params.signal?.aborted ||
      internalController.signal.aborted
    ) {
      throw new AppError('IMPORT_CANCELLED', 'A preparação foi cancelada.');
    }
    throw toAppError(error, 'CORRUPT_FILE');
  } finally {
    globalThis.clearTimeout(timeoutHandle);
    params.signal?.removeEventListener('abort', onExternalAbort);
    activeJobControllers.delete(jobId);
  }
}
