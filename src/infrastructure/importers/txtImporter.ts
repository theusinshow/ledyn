import {
  generateTitleFromText,
  normalizeText,
} from '@/domain/documents/normalizer';
import type {
  ImporterLimitsConfig,
  ImportProgressUpdate,
  PreviewSection,
  RawExtractionOutput,
} from '@/infrastructure/importers/types';
import { MAX_IMPORT_FILE_BYTES } from '@/infrastructure/importers/types';
import { AppError } from '@/shared/errors';

function stripTxtExtension(fileName: string): string {
  return fileName.replace(/\.txt$/i, '').replace(/\s+/g, ' ').trim();
}

function hasBinarySignatureOrNullBytes(bytes: Uint8Array): boolean {
  // Assinatura PDF (%PDF-)
  if (
    bytes.byteLength >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return true;
  }
  // Assinatura ZIP/EPUB (PK\x03\x04)
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return true;
  }
  // Verifica presença de byte nulo nos primeiros 8 KiB
  const checkLen = Math.min(bytes.byteLength, 8192);
  for (let i = 0; i < checkLen; i++) {
    if (bytes[i] === 0x00) {
      return true;
    }
  }
  return false;
}

/**
 * Importador de arquivos .txt UTF-8 (com ou sem BOM).
 * Rejeita sequências de bytes UTF-8 inválidas com `INVALID_ENCODING` em vez de substituir acentos.
 */
export function extractTxtFile(
  fileBytes: Uint8Array,
  fileName: string,
  options?: {
    explicitTitle?: string;
    signal?: AbortSignal;
    limits?: ImporterLimitsConfig;
    onProgress?: (update: ImportProgressUpdate) => void;
  },
): RawExtractionOutput {
  if (options?.signal?.aborted) {
    throw new AppError('IMPORT_CANCELLED');
  }

  const maxBytes = options?.limits?.maxFileBytes ?? MAX_IMPORT_FILE_BYTES;
  if (fileBytes.byteLength > maxBytes) {
    throw new AppError(
      'FILE_TOO_LARGE',
      `O arquivo excede o limite de ${(maxBytes / (1024 * 1024)).toFixed(0)} MiB desta versão. Reduza/divida o arquivo ou cole um trecho menor.`,
    );
  }

  if (fileBytes.byteLength === 0) {
    throw new AppError(
      'EMPTY_TEXT',
      'O arquivo .txt está vazio. Escolha um arquivo com texto legível.',
    );
  }

  if (hasBinarySignatureOrNullBytes(fileBytes)) {
    throw new AppError(
      'INVALID_ENCODING',
      'O arquivo selecionado não é um texto UTF-8 válido (foram detectados bytes binários).',
    );
  }

  options?.onProgress?.({
    stage: 'extracting',
    message: 'Decodificando texto UTF-8...',
  });

  // Remover BOM UTF-8 (EF BB BF) se presente; TextDecoder com fatal: true rejeita bytes inválidos
  let sliceBytes = fileBytes;
  if (
    fileBytes.byteLength >= 3 &&
    fileBytes[0] === 0xef &&
    fileBytes[1] === 0xbb &&
    fileBytes[2] === 0xbf
  ) {
    sliceBytes = fileBytes.subarray(3);
  }

  let decodedText: string;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decodedText = decoder.decode(sliceBytes);
  } catch (error) {
    throw new AppError(
      'INVALID_ENCODING',
      'O arquivo .txt possui codificação inválida. Salve o arquivo em UTF-8 para preservar acentos corretamente.',
      { cause: error },
    );
  }

  if (options?.signal?.aborted) {
    throw new AppError('IMPORT_CANCELLED');
  }

  if (decodedText.trim().length === 0) {
    throw new AppError(
      'EMPTY_TEXT',
      'O arquivo .txt contém apenas espaços em branco.',
    );
  }

  const normalization = normalizeText(decodedText, {
    maxUtf16Length: options?.limits?.maxUtf16Length,
  });

  if (normalization.blocks.length === 0) {
    throw new AppError(
      'EMPTY_TEXT',
      'O arquivo .txt não contém palavras legíveis.',
    );
  }

  const fallbackTitle = stripTxtExtension(fileName);
  const suggestedTitle = generateTitleFromText(
    normalization.normalizedText,
    options?.explicitTitle?.trim() ? options.explicitTitle : fallbackTitle,
  );

  const paragraphs = normalization.blocks.map((b) =>
    normalization.normalizedText.slice(b.startOffset, b.endOffset),
  );

  const previewSections: PreviewSection[] = [
    {
      id: 'txt-main',
      label: 'Texto completo',
      paragraphs,
      hasText: paragraphs.length > 0,
    },
  ];

  return {
    format: 'txt',
    suggestedTitle,
    normalizedText: normalization.normalizedText,
    normalizationVersion: normalization.normalizationVersion,
    blocks: normalization.blocks,
    previewSections,
    warnings: normalization.warnings,
  };
}
