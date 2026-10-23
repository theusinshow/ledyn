# ADR-009 — Ritmo inteligente e letra de foco fixa no RSVP

- **Data:** 2026-10-23
- **Status:** Implementado; validação técnica automatizada concluída; avaliação de conforto pelo usuário pendente.

## Contexto

O usuário relatou que "se perde" nas vírgulas e nos parágrafos e pediu uma revisão de como o RSVP deve funcionar. A análise encontrou cinco problemas no comportamento anterior:

1. A palavra era centralizada inteira, então a letra destacada mudava de posição a cada palavra.
2. As pausas eram só multiplicadores, por isso encolhiam em velocidades altas: o fim de frase a 500 PPM durava 240 ms.
3. Nada sinalizava a troca de parágrafo.
4. Palavras longas e números recebiam o mesmo tempo de "a" e "de".
5. Retomar voltava exatamente na palavra, sem contexto e já em velocidade cheia.

## Evidências consultadas

- Rayner, Schotter, Masson, Potter & Treiman (2016), *Psychological Science in the Public Interest*, DOI 10.1177/1529100615623267. O gargalo é a compreensão, não o movimento dos olhos. Sem a possibilidade de reler, a compreensão piora. **Nenhuma mudança aqui elimina esse limite.**
- O'Regan & Jacobs (1992) e trabalhos sobre a posição ótima de visualização: o reconhecimento é mais rápido com a fixação um pouco à esquerda do centro da palavra.
- Spritz (patente US 11644944) e leitores abertos como o `mdr`: a letra de foco fica numa coluna fixa. O `mdr` usa vírgula 1,4×, frase 2×, parágrafo 2,5× e palavras longas 1,15–1,3×.
- Masson (1983), citado em Williamson: com pausa de 500 ms no fim da frase, o RSVP igualou a compreensão da página; sem a pausa, a página foi melhor.
- Castelhano & Muter (2001): pausas na pontuação aumentaram a preferência dos usuários.
- Ricciardi et al. (2020): compreensão prejudicada no Spritz acima de ~250 PPM, mesmo em texto curto.

## Decisão

- `calculateTokenDurationMs(token, wpm, smartPacing, rampFactor)`:
  - desligado: `60.000 / PPM`, exato (AC-06 preservado);
  - ligado: `base × fatorComprimento × fatorRampa + max(base × (mult − 1), mínimo)`, arredondado a 1 µs.
- Pausas mínimas: vírgula/;/: 150 ms, frase 500 ms, parágrafo 750 ms.
- Fator de comprimento: 1,15 para 8–11 letras; 1,3 para 12+ letras ou presença de dígitos.
- Rampa ao iniciar: 1,6 / 1,4 / 1,2 / 1,1 nas quatro primeiras palavras.
- Retomada no início da frase (recuo máximo de 25 palavras) só após pausa da sessão. Seek e recarga continuam no token exato (AC-15). O snapshot expõe `resumeRewindTokens`, e a interface mostra um aviso discreto.
- Letra de foco (`src/domain/reading/focalPoint.ts`): tabela por comprimento, ignorando pontuação inicial e final. A interface usa uma grade `1fr auto 1fr` para travar a letra no centro, entre os marcadores.
- Sinal "¶ Novo parágrafo" na primeira palavra de cada parágrafo.
- Rótulo do controle: "Ritmo inteligente". Os test IDs e a preferência persistida (`punctuationPauseEnabled`) não mudaram, então não há migração.

## Consequências

- A PPM observada fica abaixo da configurada, mais do que antes. A interface já mostra as duas separadas (AC-18).
- Os valores são heurísticas sustentadas pela literatura, não calibradas para o usuário. Ajustes finos dependem do uso real.

## Verificação

- Unitários: `tests/unit/pacing.test.ts`, `tests/unit/focalPoint.test.ts` e `tests/unit/tokenizer.test.ts` (atualizado).
- E2E: `tests/e2e/rsvp-precision.spec.ts`. Mede no navegador a posição da letra de foco: variação menor que 12 px entre palavras de 1 a 19 letras. Também cobre o sinal de parágrafo e a retomada no início da frase.
