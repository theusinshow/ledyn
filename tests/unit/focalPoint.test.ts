import { describe, expect, it } from 'vitest';
import { splitWordFocalParts } from '@/domain/reading/focalPoint';

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
});
