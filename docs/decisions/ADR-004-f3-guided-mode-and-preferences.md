# ADR-004 — Leitura Guiada Contextual, Janela de Blocos para Textos Longos e Diagnóstico de Preferências (F3)

- **Data:** 2026-10-22
- **Status:** Aceito (Ciclo F3)

## Contexto

A Fase F3 (`IMPLEMENTATION-PLAN.md` §6, `PRODUCT.md` RF-04/RF-05/RF-07/RF-08, `ARCHITECTURE.md` §6–7, `UX-FLOWS.md` Fluxos D/G e `ACCEPTANCE-TESTS.md` AC-12 a AC-18, AC-27, AC-29, AC-30) exige:

1. Modo de **Leitura Guiada** sobre o texto normalizado em contexto, compartilhando exatamente o mesmo motor (`ReadingEngine`) e o mesmo cursor canônico (`contentVersionId + tokenIndex`) do modo RSVP.
2. Alternância imediata `RSVP ↔ Guiada` pausando a leitura quando ativa, registrando `ModeSegment` real e preservando o token exato inclusive após recarga.
3. Rolagem automática controlada durante a reprodução (com salto discreto quando `reducedMotion` ou `prefers-reduced-motion: reduce` estiver ativo), pausa imediata ao detectar rolagem manual sem entrar em loop com a rolagem programática, botão **"Voltar ao ponto de leitura"** e reposicionamento pausado ao clicar em qualquer palavra sem inflar métricas de apresentação/cobertura.
4. Suporte a textos longos (`FX-12`) sem renderizar dezenas ou centenas de milhares de elementos `<span>` no DOM ao mesmo tempo, e listagem de biblioteca de 200 itens em menos de 2 segundos sem montar todos os cartões simultaneamente.
5. Persistência exclusiva de preferências no Dexie (`settings`), com fallback validado e aviso explícito caso algum valor salvo no banco esteja inválido (`AC-30`).

## Decisão

1. **Componente `GuidedReadingView` com Janela Deslizante de Blocos (`src/features/reader/GuidedReadingView.tsx`)**:
   - Calcula uma janela de parágrafos (`blocks`) ancorada no bloco do token ativo (ou no bloco navegado manualmente enquanto pausado), mantendo no máximo `MAX_GUIDED_DOM_TOKENS = 1.200` tokens montados simultaneamente no DOM.
   - Oferece controles acessíveis (`Parágrafos anteriores` / `Próximos parágrafos`) quando o documento excede a janela.
   - Destaca o token ativo com múltiplas pistas visuais e semânticas (`bg-primary text-primary-foreground font-bold underline decoration-2 ring-2`, `aria-current="step"`, `data-active="true"`).
2. **Distinção entre Rolagem Programática e Rolagem Manual (`AC-13`)**:
   - Antes de ajustar `scrollTop` programaticamente para manter o token ativo na faixa confortável do container, registra uma janela temporal (`programmaticScrollUntilRef`) e a coordenada alvo (`lastProgrammaticScrollTopRef`).
   - Interações manuais (`wheel`, `touchmove`, teclas de rolagem ou desvios de `scroll` fora da janela programática) pausam imediatamente o motor (`engine.pause('manual')`), gravam checkpoint e exibem o botão **"Voltar ao ponto de leitura"**.
3. **Preservação do Modo Ativo e Detalhamento no Histórico (`src/domain/contracts.ts`, `src/features/history/HistoryPage.tsx`)**:
   - `SessionRecord` armazena `currentMode` além de `modeSegments` e `settingsChanges`.
   - `HistoryPage` exibe os modos utilizados e permite expandir os segmentos de modo e alterações de ritmo de cada sessão.
4. **Diagnóstico e Fallback de Preferências (`src/infrastructure/db/repositories.ts`, `src/features/settings/SettingsPage.tsx`)**:
   - `loadUserPreferencesWithDiagnostics` valida cada chave armazenada na tabela `settings` com schemas Zod; chaves com valores fora da faixa segura recebem fallback padrão e geram `warningMessage` visível na interface (`AC-30`).

## Impacto

- Critérios `AC-12`, `AC-13`, `AC-14` e `AC-30` validados em suíte de integração (`tests/integration/f3-guided-and-preferences.test.tsx`) e E2E (`tests/e2e/f3-guided-and-settings.spec.ts`), atingindo o **Gate G3**.
