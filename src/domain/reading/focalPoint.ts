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
