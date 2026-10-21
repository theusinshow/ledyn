import type { ContentBlock, ImportIssue } from '@/domain/contracts';
import { AppError } from '@/shared/errors';

export const NORMALIZATION_VERSION = 1;
export const MAX_NORMALIZED_UTF16_LENGTH = 1_000_000;

export interface NormalizationResult {
  normalizationVersion: number;
  normalizedText: string;
  blocks: ContentBlock[];
  warnings: ImportIssue[];
}

export interface NormalizeOptions {
  maxUtf16Length?: number;
}

/**
 * Normaliza texto bruto em Unicode NFC, remove caracteres de controle não imprimíveis,
 * preserva fronteiras de parágrafo e calcula offsets UTF-16 canônicos por bloco.
 */
export function normalizeText(
  rawText: string,
  options?: NormalizeOptions,
): NormalizationResult {
  const maxUtf16 = options?.maxUtf16Length ?? MAX_NORMALIZED_UTF16_LENGTH;
  const warnings: ImportIssue[] = [];

  // 1. Normalização Unicode NFC antes de calcular offsets UTF-16
  const nfcText = rawText.normalize('NFC');

  // 2. Normalizar quebras de linha e limpar caracteres de controle não imprimíveis
  // Mantemos \n como separador estrutural e convertemos tabs/nbsp em espaço simples.
  const cleanedChars: string[] = [];
  let hadControlChars = false;

  for (let i = 0; i < nfcText.length; i++) {
    const code = nfcText.charCodeAt(i);
    if (code === 0x0d) {
      // CR ou CRLF -> \n
      if (i + 1 < nfcText.length && nfcText.charCodeAt(i + 1) === 0x0a) {
        i++;
      }
      cleanedChars.push('\n');
    } else if (code === 0x0a) {
      cleanedChars.push('\n');
    } else if (code === 0x09 || code === 0x00a0) {
      cleanedChars.push(' ');
    } else if (
      (code >= 0x0000 && code <= 0x0008) ||
      code === 0x000b ||
      code === 0x000c ||
      (code >= 0x000e && code <= 0x001f) ||
      code === 0x007f
    ) {
      hadControlChars = true;
    } else {
      cleanedChars.push(nfcText[i]!);
    }
  }

  if (hadControlChars) {
    warnings.push({
      code: 'CONTROL_CHARS_REMOVED',
      severity: 'warning',
      message: 'Caracteres de controle não imprimíveis foram removidos durante a normalização.',
    });
  }

  const unifiedText = cleanedChars.join('');

  // 3. Separar parágrafos preservando offsets originais aproximados na string NFC unificada
  const rawLines = unifiedText.split('\n');
  const blocks: ContentBlock[] = [];
  const normalizedParagraphs: string[] = [];

  let currentOriginalPos = 0;
  let currentNormalizedPos = 0;

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const rawLine = rawLines[lineIdx]!;
    const lineStartOrig = currentOriginalPos;
    const lineEndOrig = lineStartOrig + rawLine.length;
    currentOriginalPos = lineEndOrig + 1; // +1 pelo '\n'

    // Colapsar espaços horizontais dentro do parágrafo
    const collapsed = rawLine.replace(/\s+/g, ' ').trim();
    if (collapsed.length === 0) {
      continue;
    }

    if (normalizedParagraphs.length > 0) {
      currentNormalizedPos += 2; // separado por '\n\n' no texto normalizado
    }

    const blockIndex = blocks.length;
    const startOffset = currentNormalizedPos;
    const endOffset = startOffset + collapsed.length;

    blocks.push({
      id: `block-${blockIndex}`,
      index: blockIndex,
      startOffset,
      endOffset,
      anchor: {
        kind: 'text',
        originalStart: lineStartOrig,
        originalEnd: lineEndOrig,
      },
    });

    normalizedParagraphs.push(collapsed);
    currentNormalizedPos = endOffset;
  }

  const normalizedText = normalizedParagraphs.join('\n\n');

  if (normalizedText.length > maxUtf16) {
    throw new AppError(
      'LIMIT_EXCEEDED',
      `O texto normalizado possui ${normalizedText.length.toLocaleString('pt-BR')} caracteres UTF-16, acima do limite de ${maxUtf16.toLocaleString('pt-BR')}. Importe um trecho menor.`,
    );
  }

  return {
    normalizationVersion: NORMALIZATION_VERSION,
    normalizedText,
    blocks,
    warnings,
  };
}

export function generateTitleFromText(normalizedText: string, explicitTitle?: string): string {
  const trimmedExplicit = explicitTitle?.replace(/\s+/g, ' ').trim() ?? '';
  if (trimmedExplicit.length > 0) {
    return trimmedExplicit.slice(0, 80);
  }

  const firstParagraph = normalizedText.split('\n\n')[0]?.trim() ?? '';
  if (firstParagraph.length === 0) {
    return 'Texto sem título';
  }
  if (firstParagraph.length <= 80) {
    return firstParagraph;
  }
  return `${firstParagraph.slice(0, 77).trimEnd()}...`;
}
