# Handoff do Projeto — Leitura Dinâmica Pessoal

## 1. Fase e objetivo atual
- **Ciclos concluídos (Implementação e Verificação Técnica):**
  - **F0** — Preparação, contratos, bootstrap e spikes de tokenização/PDF/EPUB (**Gate G0 atingido**)
  - **F1** — Primeira fatia funcional: texto colado → prévia → persistência transacional Dexie → biblioteca → leitura RSVP → pausa/retomada → conclusão (**Gate G1 atingido**)
  - **F2** — Biblioteca completa e importadores reais e canceláveis para `.txt` UTF-8, `.pdf` textual (`pdfjs-dist`) e `.epub` reflowable sem DRM (`epubjs` + `fflate`) com contenção de conteúdo hostil (**Gate G2 atingido**)
  - **F3** — Modo de Leitura Guiada, alternância RSVP ↔ Guiada preservando o mesmo token, janela limitada de DOM para textos longos e Configurações/Preferências persistidas no Dexie (**Gate G3 atingido**)
  - **F4** — Catálogo com 3 treinos originais em português, questionário objetivo de 4 perguntas com gabarito sustentado por trechos/offsets UTF-16, reflexão rápida sem nota para documentos importados e histórico filtrado (**Gate G4 atingido**)
  - **F5** — Exportação e restauração transacional de backup completo `.reading-backup.zip`, diagnóstico de armazenamento/persistência e PWA 100% offline com Service Worker e atualização controlada (**Gate G5 atingido**)
  - **F6** — Endurecimento, acessibilidade, matriz responsiva, jornada E2E ponta a ponta e documentação completa de uso (**Gate Técnico G6 atingido**).
- **Separação obrigatória de status:** A implementação e toda a validação técnica automatizada do MVP Web/PWA (F0–F6) estão **concluídas e aprovadas**. Permanecem **pendentes da ação direta do usuário**:
  1. Revisão humana editorial dos 3 treinos (`AC-19`, mantidos com `reviewStatus: 'technical_verified_pending_human'`).
  2. Testes em aparelhos físicos Android e iOS (`AC-11` bloqueio físico de tela e `AC-32` instalação PWA física).
  3. Aceite pessoal de uso real pelo usuário (`AC-35`).
- **Fases pós-MVP (F7 Tauri Desktop e F8 Capacitor Mobile):** **Não iniciadas** (aguardam conclusão do aceite pessoal `AC-35` e autorização explícita do usuário).

## 1.1 Ciclo pós-G6 — Redesign e Mapa do PDF (2026-10-23)
- **Pedido do usuário:** refazer o design system com referência no Linear e adicionar ao leitor um mapa/scan da página do PDF, com imagens e o trecho em leitura.
- **Implementado:** novos tokens e primitivas (`src/index.css`, `src/components/ui/*`), shell com barra lateral (`src/app/App.tsx`), palco RSVP refeito e o painel **Mapa do PDF** (`PdfScanPanel.tsx`, `pdfLocator.ts`, `pdfPageRenderer.ts`, `loadSourceFileBlob`). Decisões em [ADR-007](decisions/ADR-007-design-system-linear-and-pdf-scan-map.md).
- **Verificação real:** `lint` OK; `typecheck` OK; `test:unit` 10 arquivos / 47 testes OK; `test:e2e` 18 testes OK (inclui os 3 novos de `reader-pdf-scan.spec.ts`), no Chrome sobre o build de produção. Capturas revisadas nos temas claro e escuro, em 1366×860 e 390×844.
- **Pendente:** aceite visual do usuário; validação em aparelho físico. O destaque do mapa é aproximado por bloco e linha, não por palavra.

## 1.2 Livros PDF longos e capas na biblioteca (2026-10-23)
- **Pedido do usuário:** importar um PDF de 600 páginas e usar a capa de cada documento como referência na biblioteca.
- **Implementado:** limites ampliados (1.000 páginas, 3.000.000 de unidades UTF-16, 500.000 tokens, timeout de 180 s; 40 MiB mantidos). Capa da 1ª página do PDF gerada sob demanda (`pdfCoverService.ts`, `DocumentCover.tsx`) e capa tipográfica nos demais formatos. Sem mudança de schema. Ver [ADR-008](decisions/ADR-008-long-pdf-limits-and-library-covers.md).
- **Verificação real:** lint, typecheck, `test:unit` com 47 testes e `test:e2e` com 19 testes, todos OK. Inclui `pdf-long-book.spec.ts`: PDF sintético de 600 páginas / 181.200 tokens, importado e aberto em ~1,2 s no Chrome desktop.
- **Pendente:** importar o livro real do usuário (se passar de 40 MiB, será recusado pelo limite atual) e validar memória/tempo no celular.

## 1.3 Ritmo inteligente e letra de foco fixa (2026-10-23)
- **Pedido do usuário:** pesquisar como o RSVP deve funcionar e corrigir a sensação de se perder em vírgulas e parágrafos.
- **Implementado:** letra de foco em coluna fixa; pausas com mínimo absoluto; tempo extra para palavras longas e números; rampa ao iniciar; retomada no início da frase após pausa da sessão; sinal de parágrafo. Ver [ADR-009](decisions/ADR-009-smart-pacing-and-fixed-orp.md); RF-03 e AC-10 atualizados.
- **Verificação real:** lint e typecheck OK; `test:unit` 58 OK; `test:e2e` 22 OK (inclui `rsvp-precision.spec.ts`).
- **Pendente:** avaliação de conforto pelo usuário. Os parâmetros são heurísticos e podem precisar de ajuste com o uso real.

## 1.4 Voltar frase/parágrafo, blocos de 2–3 palavras e estudo de voz (2026-10-23)
- **Implementado:** R / Shift+R e botões para voltar frase/parágrafo (continua tocando); preferência `rsvpChunkSize` (1–3) com blocos que param na pontuação; destaque do bloco na Leitura Guiada. Ver [ADR-010](decisions/ADR-010-chunks-and-rewind.md).
- **Estudo:** leitura em voz alta em [docs/research/tts-leitura-em-voz-alta.md](research/tts-leitura-em-voz-alta.md). Recomendação: vozes locais do sistema (grátis/offline), com sincronia por eventos `boundary` já verificada nesta máquina.
- **Verificação real:** lint e typecheck OK; `test:unit` 64 OK; `test:e2e` 24 OK.
- **Próximo (ordem combinada):** sumário/capítulos (PDF outline e EPUB TOC); depois o painel de evolução. Modo "Ouvir" aguarda o OK do usuário.

## 1.5 Sumário e capítulos (2026-10-23)
- **Implementado:** painel "Sumário" para PDF (outline do arquivo original) e EPUB (itens do spine), com capítulo atual, progresso e navegação; nome do capítulo no cabeçalho; PDF aberto uma única vez e compartilhado entre o mapa e o sumário (`usePdfRenderer`). Ver [ADR-011](decisions/ADR-011-chapters-and-toc.md).
- **Verificação real:** lint e typecheck OK; `test:unit` 69 OK; `test:e2e` 27 OK.
- **Próximo:** painel de evolução; depois, estudo do modo "Ouvir" (leitura acompanhada por voz).

## 1.6 Painel de evolução (2026-10-23)
- **Implementado:** "Sua evolução" no topo do Histórico. Mostra tempo lendo (7 dias, comparado aos 7 anteriores), dias seguidos, palavras apresentadas, PPM observada, minutos por dia (14 dias) e PPM observada por sessão, com tooltip e tabela. Ver [ADR-012](decisions/ADR-012-progress-dashboard.md).
- **Verificação real:** lint e typecheck OK; `test:unit` 75 OK; `test:e2e` 28 OK.
- **Próximo:** estudo do modo "Ouvir" (leitura acompanhada por voz), já combinado com o usuário.

## 1.7 Modo foco, trilha de contexto e ajuste fino (2026-10-23)
- **Implementado:** modo foco em tela cheia (F), com controles que somem durante a leitura; trilha do que acabou de ler abaixo da palavra; ajuste fino das pausas e da volta ao início da frase em Configurações. Ver [ADR-013](decisions/ADR-013-focus-mode-and-fine-tuning.md).
- **Verificação real:** lint e typecheck OK; `test:unit` 80 OK; `test:e2e` 30 OK.
- **Próximo (ordem combinada):** importação de PDF em segundo plano e build mais leve; depois marcadores e busca; depois o modo "Ouvir".

## 1.8 Importação em segundo plano e build mais leve (2026-10-23)
- **Implementado:** worker dedicado do PDF.js na importação; removido o pré-carregamento do PDF.js na abertura; extratores e telas carregados sob demanda. Ver [ADR-014](decisions/ADR-014-background-import-and-lean-build.md).
- **Medido:** bloco inicial de 1.124,7 kB para 565,8 kB; uma cópia do worker; `dist` de 4,3 MB para 3,1 MB; maior pausa da interface importando 600 páginas: 70 ms.
- **Verificação real:** lint e typecheck OK; `test:unit` 80 OK; `test:e2e` 30 OK (inclui importação offline).
- **Próximo:** marcadores e busca no livro; depois o modo "Ouvir".

## 1.9 Marcadores e busca no documento — schema v2 (2026-10-23)
- **Implementado:** busca no documento (`/`), sem diferenciar acentos e maiúsculas, com trechos e salto até o resultado; marcadores (`M`) com nota, navegação e exportação em Markdown. Banco migrado para o **schema v2** (tabela `bookmarks`, migração aditiva). Backup exporta marcadores e continua restaurando backups v1. Ver [ADR-015](decisions/ADR-015-bookmarks-search-schema-v2.md).
- **Verificação real:** lint e typecheck OK; `test:unit` 91 OK (inclui migração v1→v2 com base v1 real, restauração de backup v1 e recusa de marcador adulterado); `test:e2e` 32 OK.
- **Próximo:** modo "Ouvir" (leitura acompanhada por voz), conforme combinado.

## 1.10 Modo "Ouvir" — leitura acompanhada por voz local (protótipo, 2026-10-23)
- **Implementado:** barra "Ouvir" com vozes locais do sistema (online nunca usadas), fala por frase, destaque da Leitura Guiada conduzido pelos eventos de palavra e cursor sincronizado ao parar (um único seek). O RSVP fica parado durante a fala; ouvir não entra nas métricas. Ver [ADR-016](decisions/ADR-016-listen-mode-local-voices.md).
- **Verificação real:** lint e typecheck OK; `test:unit` 96 OK; `test:e2e` 34 OK; voz real "Microsoft Daniel" no Chrome/Windows seguindo palavra a palavra.
- **Pendente:** o usuário avaliar a qualidade das vozes; decidir se voz e velocidade viram preferências salvas; testar no celular.

## 2. Estado do workspace / commit / alterações
- **Diretório raiz:** `C:\Dev\pessoal\projetos\ledyn\ledyn`
- **Branch Git:** `main` (último commit base antes de F3–F6: `330b919 feat(f0-f2): implement core speed reading engine, library, and file importers`).
- **Preservação de arquivos:** A pasta original `leitura-dinamica-antigravity-v1.0/` e os arquivos `leitura-dinamica-antigravity-v1.0.zip` e `.sha256` foram integralmente preservados.

## 3. Decisões confirmadas e defaults adotados
- **Decisões confirmadas (`D01`–`D13`):** React 19 + Vite 8 + TypeScript 5.9 estrito; Tailwind CSS 4 + componentes estilo shadcn/ui; Zustand 5 (apenas estado transitório, zero `localStorage`); Dexie 4 sobre IndexedDB (única fonte durável); `pdfjs-dist` e `epubjs`; modos RSVP e Leitura Guiada compartilhando cursor `contentVersionId + tokenIndex`; local-first sem backend, login, IA, OCR ou telemetria.
- **Defaults reversíveis adotados (`P01`–`P15`, documentados em `docs/decisions/ADR-001` a `ADR-006`):**
  - RSVP de 1 palavra por vez, faixa `100–800 PPM`, padrão `250 PPM`, passo `25 PPM`.
  - Multiplicadores de pontuação ligados por padrão: `1,5x` (`clause`), `2,0x` (`sentence`) e `2,5x` (`paragraph`), prevalecendo apenas o maior multiplicador sem acumular.
  - Modo Guiado com destaque por palavra (`token`) ou grupo curto (`chunk` de 3 palavras), janela máxima de `1.200` tokens no DOM por vez para documentos longos, rolagem suave respeitando `reducedMotion`, pausa imediata em rolagem manual (`wheel`/`touchmove`) com botão `"Voltar ao ponto de leitura"`, e clique em palavra com leitor pausado para reposicionar o cursor.
  - Catálogo de treinos (`src/content/training/catalog.ts`) com 3 textos originais em português (352 a 384 palavras cada), 4 perguntas por texto, 4 alternativas por pergunta, justificativa e `sourceQuote` literal com offsets UTF-16 validados automaticamente e `reviewStatus: 'technical_verified_pending_human'`.
  - Pacote `.reading-backup.zip` (`backupFormatVersion = 1`, `schemaVersion = 1`) validado por SHA-256, schema Zod e integridade referencial cruzada, exigindo biblioteca sem dados pessoais (`RESTORE_REQUIRES_EMPTY_LIBRARY`) e rollback transacional integral em falha.

## 4. Entregas implementadas em F0 a F6
- **Domínio e Motor (`src/domain/`):** normalizador Unicode NFC (`normalizer.ts`), tokenizador versionado (`tokenizer.ts`), relógio real e virtual (`clock.ts`), motor unificado RSVP + Guiado com proteção de `generationId` (`engine.ts`), métricas honestas (`metrics.ts`) e validação de questionários/evidências (`comprehension/quiz.ts`).
- **Infraestrutura (`src/infrastructure/`):**
  - `db/database.ts`, `db/repositories.ts` e `db/leaseManager.ts`: schema Dexie v1 (11 tabelas), repositórios transacionais, controle de lease entre abas, persistência de preferências com fallback seguro para corrupção (`preferencesWarning`), rascunhos/submissão de quiz, reflexões e histórico.
  - `importers/`: importadores reais e canceláveis para `.txt`, `.pdf` (`pdfjs-dist` + worker local) e `.epub` (`epubjs` + `fflate` + sanitização XHTML inerte).
  - `backup/backupService.ts`: exportação e restauração segura de `.reading-backup.zip` com binários reais (`sources/<documentId>.bin`) e limpeza transacional confirmada de dados pessoais.
  - `storage/storageDiagnostics.ts`: diagnóstico de quota/uso (`navigator.storage.estimate()`) e persistência (`persisted()` / `persist()`).
  - `pwa/serviceWorkerManager.ts` + `vite.config.ts` (`ledynOfflinePwaPlugin`) + `public/manifest.webmanifest`: PWA instalável 100% offline com precache de todos os bundles e chunks e atualização sem reload automático durante leitura ativa.
- **Interface Completa (`src/features/` e `src/app/`):**
  - `library/LibraryPage.tsx` (4 formatos, prévia por seção, busca, renomear, excluir e paginação progressiva para grandes acervos).
  - `reader/ReaderPage.tsx` e `reader/GuidedReadingView.tsx` (modos RSVP e Guiada, alternância preservando token, resumo de fim de leitura com atalho para Quiz ou Reflexão rápida).
  - `training/TrainingPage.tsx` e `training/QuizPage.tsx` (catálogo de treinos, rascunho persistente de quiz, validação de perguntas faltantes e tela de resultado com evidências literais).
  - `history/HistoryPage.tsx` (filtros combináveis por documento, modo, status e presença de questionário).
  - `settings/SettingsPage.tsx` (preferências visuais/leitura, backup/restauração `.reading-backup.zip` e diagnóstico de armazenamento/origem).

## 5. Critérios AC aprovados, falhos e pendentes

| Critério | Status Técnico Automatizado | Status Aparelho Físico / Humano |
| --- | --- | --- |
| **AC-01 a AC-10** | **APROVADO** | Pendente aparelho físico em AC-01, AC-04, AC-05 |
| **AC-11** | **APROVADO (Web `visibilitychange` + salto de relógio)** | **PENDENTE** Android e iOS físicos |
| **AC-12 a AC-18** | **APROVADO** | Pendente aparelho físico em AC-12, AC-14 |
| **AC-19** | **APROVADO (Validação técnica de schema, offsets UTF-16 e citações)** | **PENDENTE revisão humana editorial (`technical_verified_pending_human`)** |
| **AC-20 a AC-28** | **APROVADO** | N/A |
| **AC-29** | **APROVADO (Desktop Chrome: jitter p95 <= 50 ms, 3.000 tokens com janela <= 1.200 nós DOM, biblioteca 200 itens)** | **PENDENTE** Android físico |
| **AC-30 a AC-31** | **APROVADO** | Pendente aparelho físico em AC-31 |
| **AC-32** | **APROVADO (Manifesto, ícones locais e Service Worker em Chrome Desktop)** | **PENDENTE** Android e iOS físicos |
| **AC-33 a AC-34** | **APROVADO** | N/A |
| **AC-35** | **PENDENTE (Exclusivo do Usuário)** | **PENDENTE aceite pessoal do usuário** |

*Nenhum critério falhou.* Relatório completo em [docs/evidence/f6-mvp-gate-report.md](evidence/f6-mvp-gate-report.md).

## 6. Comandos executados e resultados reais
1. `npm run lint` → **PASSOU** (0 erros, 0 avisos).
2. `npm run typecheck` → **PASSOU** (`tsc -b --noEmit` sem erros).
3. `npm run test:unit` → **PASSOU** (`9 test files passed, 42 tests passed` no Vitest).
4. `npm run test:e2e` → **PASSOU** (`6 test files passed, 15 tests passed` no Playwright com Google Chrome sobre build de produção `npm run build && npm run preview`).
5. `npm run build` → **PASSOU** (bundle de produção e Service Worker `dist/sw.js` gerados com sucesso).

## 7. Ambiente, navegador/aparelho e fixtures
- **SO:** Windows 10/11 x64
- **Runtime:** Node.js `v24.14.0` · npm `11.9.0`
- **Navegador verificado em E2E:** Google Chrome Desktop (Playwright `channel: 'chrome'`), incluindo matriz responsiva `360x640`, `390x844`, `768x1024`, `1366x768`, `1440x900` e `800x360`.
- **Aparelhos físicos (Android / iOS):** Não executados neste ambiente local (registrados como pendentes).
- **Fixtures (`tests/fixtures/corpus.ts`):** `FX-01` a `FX-11` completos (incluindo `FX-08` 3 treinos originais em `src/content/training/catalog.ts`, `FX-10` backup válido round-trip e `FX-11` backups inválidos com `path_traversal`, hash divergente, `backupFormatVersion` futuro e JSON truncado).

## 8. Riscos, limitações atuais e revisões humanas pendentes
- **Revisão humana pendente (`AC-19`):** Os 3 conjuntos de perguntas em `src/content/training/catalog.ts` foram validados tecnicamente por testes automatizados, mas permanecem com `reviewStatus: 'technical_verified_pending_human'` até que o usuário revise o conteúdo editorialmente.
- **Aparelhos físicos pendentes (`AC-11`, `AC-29`, `AC-32`):** Os testes móveis foram executados em emulação de viewport no Chrome Desktop; testes em hardware Android/iOS real dependem do dispositivo físico do usuário.
- **Aceite pessoal (`AC-35`):** Depende do uso real pelo usuário conforme o checklist da seção 6 do `README.md`.

## 9. Arquivos relevantes adicionados/atualizados em F3–F6
- **F3:** `src/features/reader/GuidedReadingView.tsx`, `src/features/reader/ReaderPage.tsx`, `src/features/settings/SettingsPage.tsx`, `tests/integration/f3-guided-and-preferences.test.tsx`, `tests/e2e/f3-guided-and-settings.spec.ts`, `docs/decisions/ADR-004-f3-guided-mode-and-preferences.md`.
- **F4:** `src/domain/comprehension/quiz.ts`, `src/content/training/catalog.ts`, `src/features/training/TrainingPage.tsx`, `src/features/training/QuizPage.tsx`, `src/features/history/HistoryPage.tsx`, `tests/integration/f4-comprehension-and-history.test.tsx`, `tests/e2e/f4-training-quiz-history.spec.ts`, `docs/decisions/ADR-005-f4-comprehension-and-history.md`.
- **F5:** `src/infrastructure/backup/backupService.ts`, `src/infrastructure/storage/storageDiagnostics.ts`, `src/infrastructure/pwa/serviceWorkerManager.ts`, `public/manifest.webmanifest`, `public/icons/`, `public/sw.js`, `vite.config.ts`, `tests/integration/f5-backup-and-storage.test.tsx`, `tests/e2e/f5-backup-and-offline-pwa.spec.ts`, `docs/decisions/ADR-006-f5-backup-storage-and-offline-pwa.md`.
- **F6:** `tests/e2e/f6-mvp-full-journey.spec.ts`, `docs/evidence/f6-mvp-gate-report.md`, `README.md`, `docs/HANDOFF.md`.

## 10. Próxima tarefa concreta
1. **Pelo usuário (Revisão Humana e Aceite Pessoal — `AC-19` e `AC-35`):**
   - Executar o checklist da seção 6 do `README.md` (revisar os 3 treinos em `/training`, realizar a leitura de arquivos reais em RSVP e Leitura Guiada, testar exportação/restauração `.reading-backup.zip` e uso em aparelhos físicos se aplicável).
2. **Após confirmação do usuário:**
   - Atualizar `reviewStatus` dos treinos aprovados pelo usuário e, somente se desejado e autorizado pelo usuário, decidir sobre o início das fases opcionais pós-MVP (**F7 — Empacotamento Desktop com Tauri** ou **F8 — Empacotamento Mobile com Capacitor**).
