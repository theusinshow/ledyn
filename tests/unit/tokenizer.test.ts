import { describe, expect, it } from 'vitest';
import { normalizeText } from '@/domain/documents/normalizer';
import {
  classifyTokenBoundary,
  isAbbreviationToken,
  tokenizeNormalizedText,
} from '@/domain/documents/tokenizer';
import { calculateTokenDurationMs } from '@/domain/reading/metrics';
import { AppError } from '@/shared/errors';
import { computeSha256Hex } from '@/shared/utils';
import { FX_01_TEXT, FX_02_TEXT } from '../fixtures/corpus';

describe('Normalização e Tokenização Versionada (FX-01 / FX-02 / AC-01 / AC-10)', () => {
  it('produz exatamente 100 tokens sem pontuação para FX-01 com checksum estável', async () => {
    const norm = normalizeText(FX_01_TEXT);
    const tok = tokenizeNormalizedText(norm.normalizedText, norm.blocks);

    expect(norm.normalizationVersion).toBe(1);
    expect(tok.tokenizerVersion).toBe(1);
    expect(norm.blocks).toHaveLength(1);
    expect(tok.tokens).toHaveLength(100);

    for (let i = 0; i < tok.tokens.length; i++) {
      const t = tok.tokens[i]!;
      expect(t.index).toBe(i);
      expect(t.boundary).toBe('none');
      expect(norm.normalizedText.slice(t.start, t.end)).toBe(t.text);
    }

    const hash = await computeSha256Hex(norm.normalizedText);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('normaliza NFD para NFC antes de calcular offsets UTF-16 e preserva fatias exatas em FX-02', () => {
    const norm = normalizeText(FX_02_TEXT);
    const tok = tokenizeNormalizedText(norm.normalizedText, norm.blocks);

    expect(norm.blocks).toHaveLength(3);
    expect(norm.normalizedText).toContain('auto-observação');
    expect(norm.normalizedText).toContain('atenção');
    expect(norm.normalizedText).toContain('compreensão');

    for (const token of tok.tokens) {
      expect(token.text.length).toBeGreaterThan(0);
      expect(norm.normalizedText.slice(token.start, token.end)).toBe(token.text);
    }

    // Emoji isolado 🚀 não deve gerar um token próprio sem letras/números
    const emojiOnlyToken = tok.tokens.find((t) => t.text === '🚀');
    expect(emojiOnlyToken).toBeUndefined();

    // Palavra longa preservada sem corte
    const longToken = tok.tokens.find((t) =>
      t.text.includes('anticonstitucionalissimamente'),
    );
    expect(longToken).toBeDefined();
  });

  it('trata abreviações e números decimais de forma conservadora sem criar fim de frase falso (AC-10)', () => {
    expect(isAbbreviationToken('Dr.')).toBe(true);
    expect(isAbbreviationToken('Sra.')).toBe(true);
    expect(isAbbreviationToken('Prof.')).toBe(true);
    expect(isAbbreviationToken('etc.')).toBe(true);
    expect(isAbbreviationToken('E.U.A.')).toBe(true);
    expect(isAbbreviationToken('palavra.')).toBe(false);

    const norm = normalizeText(FX_02_TEXT);
    const { tokens } = tokenizeNormalizedText(norm.normalizedText, norm.blocks);

    const drToken = tokens.find((t) => t.text === 'Dr.');
    const sraToken = tokens.find((t) => t.text === 'Sra.');
    const euaToken = tokens.find((t) => t.text === 'E.U.A.');
    const decimalToken = tokens.find((t) => t.text === '3,14');
    const currencyDecimalClause = tokens.find((t) => t.text === '1.250,50;');

    expect(drToken?.boundary).toBe('none');
    expect(sraToken?.boundary).toBe('none');
    expect(euaToken?.boundary).toBe('none');
    expect(decimalToken?.boundary).toBe('none');
    expect(currencyDecimalClause?.boundary).toBe('clause');
  });

  it('aplica multiplicadores corretos (1.5 clause, 2.0 sentence, 2.5 paragraph) prevalecendo o maior (AC-10)', () => {
    // Em parágrafo múltiplo, o último token do parágrafo recebe 'paragraph' mesmo terminando com '.' ou '!'
    expect(classifyTokenBoundary('constante.', true)).toBe('paragraph');
    expect(classifyTokenBoundary('constante.', false)).toBe('sentence');
    expect(classifyTokenBoundary('etapa?”', false)).toBe('sentence');
    expect(classifyTokenBoundary('portanto:', false)).toBe('clause');
    expect(classifyTokenBoundary('segundos,', false)).toBe('clause');
    expect(classifyTokenBoundary('leitura', false)).toBe('none');

    // A 300 PPM, duração-base é 200 ms
    expect(calculateTokenDurationMs('none', 300, true)).toBe(200);
    expect(calculateTokenDurationMs('clause', 300, true)).toBe(300); // 1.5x
    expect(calculateTokenDurationMs('sentence', 300, true)).toBe(400); // 2.0x
    expect(calculateTokenDurationMs('paragraph', 300, true)).toBe(500); // 2.5x

    // Quando pontuação está desligada, todos usam fator 1.0 (200 ms)
    expect(calculateTokenDurationMs('clause', 300, false)).toBe(200);
    expect(calculateTokenDurationMs('sentence', 300, false)).toBe(200);
    expect(calculateTokenDurationMs('paragraph', 300, false)).toBe(200);
  });

  it('rejeita texto vazio, apenas espaços ou apenas símbolos sem letras/números', () => {
    const emptyNorm = normalizeText('   \n\n  \t  ');
    expect(() =>
      tokenizeNormalizedText(emptyNorm.normalizedText, emptyNorm.blocks),
    ).toThrowError(AppError);

    const symbolsOnlyNorm = normalizeText('🚀 *** ---');
    expect(() =>
      tokenizeNormalizedText(
        symbolsOnlyNorm.normalizedText,
        symbolsOnlyNorm.blocks,
      ),
    ).toThrowError(AppError);
  });

  it('respeita os limites configuráveis de UTF-16 e contagem de tokens', () => {
    expect(() =>
      normalizeText('Texto maior que dez caracteres', { maxUtf16Length: 10 }),
    ).toThrowError(AppError);

    const norm = normalizeText('um dois três quatro cinco');
    expect(() =>
      tokenizeNormalizedText(norm.normalizedText, norm.blocks, { maxTokens: 3 }),
    ).toThrowError(AppError);
  });
});
