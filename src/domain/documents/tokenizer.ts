import type { ContentBlock, Token, TokenBoundary, TokenChunkRecord } from '@/domain/contracts';
import { AppError } from '@/shared/errors';

export const TOKENIZER_VERSION = 1;
export const MAX_TOKEN_COUNT = 500_000;
export const TOKEN_CHUNK_SIZE = 2_000;

/**
 * Conjunto conservador e versionado de abreviações em pt-BR e internacionais
 * cujo ponto final não deve disparar pausa de fim de frase.
 */
const KNOWN_ABBREVIATIONS = new Set([
  'sr.',
  'sra.',
  'srta.',
  'dr.',
  'dra.',
  'prof.',
  'profa.',
  'eng.',
  'adv.',
  'pe.',
  'st.',
  'sto.',
  'sta.',
  'etc.',
  'ex.',
  'p.ex.',
  'i.e.',
  'e.g.',
  'art.',
  'arts.',
  'inc.',
  'ltda.',
  's.a.',
  'cia.',
  'cap.',
  'caps.',
  'fig.',
  'figs.',
  'pág.',
  'págs.',
  'pag.',
  'pags.',
  'p.',
  'pp.',
  'vol.',
  'vols.',
  'ed.',
  'n.',
  'nº.',
  'no.',
  'av.',
  'r.',
  'tel.',
  'obs.',
  'ref.',
  'refs.',
  'aprox.',
  'máx.',
  'mín.',
  'max.',
  'min.',
  'seg.',
  'ter.',
  'qua.',
  'qui.',
  'sex.',
  'sáb.',
  'dom.',
  'jan.',
  'fev.',
  'mar.',
  'abr.',
  'mai.',
  'jun.',
  'jul.',
  'ago.',
  'set.',
  'out.',
  'nov.',
  'dez.',
]);

const HAS_ALPHANUMERIC_RE = /[\p{L}\p{N}]/u;
const HAS_PUNCTUATION_RE = /\p{P}/u;
const TRAILING_CLOSERS_RE = /['"”’»)\]}]+$/u;
const LEADING_OPENERS_RE = /^['"“‘«({[—–-]+/u;
const MULTI_INITIAL_ABBR_RE = /^(?:\p{L}\.)+$/u;

export function isAbbreviationToken(tokenText: string): boolean {
  const cleaned = tokenText
    .trim()
    .replace(LEADING_OPENERS_RE, '')
    .replace(TRAILING_CLOSERS_RE, '')
    .toLowerCase();

  if (!cleaned.endsWith('.')) {
    return false;
  }
  if (KNOWN_ABBREVIATIONS.has(cleaned)) {
    return true;
  }
  if (MULTI_INITIAL_ABBR_RE.test(cleaned)) {
    return true;
  }
  return false;
}

/**
 * Classifica a fronteira de pausa de um token segundo RF-03:
 * - paragraph (2.5x) > sentence (2.0x) > clause (1.5x) > none (1.0x)
 * - Prevalece sempre o maior multiplicador.
 */
export function classifyTokenBoundary(
  tokenText: string,
  isParagraphEnd: boolean,
): TokenBoundary {
  if (isParagraphEnd) {
    return 'paragraph';
  }

  // Remove aspas/parênteses de fechamento para inspecionar a pontuação final real
  const stripped = tokenText.trim().replace(TRAILING_CLOSERS_RE, '');
  if (stripped.length === 0) {
    return 'none';
  }

  // Fim de frase: '.', '!', '?', '…' ou '...'
  if (
    stripped.endsWith('!') ||
    stripped.endsWith('?') ||
    stripped.endsWith('…') ||
    stripped.endsWith('...')
  ) {
    return 'sentence';
  }

  if (stripped.endsWith('.')) {
    if (isAbbreviationToken(stripped)) {
      return 'none';
    }
    return 'sentence';
  }

  // Cláusula: ',', ';', ':', '—', '–'
  if (
    stripped.endsWith(',') ||
    stripped.endsWith(';') ||
    stripped.endsWith(':') ||
    stripped.endsWith('—') ||
    stripped.endsWith('–')
  ) {
    return 'clause';
  }

  return 'none';
}

interface RawSegment {
  text: string;
  start: number;
  end: number;
  hasWordChar: boolean;
  hasPunctuation: boolean;
}

function extractBlockRawSegments(
  normalizedText: string,
  blockStart: number,
  blockEnd: number,
): RawSegment[] {
  const segments: RawSegment[] = [];
  let i = blockStart;

  while (i < blockEnd) {
    while (i < blockEnd && /\s/.test(normalizedText[i]!)) {
      i++;
    }
    if (i >= blockEnd) {
      break;
    }
    const segStart = i;
    while (i < blockEnd && !/\s/.test(normalizedText[i]!)) {
      i++;
    }
    const segEnd = i;
    const text = normalizedText.slice(segStart, segEnd);
    segments.push({
      text,
      start: segStart,
      end: segEnd,
      hasWordChar: HAS_ALPHANUMERIC_RE.test(text),
      hasPunctuation: HAS_PUNCTUATION_RE.test(text),
    });
  }

  return segments;
}

export interface TokenizeOptions {
  maxTokens?: number;
}

export interface TokenizationResult {
  tokenizerVersion: number;
  tokens: Token[];
}

/**
 * Tokeniza o texto normalizado gerando offsets UTF-16 exatos.
 * Segmentos sem letras ou números (ex.: emojis isolados) não contam como palavras isoladas;
 * pontuação isolada (ex.: travessão ou ponto de exclamação separado por espaço) é associada ao token vizinho.
 */
export function tokenizeNormalizedText(
  normalizedText: string,
  blocks: ContentBlock[],
  options?: TokenizeOptions,
): TokenizationResult {
  const maxTokens = options?.maxTokens ?? MAX_TOKEN_COUNT;
  const tokens: Token[] = [];
  const hasMultipleBlocks = blocks.length > 1;

  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const block = blocks[bIdx]!;
    const rawSegments = extractBlockRawSegments(
      normalizedText,
      block.startOffset,
      block.endOffset,
    );

    // Associar pontuação isolada ao token alfanumérico vizinho e ignorar símbolos puros sem letras/números
    const mergedSpans: Array<{ start: number; end: number }> = [];
    let pendingLeadingStart: number | null = null;

    for (let sIdx = 0; sIdx < rawSegments.length; sIdx++) {
      const seg = rawSegments[sIdx]!;
      if (seg.hasWordChar) {
        const spanStart = pendingLeadingStart !== null ? pendingLeadingStart : seg.start;
        pendingLeadingStart = null;
        mergedSpans.push({ start: spanStart, end: seg.end });
      } else if (seg.hasPunctuation) {
        // Pontuação isolada: se for pontuação de abertura/travessão no início e ainda não houver palavra ou se anteceder uma palavra
        const isOpeningOrDash = /^[—–\-«"“‘([{]+$/u.test(seg.text);
        if ((mergedSpans.length === 0 || isOpeningOrDash) && sIdx + 1 < rawSegments.length && rawSegments[sIdx + 1]!.hasWordChar) {
          if (pendingLeadingStart === null) {
            pendingLeadingStart = seg.start;
          }
        } else if (mergedSpans.length > 0) {
          // Anexa à palavra anterior (ex: "mundo !" -> "mundo !")
          mergedSpans[mergedSpans.length - 1]!.end = seg.end;
        } else if (pendingLeadingStart === null) {
          pendingLeadingStart = seg.start;
        }
      }
      // Segmentos apenas de emoji/símbolo sem letras/números e sem pontuação são ignorados como palavras de contagem
    }

    for (let mIdx = 0; mIdx < mergedSpans.length; mIdx++) {
      const span = mergedSpans[mIdx]!;
      const text = normalizedText.slice(span.start, span.end);
      const isLastInBlock = mIdx === mergedSpans.length - 1;
      const isParagraphEnd = isLastInBlock && hasMultipleBlocks;
      const boundary = classifyTokenBoundary(text, isParagraphEnd);

      tokens.push({
        index: tokens.length,
        text,
        start: span.start,
        end: span.end,
        blockId: block.id,
        boundary,
      });

      if (tokens.length > maxTokens) {
        throw new AppError(
          'LIMIT_EXCEEDED',
          `O texto excede o limite de ${maxTokens.toLocaleString('pt-BR')} palavras/tokens desta versão. Importe um trecho menor.`,
        );
      }
    }
  }

  if (tokens.length === 0) {
    throw new AppError(
      'EMPTY_TEXT',
      'O texto não contém palavras legíveis para leitura.',
    );
  }

  return {
    tokenizerVersion: TOKENIZER_VERSION,
    tokens,
  };
}

export function chunkTokens(
  contentVersionId: string,
  tokens: Token[],
  chunkSize: number = TOKEN_CHUNK_SIZE,
): TokenChunkRecord[] {
  const chunks: TokenChunkRecord[] = [];
  for (let i = 0; i < tokens.length; i += chunkSize) {
    chunks.push({
      contentVersionId,
      chunkIndex: Math.floor(i / chunkSize),
      tokens: tokens.slice(i, i + chunkSize),
    });
  }
  return chunks;
}
