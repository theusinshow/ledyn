import type {
  ContentBlock,
  DocumentFormat,
  ImportIssue,
} from '@/domain/contracts';

export const MAX_IMPORT_FILE_BYTES = 40 * 1024 * 1024; // 40 MiB (40 * 1024^2)
export const MAX_PDF_PAGES = 300;
export const MAX_EPUB_ENTRIES = 2_000;
export const MAX_EPUB_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MiB
export const IMPORT_TIMEOUT_MS = 60_000; // 60 s

export interface PreviewSection {
  id: string;
  label: string; // Ex.: "Página 1", "Capítulo 2: Introdução"
  paragraphs: string[];
  hasText: boolean;
}

export interface ImportProgressUpdate {
  stage: 'validating' | 'hashing' | 'extracting' | 'normalizing';
  message: string;
  currentStep?: number;
  totalSteps?: number;
}

export interface RawExtractionOutput {
  format: DocumentFormat;
  suggestedTitle: string;
  normalizedText: string;
  normalizationVersion: number;
  blocks: ContentBlock[];
  previewSections: PreviewSection[];
  warnings: ImportIssue[];
}

export interface ImporterLimitsConfig {
  maxFileBytes?: number;
  maxPdfPages?: number;
  maxUtf16Length?: number;
  maxTokens?: number;
  maxEpubEntries?: number;
  maxEpubUncompressedBytes?: number;
  timeoutMs?: number;
}
