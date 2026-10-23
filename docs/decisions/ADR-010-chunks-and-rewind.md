# ADR-010 — Blocos de 2–3 palavras e "voltar frase/parágrafo"

- **Data:** 2026-10-23
- **Status:** Implementado; validação técnica automatizada concluída; avaliação de uso pelo usuário pendente.

## Contexto

O usuário escolheu, entre as melhorias propostas, atacar primeiro o principal custo do RSVP: não poder reler (Rayner et al., 2016; ver ADR-009). Também pediu a opção de ler blocos curtos em vez de uma palavra por vez.

## Decisão

- **Voltar frase/parágrafo:** `ReadingEngine.rewind(unit)` usa `findRewindTarget`. Vai para o início da frase ou do parágrafo atual. Se o cursor estiver no começo da unidade, ou só uma palavra depois dele, vai para o início da anterior. Durante a reprodução, a leitura continua tocando, com rampa. Com a leitura pausada, equivale a um seek. Atalhos: R (frase) e Shift+R (parágrafo), mais botões ao lado de −10/+10.
- **Blocos:** preferência `rsvpChunkSize` (1–3, padrão 1) no Dexie, validada por Zod e incluída no esquema do backup. É um novo valor na tabela `settings`, sem mudança de índice e sem migração. `findChunkEndIndex` limita o bloco ao tamanho escolhido e o fecha na primeira palavra com pontuação. A duração do bloco é a soma das durações de cada palavra (`calculateChunkDurationMs`); só a última palavra carrega pausa de fronteira. Por isso a PPM configurada vale igual nos dois modos. As métricas contam cada palavra do bloco como apresentada, e a cobertura recebe o intervalo do bloco.
- **Letra de foco do bloco:** `splitPhraseFocalParts` fixa a letra em ~35% da largura do bloco, ajustada para a letra mais próxima. Para uma palavra só, vale a tabela por palavra.
- Na Leitura Guiada, o bloco inteiro fica destacado.

## Compatibilidade

Um backup gerado agora pode conter a chave `rsvpChunkSize`. Versões anteriores do app recusariam esse backup, porque a lista de chaves era fechada. Backups antigos restauram normalmente nesta versão.

## Verificação

- Unitários em `tests/unit/pacing.test.ts` (blocos, duração, alvo do recuo, motor em blocos, recuo durante a reprodução) e `tests/unit/focalPoint.test.ts`.
- E2E em `tests/e2e/rsvp-precision.spec.ts`: bloco de 3 palavras parando na vírgula, preferência persistida após recarregar, teclas R e Shift+R e botões.
