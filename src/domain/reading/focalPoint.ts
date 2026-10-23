/**
 * Ponto ótimo de reconhecimento (ORP) para RSVP.
 *
 * O reconhecimento é mais rápido com a fixação um pouco à esquerda do centro da palavra
 * (efeito da posição ótima de visualização, O'Regan & Jacobs, 1992). O leitor mantém essa
 * letra numa coluna fixa da tela para o olho não precisar se reposicionar a cada palavra.
 */
export type FocalParts = {
  prefix: string;
  pivot: string;
  suffix: string;
};

/** Índice do pivô dentro do núcleo da palavra, pelo comprimento (tabela estilo Spritz). */
export function pivotIndexForLength(coreLength: number): number {
  if (coreLength <= 1) return 0;
  if (coreLength <= 5) return 1;
  if (coreLength <= 9) return 2;
  if (coreLength <= 13) return 3;
  return 4;
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Divide a palavra em prefixo, pivô e sufixo. Pontuação inicial (aspas, parênteses,
 * travessões) é ignorada na contagem para o pivô cair sobre letras.
 */
export function splitWordFocalParts(word: string): FocalParts {
  const chars = Array.from(word);
  if (chars.length === 0) return { prefix: '', pivot: '', suffix: '' };

  const firstCore = chars.findIndex((c) => LETTER_OR_DIGIT.test(c));
  if (firstCore === -1) {
    return { prefix: '', pivot: chars[0]!, suffix: chars.slice(1).join('') };
  }
  let lastCore = chars.length - 1;
  while (lastCore > firstCore && !LETTER_OR_DIGIT.test(chars[lastCore]!)) {
    lastCore--;
  }
  const coreLength = lastCore - firstCore + 1;
  const pivotIndex = firstCore + pivotIndexForLength(coreLength);

  return {
    prefix: chars.slice(0, pivotIndex).join(''),
    pivot: chars[pivotIndex] ?? '',
    suffix: chars.slice(pivotIndex + 1).join(''),
  };
}

/**
 * Letra de foco de um bloco de 2–3 palavras: cerca de 35% da largura do bloco,
 * ajustada para a letra mais próxima. Para uma palavra só, usa a tabela por palavra.
 */
export function splitPhraseFocalParts(text: string): FocalParts {
  if (!/\s/.test(text.trim())) return splitWordFocalParts(text);
  const chars = Array.from(text);
  let pivotIndex = Math.round((chars.length - 1) * 0.35);
  for (let offset = 0; offset < chars.length; offset++) {
    const left = pivotIndex - offset;
    const right = pivotIndex + offset;
    if (left >= 0 && LETTER_OR_DIGIT.test(chars[left]!)) {
      pivotIndex = left;
      break;
    }
    if (right < chars.length && LETTER_OR_DIGIT.test(chars[right]!)) {
      pivotIndex = right;
      break;
    }
  }
  return {
    prefix: chars.slice(0, pivotIndex).join(''),
    pivot: chars[pivotIndex] ?? '',
    suffix: chars.slice(pivotIndex + 1).join(''),
  };
}
