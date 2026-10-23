import { describe, expect, it } from 'vitest';
import {
  splitPhraseFocalParts,
  splitWordFocalParts,
} from '@/domain/reading/focalPoint';

describe('Letra de foco (ORP) do RSVP', () => {
  it('posiciona o pivô um pouco à esquerda do centro conforme o comprimento', () => {
    expect(splitWordFocalParts('a')).toEqual({ prefix: '', pivot: 'a', suffix: '' });
    expect(splitWordFocalParts('casa')).toEqual({ prefix: 'c', pivot: 'a', suffix: 'sa' });
    expect(splitWordFocalParts('leitura')).toEqual({ prefix: 'le', pivot: 'i', suffix: 'tura' });
    expect(splitWordFocalParts('compreensão')).toEqual({ prefix: 'com', pivot: 'p', suffix: 'reensão' });
    expect(splitWordFocalParts('extraordinariamente').pivot).toBe('a');
  });

  it('ignora pontuação inicial e final ao escolher o pivô e preserva o texto completo', () => {
    const quoted = splitWordFocalParts('“leitura,”');
    expect(quoted).toEqual({ prefix: '“le', pivot: 'i', suffix: 'tura,”' });
    expect(quoted.prefix + quoted.pivot + quoted.suffix).toBe('“leitura,”');
    expect(splitWordFocalParts('(casa).')).toEqual({ prefix: '(c', pivot: 'a', suffix: 'sa).' });
  });

  it('lida com token sem letras e com palavra vazia', () => {
    expect(splitWordFocalParts('—')).toEqual({ prefix: '', pivot: '—', suffix: '' });
    expect(splitWordFocalParts('')).toEqual({ prefix: '', pivot: '', suffix: '' });
  });

  it('em blocos de 2–3 palavras, fixa a letra perto de 35% do bloco e preserva o texto', () => {
    const parts = splitPhraseFocalParts('o leitor atento');
    expect(parts.prefix + parts.pivot + parts.suffix).toBe('o leitor atento');
    expect(parts.prefix.length).toBe(5); // índice round(14 × 0,35) = 5 → "t"
    expect(parts.pivot).toBe('t');
    // Se cair em espaço, ajusta para a letra mais próxima
    expect(splitPhraseFocalParts('ab cd').pivot).toMatch(/[a-z]/);
    // Uma palavra só usa a regra de palavra
    expect(splitPhraseFocalParts('leitura')).toEqual(splitWordFocalParts('leitura'));
  });
});
