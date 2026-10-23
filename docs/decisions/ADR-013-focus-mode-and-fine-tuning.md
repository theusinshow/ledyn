# ADR-013 — Modo foco, trilha de contexto e ajuste fino do ritmo

- **Data:** 2026-10-23
- **Status:** Implementado; validação técnica automatizada concluída; avaliação de conforto pelo usuário pendente.

## Decisão

- **Modo foco** (`FocusModeOverlay.tsx`): só no RSVP, aberto pelo botão "Foco" ou pela tecla F. Ocupa a tela inteira por cima do leitor e tenta usar a Fullscreen API; se o navegador sair da tela cheia, o modo foco fecha. Os controles (frase, iniciar/pausar, sair) somem depois de 2 s sem mexer o mouse enquanto a leitura toca, e voltam com qualquer movimento, toque ou tecla. Esc pausa se estiver tocando; com a leitura pausada, sai do modo foco. O palco foi extraído para `RsvpStage.tsx` e é o mesmo nos dois modos, então a letra de foco continua fixa.
- **Trilha de contexto** (`domain/reading/contextTrail.ts`): enquanto toca, mostra apagado abaixo da palavra a frase anterior e o começo da frase atual, até a palavra exibida, com o fim sempre visível. Percorre no máximo 200 tokens para trás, então o custo por palavra é constante mesmo em livros de 500 mil tokens (teste de desempenho incluído). É opcional (preferência `showContextTrail`).
- **Ajuste fino do ritmo** (Configurações → `PacingFineTuning.tsx`): pausas mínimas por vírgula (0–600 ms), frase (0–1.500 ms) e parágrafo (0–2.500 ms), mais a opção de voltar ao início da frase ao retomar. A pausa continua sendo a maior entre o mínimo e o multiplicador da pontuação (ADR-009); a interface explica isso. O motor recebe as mudanças com `setPacing`, que valem a partir da próxima palavra, sem reiniciar a leitura.
- Novas preferências (`pauseClauseMs`, `pauseSentenceMs`, `pauseParagraphMs`, `resumeRewindEnabled`, `showContextTrail`) validadas por Zod e incluídas no esquema do backup. Não há migração: são apenas novos valores na tabela `settings`.

## Verificação

- Unitários: `tests/unit/contextTrail.test.ts` (trilha, recorte e desempenho; pausas personalizadas; volta ao início da frase desligável).
- E2E: `tests/e2e/focus-and-pacing.spec.ts` (abrir e fechar o modo foco pelo botão, pela tecla F e pelo Esc; controles que somem; trilha visível; ajustes persistidos, aplicados ao leitor e restaurados ao padrão).
