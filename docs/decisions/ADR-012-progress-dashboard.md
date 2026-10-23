# ADR-012 — Painel de evolução no histórico

- **Data:** 2026-10-23
- **Status:** Implementado; validação técnica automatizada concluída; avaliação pelo usuário pendente.

## Contexto

O usuário aprovou um "painel de evolução" para acompanhar o hábito e a velocidade. AGENTS.md exige que PPM configurada, PPM observada, cobertura e compreensão continuem distintas, e proíbe inventar medida de capacidade ou de ganho.

## Decisão

- Agregação pura em `src/domain/reading/progressStats.ts`, a partir das sessões e tentativas de quiz já gravadas. Nada novo é persistido.
- O painel ("Sua evolução") fica no topo do Histórico (`ProgressDashboard.tsx`) e não aparece enquanto não houver tempo de leitura registrado.
  - **Blocos de números:** tempo lendo nos últimos 7 dias (com variação contra os 7 anteriores), dias seguidos com leitura, palavras apresentadas em 7 dias (mais documentos concluídos) e PPM observada do período (com a média de acerto nos treinos quando existir). O texto do bloco diz que a PPM observada inclui pausas e não mede compreensão.
  - **Colunas:** minutos por dia nos últimos 14 dias; cada sessão conta no dia em que começou.
  - **Linha:** PPM observada das últimas 20 sessões com pelo menos 30 s. Sessões curtas dão uma PPM instável e ficam de fora; com menos de duas sessões, o painel pede mais leitura em vez de desenhar um ponto solto.
- **A PPM configurada não aparece no gráfico:** a sessão só guarda as mudanças de velocidade, não a velocidade inicial. Mostrá-la exigiria adivinhar.
- **Visualização** (skill dataviz): série única no acento (`#5e6ad2` no tema claro, `#7c84e8` no escuro, aprovado pelo validador de paleta nos dois temas), sem legenda, grade fina e discreta, barras de até 24 px com topo arredondado, linha de 2 px com marcadores de 8 px e anel da cor da superfície, rótulo só no pico e no ponto final, tooltip ao passar o mouse e ao focar, e "Ver como tabela" em cada gráfico.

## Verificação

- Unitários: `tests/unit/progressStats.test.ts` (dias locais, comparação de períodos, dias seguidos, série de velocidade, documentos concluídos, média dos treinos e estado vazio).
- E2E: `tests/e2e/progress-dashboard.spec.ts`. Lê de verdade por alguns segundos e confere o painel; não injeta dados.
- O visual com várias semanas de dados foi revisado em capturas com sessões sintéticas injetadas só no navegador de teste.
