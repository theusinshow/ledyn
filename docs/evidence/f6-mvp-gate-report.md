# Relatório de Evidências de Aceite — Gate G6 (MVP Web / PWA Local-First)

- **Data:** 2026-10-22
- **Fases cobertas:** F0, F1, F2, F3, F4, F5 e F6 (Gate G6 — MVP Web/PWA)
- **Ambiente de verificação automatizada:** Windows 10/11 x64 · Node.js `v24.14.0` · npm `11.9.0` · Google Chrome estável (Playwright `1.64.1`) + Vitest `5.0.5`

---

## 1. Resumo Executivo

As fases **F0 a F6** foram implementadas e verificadas tecnicamente contra a matriz de `ACCEPTANCE-TESTS.md`:
- **Comandos de Gate:**
  - `npm run lint` → **0 erros / 0 avisos**
  - `npm run typecheck` → **0 erros (`tsc -b --noEmit`)**
  - `npm run test:unit` → **9 suítes aprovadas (`42/42` testes unitários e de integração)**
  - `npm run test:e2e` → **6 suítes aprovadas (`15/15` testes E2E reais no Google Chrome sobre build de produção)**
  - `npm run build` → **Bundle de produção e Service Worker (`dist/sw.js`) gerados com sucesso**
- **Separação rigorosa de status:**
  - Todos os critérios técnicos automatizáveis (`AC-01` a `AC-34` em ambiente Web/Desktop e viewports móveis simulados `360x640`, `390x844`, `768x1024`, `1366x768`) foram **aprovados**.
  - A validação em **aparelhos físicos Android e iOS** (`AC-11` background/bloqueio de tela físico e `AC-32` instalação PWA em aparelho físico), a **revisão humana editorial** dos 3 conjuntos de treino (`AC-19`, mantidos com `reviewStatus: 'technical_verified_pending_human'`) e o **aceite pessoal de uso do usuário** (`AC-35`) permanecem **pendentes da avaliação direta do usuário**, conforme exigido por `AGENTS.md` e `ACCEPTANCE-TESTS.md`.

---

## 2. Matriz Completa de Critérios de Aceite (AC-01 a AC-35)

| ID | Critério | Prioridade | Status Técnico (Web/Chrome) | Status Físico / Humano | Evidência Automatizada |
| --- | --- | --- | --- | --- | --- |
| **AC-01** | Texto colado e gestão da biblioteca | P0 | **APROVADO** | Pendente aparelho físico | `tests/integration/persistence.test.ts`, `tests/e2e/f1-flow.spec.ts` |
| **AC-02** | Cancelamento na prévia e atomicidade de importação | P0 | **APROVADO** | N/A | `tests/integration/persistence.test.ts`, `tests/e2e/f1-flow.spec.ts` |
| **AC-03** | Importação de `.txt` UTF-8 e tratamento de codificação | P0 | **APROVADO** | N/A | `tests/integration/importers-f2.test.ts`, `tests/e2e/f2-importers.spec.ts` |
| **AC-04** | Importação de PDF textual, PDF sem texto e layouts difíceis | P0 | **APROVADO** | Pendente aparelho físico | `tests/integration/importers-f2.test.ts`, `tests/e2e/f2-importers.spec.ts` |
| **AC-05** | Importação de EPUB reflowable e bloqueio de EPUB hostil | P0 | **APROVADO** | Pendente aparelho físico | `tests/integration/importers-f2.test.ts`, `tests/e2e/f2-importers.spec.ts` |
| **AC-06** | Precisão determinística do motor RSVP | P0 | **APROVADO** | N/A | `tests/unit/engine.test.ts` |
| **AC-07** | Único agendamento ativo no motor | P0 | **APROVADO** | N/A | `tests/unit/engine.test.ts`, `tests/integration/uiFlow.test.tsx` |
| **AC-08** | Pausa, retomada, avanço, retrocesso e início manual | P0 | **APROVADO** | N/A | `tests/unit/engine.test.ts`, `tests/e2e/f1-flow.spec.ts` |
| **AC-09** | Mudança de velocidade durante a leitura | P0 | **APROVADO** | N/A | `tests/unit/engine.test.ts`, `tests/e2e/f1-flow.spec.ts` |
| **AC-10** | Multiplicadores de pontuação e fronteiras reais | P1 | **APROVADO** | N/A | `tests/unit/tokenizer.test.ts`, `tests/unit/engine.test.ts` |
| **AC-11** | Pausa automática ao perder visibilidade e proteção contra salto | P0 | **APROVADO (Web)** | Pendente Android/iOS físico | `tests/unit/engine.test.ts`, `tests/e2e/f1-flow.spec.ts` |
| **AC-12** | Leitura guiada e interação com rolagem manual | P0 | **APROVADO** | Pendente aparelho físico | `tests/integration/f3-guided-and-preferences.test.tsx`, `tests/e2e/f3-guided-and-settings.spec.ts` |
| **AC-13** | Alternância RSVP ↔ leitura guiada preservando o mesmo token | P0 | **APROVADO** | N/A | `tests/integration/f3-guided-and-preferences.test.tsx`, `tests/e2e/f3-guided-and-settings.spec.ts` |
| **AC-14** | Mudança de layout, fonte, tema e rotação sem perder posição | P1 | **APROVADO** | Pendente aparelho físico | `tests/e2e/f3-guided-and-settings.spec.ts` |
| **AC-15** | Persistência contínua e recuperação de sessão interrompida | P0 | **APROVADO** | N/A | `tests/integration/persistence.test.ts`, `tests/e2e/f1-flow.spec.ts`, `tests/e2e/f6-mvp-full-journey.spec.ts` |
| **AC-16** | Exclusividade de sessão ativa entre duas abas | P0 | **APROVADO** | N/A | `tests/integration/persistence.test.ts`, `tests/e2e/f1-flow.spec.ts` |
| **AC-17** | Falha de escrita e falta de espaço sem corrupção silenciosa | P0 | **APROVADO** | N/A | `tests/integration/persistence.test.ts`, `tests/integration/f5-backup-and-storage.test.tsx` |
| **AC-18** | Separação entre velocidade configurada, PPM observada e cobertura | P0 | **APROVADO** | N/A | `tests/unit/engine.test.ts` |
| **AC-19** | Integridade dos treinos e questionários incluídos | P0 | **APROVADO (Técnico)** | **PENDENTE revisão humana (`technical_verified_pending_human`)** | `tests/integration/f4-comprehension-and-history.test.tsx` |
| **AC-20** | Fluxo completo de questionário, rascunho e validação | P0 | **APROVADO** | N/A | `tests/integration/f4-comprehension-and-history.test.tsx`, `tests/e2e/f4-training-quiz-history.spec.ts` |
| **AC-21** | Reflexão rápida para documentos importados sem gabarito | P1 | **APROVADO** | N/A | `tests/integration/f4-comprehension-and-history.test.tsx`, `tests/e2e/f4-training-quiz-history.spec.ts` |
| **AC-22** | Histórico honesto, estado vazio e filtros | P1 | **APROVADO** | N/A | `tests/integration/f4-comprehension-and-history.test.tsx`, `tests/e2e/f4-training-quiz-history.spec.ts` |
| **AC-23** | Estabilidade de sessões e gabaritos diante de conteúdo versionado | P0 | **APROVADO** | N/A | `tests/integration/f4-comprehension-and-history.test.tsx` |
| **AC-24** | Exportação e restauração completa de backup ZIP | P0 | **APROVADO** | N/A | `tests/integration/f5-backup-and-storage.test.tsx`, `tests/e2e/f5-backup-and-offline-pwa.spec.ts`, `tests/e2e/f6-mvp-full-journey.spec.ts` |
| **AC-25** | Rejeição e rollback de backup corrompido ou incompatível | P0 | **APROVADO** | N/A | `tests/integration/f5-backup-and-storage.test.tsx`, `tests/e2e/f5-backup-and-offline-pwa.spec.ts` |
| **AC-26** | Estimativa de armazenamento, persistência e avisos sobre dados locais | P1 | **APROVADO** | N/A | `tests/integration/f5-backup-and-storage.test.tsx`, `tests/e2e/f5-backup-and-offline-pwa.spec.ts` |
| **AC-27** | Teclado, foco visível, movimento reduzido e leitor de tela | P1 | **APROVADO** | N/A | `tests/integration/f3-guided-and-preferences.test.tsx`, `tests/e2e/f6-mvp-full-journey.spec.ts` |
| **AC-28** | Limites de arquivo, descompressão, cancelamento, duplicatas e exclusão | P0 | **APROVADO** | N/A | `tests/integration/importers-f2.test.ts`, `tests/e2e/f2-importers.spec.ts` |
| **AC-29** | Desempenho e responsividade em documentos longos | P1 | **APROVADO** | Pendente Android físico | `tests/integration/f3-guided-and-preferences.test.tsx`, `tests/e2e/f6-mvp-full-journey.spec.ts` |
| **AC-30** | Migração de schema, versão futura incompatível e preferências inválidas | P0 | **APROVADO** | N/A | `tests/integration/persistence.test.ts`, `tests/integration/f3-guided-and-preferences.test.tsx` |
| **AC-31** | Funcionamento 100% offline após o primeiro carregamento | P0 | **APROVADO** | Pendente aparelho físico | `tests/e2e/f5-backup-and-offline-pwa.spec.ts`, `tests/e2e/f6-mvp-full-journey.spec.ts` |
| **AC-32** | Instalação e abertura como PWA | P1 | **APROVADO (Desktop Chrome)** | Pendente Android/iOS físico | `tests/e2e/f5-backup-and-offline-pwa.spec.ts` |
| **AC-33** | Atualização do Service Worker sem interromper leitura ativa | P1 | **APROVADO** | N/A | `tests/e2e/f5-backup-and-offline-pwa.spec.ts` |
| **AC-34** | Zero chamadas de rede externas e recursos 100% locais | P0 | **APROVADO** | N/A | `tests/e2e/f2-importers.spec.ts`, `tests/e2e/f5-backup-and-offline-pwa.spec.ts` |
| **AC-35** | Aceite pessoal de uso real | P0 | **PENDENTE (Exclusivo do Usuário)** | **PENDENTE (Exclusivo do Usuário)** | Checklist disponibilizado em `README.md` e `docs/HANDOFF.md` |
