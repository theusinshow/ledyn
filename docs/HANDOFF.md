# Handoff do Projeto — Leitura Dinâmica Pessoal

## 1. Fase e objetivo atual
- **Ciclos concluídos:**
  - **F0** (Preparação e redução de riscos)
  - **F1** (Primeira fatia funcional: texto colado → prévia → persistência transacional Dexie → biblioteca → leitura RSVP → pausa/retomada → conclusão)
  - **F2** (Biblioteca completa e importadores reais e canceláveis para `.txt` UTF-8, `.pdf` textual com `pdfjs-dist` e `.epub` reflowable sem DRM com `epubjs` + pré-validação incremental `fflate` e contenção de conteúdo hostil — **Gate G2 atingido**).
- **Status geral:** F0, F1 e F2 implementadas e verificadas tecnicamente. **Esta entrega NÃO equivale ao MVP completo** (que se encerra somente no Gate G6 após F3–F6).

## 2. Estado do workspace / commit / alterações
- **Diretório raiz:** `C:\Dev\pessoal\projetos\ledyn\ledyn`
- **Branch Git:** `main` (baseado no commit inicial `af809e3 Initial commit`).
- **Preservação de arquivos:** A pasta original `leitura-dinamica-antigravity-v1.0/` e os arquivos `leitura-dinamica-antigravity-v1.0.zip` e `.sha256` foram integralmente preservados sem exclusão.

## 3. Decisões confirmadas e defaults adotados
- **Decisões confirmadas (D01–D13):** React 19 + Vite 8 + TypeScript 5.9 estrito; Tailwind CSS 4 + componentes base estilo shadcn/ui; Zustand 5 (apenas estado transitório); Dexie 4 sobre IndexedDB (única fonte durável); `pdfjs-dist` e `epubjs`; modos RSVP e leitura guiada compartilhando cursor `contentVersionId + tokenIndex`; local-first sem backend, login, IA, OCR ou telemetria.
- **Defaults reversíveis adotados (P01–P15, registrados em `docs/decisions/ADR-001`, `ADR-002` e `ADR-003`):**
  - RSVP de 1 palavra por vez, faixa 100–800 PPM, padrão 250 PPM, passo 25 PPM.
  - Multiplicadores de pontuação ligados por padrão: `1,5x` (`clause`: `,`, `;`, `:`, `—`), `2,0x` (`sentence`: `.`, `!`, `?`, `…`) e `2,5x` (`paragraph`: fim de parágrafo em texto multiparágrafo), aplicando apenas o maior multiplicador sem somar.
  - Normalização Unicode `NFC` (`normalizationVersion = 1`) executada antes do cálculo de offsets UTF-16 e tokenização determinística (`tokenizerVersion = 1`) em chunks de até 2.000 tokens.
  - Um único leitor ativo por origem via tabela `leases` no Dexie (`TTL = 10 s`, heartbeat/checkpoint a cada `1,8 s <= 2 s`), complementado por `BroadcastChannel` quando disponível.
  - Limites de importação aplicados durante leitura/descompressão: `40 MiB` por arquivo, `300` páginas PDF, `2.000` entradas ZIP, `100 MiB` descomprimidos em EPUB, `1.000.000` unidades UTF-16, `200.000` tokens e timeout de `60 s`.

## 4. Entregas implementadas em F0, F1 e F2
- **Configuração e Qualidade (F0):** `package.json`, `package-lock.json`, `tsconfig*.json` (`strict: true`, `noUncheckedIndexedAccess: true`), `vite.config.ts` (porta fixa `4173`), `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js` e `index.html` com CSP restritiva.
- **Contratos e Banco de Dados (F0/F1):**
  - `src/domain/contracts.ts` e `src/shared/errors.ts`: contratos completos de `Token`, `ReadingCursor`, `SourceAnchor`, `ContentBlock`, `DocumentRecord`, `SourceFileRecord`, `ContentRecord`, `TokenChunkRecord`, `ProgressRecord`, `SessionRecord`, `LeaseRecord` e erros tipados.
  - `src/infrastructure/db/database.ts`: schema Dexie v1 com as 11 tabelas especificadas e verificação de versão futura incompatível (`DB_VERSION_UNSUPPORTED`) sem sobrescrever nem apagar dados.
- **Fluxo Funcional Completo de Leitura RSVP (F1):**
  - `src/domain/documents/normalizer.ts` e `tokenizer.ts`: normalização NFC, preservação de blocos/parágrafos, tratamento conservador de abreviações/decimais e classificação de fronteiras.
  - `src/domain/reading/clock.ts`, `metrics.ts` e `engine.ts`: relógio real e relógio virtual determinístico, motor RSVP com `generationId` (1 único timer ativo), pausa parcial honesta, aplicação de nova velocidade na próxima exposição e detecção de suspensão do sistema.
  - `src/infrastructure/db/repositories.ts` e `leaseManager.ts`: preparação de rascunho com detecção de duplicata SHA-256, commit transacional atômico, checkpoint idempotente e controle de lease entre abas.
- **Biblioteca e Importadores Completos (F2):**
  - `src/infrastructure/importers/types.ts` e `src/infrastructure/importers/pipeline.ts`: pipeline unificado cancelável (`jobId` + `AbortController` + timeout de 60 s), pré-validação de tamanho, cálculo de hash `SHA-256` e proteção contra commit tardio de job cancelado.
  - `src/infrastructure/importers/txtImporter.ts`: importador `.txt` UTF-8 com/sem BOM, rejeição de assinaturas binárias e sequências de bytes inválidas (`INVALID_ENCODING`) e rejeição de arquivo vazio (`EMPTY_TEXT`).
  - `src/infrastructure/importers/pdfImporter.ts`: importador `.pdf` via `pdfjs-dist` com worker empacotado localmente, extração página a página com `page.cleanup()`, `doc.cleanup()` e `loadingTask.destroy()`, `SourceAnchor` por página, prévia navegável por página, avisos de páginas em branco intercaladas (`PDF_MIXED_EMPTY_PAGES`) e múltiplas colunas/tabelas (`PDF_COMPLEX_LAYOUT`), e rejeição de PDFs sem camada de texto (`NO_TEXT_LAYER`).
  - `src/infrastructure/importers/epubImporter.ts`: importador `.epub` reflowable via `epubjs` + descompressão incremental `fflate`, bloqueando excesso de entradas/bytes durante a descompressão, path traversal (`..`), DRM (`DRM_UNSUPPORTED`), layout fixo (`FIXED_LAYOUT_UNSUPPORTED`) e URLs externas no spine, além de sanitizar cada capítulo XHTML em `DOMParser` inerte sem jamais tocar o DOM vivo ou habilitar `allowScriptedContent`.
  - `src/features/library/LibraryPage.tsx`: abas "Colar texto" e "Importar arquivo" (seletor + drag-and-drop), progresso de extração com botão "Cancelar preparação", aviso de duplicata SHA-256 ("Abrir existente" / "Escolher outro"), prévia navegável por seção (Página/Capítulo), botões "Salvar na biblioteca" e "Salvar e abrir", busca por título, renomeação e exclusão transacional.

## 5. Critérios AC aprovados, falhos e pendentes

| Critério | Status atual | Observação / Escopo |
| --- | --- | --- |
| **AC-01** | **APROVADO (Web)** | Colar texto, prévia, persistência de original/snapshot/tokens, renomear, buscar, excluir e recarregar validados. Validação em aparelhos físicos fica para F6. |
| **AC-02** | **APROVADO** | Cancelamento na prévia e rollback transacional completo sob falha de escrita verificados (0 órfãos). |
| **AC-03** | **APROVADO** | Importação `.txt` UTF-8 com/sem BOM, rejeição de bytes inválidos (`INVALID_ENCODING`), binário renomeado e arquivo vazio (`EMPTY_TEXT`) verificados em integração e E2E (`FX-03`). |
| **AC-04** | **APROVADO** | Importação `.pdf` textual de 3 páginas (`FX-04`), navegação por páginas na prévia, avisos em PDF misto/2 colunas (`FX-05`) e rejeição de PDF escaneado (`NO_TEXT_LAYER`) verificados em integração e E2E. |
| **AC-05** | **APROVADO** | Importação `.epub` reflow de 3 capítulos (`FX-06`) e bloqueio completo de EPUB hostil (`FX-07`: `<script>`, `onerror`, `javascript:`, `<iframe>`, URLs remotas, path traversal `..`, DRM e fixed-layout) verificados em integração e no navegador real via Playwright (`0` requisições externas, `0` scripts executados). |
| **AC-06** | **APROVADO** | 100 tokens a 300 PPM sem pausas = 20.000 ms exatos no `VirtualClock`, cursor 100, 100 apresentações, 300 PPM observada. |
| **AC-07** | **APROVADO** | Único timer ativo garantido em cliques rápidos, atraso de callback e React StrictMode. |
| **AC-08** | **APROVADO** | Pausa preserva cursor e reapresenta por duração integral; seek `-10`/`+10`/slider pausa e não infla cobertura. |
| **AC-09** | **APROVADO** | Mudança de velocidade vale na próxima palavra sem truncar a exposição atual; limites 100–800 e passo 25 validados. |
| **AC-10** | **APROVADO** | Multiplicadores 1,5 / 2,0 / 2,5 (maior prevalece), fator 1 desligado, abreviações e decimais testados em `FX-02`. |
| **AC-11** | **PARCIAL (Web aprovado; físico pendente)** | `visibilitychange` pausa e grava checkpoint; suspensão longa detectada sem inflar `activeMs`. Teste em Android/iOS físico pendente. |
| **AC-12 a AC-14** | **PENDENTE (F3)** | Modo de leitura guiada e alternância RSVP ↔ Guiada entram na F3. |
| **AC-15** | **APROVADO** | Checkpoint a cada <= 2 s e em transições; recuperação pausada após encerramento abrupto; falha de escrita exibe erro claro. |
| **AC-16** | **APROVADO** | Bloqueio entre duas abas verificado em integração Dexie e em duas abas reais no navegador via Playwright. |
| **AC-17** | **PARCIAL (F1/F2 aprovado; restauração na F5)** | Falha `QuotaExceededError` tratada no commit e no checkpoint sem corromper base nem exibir falso "salvo". |
| **AC-18** | **APROVADO** | Repetição de 10 tokens gera 110 apresentações e mantém cobertura única em 100; tempo zero exibe `"—"`. |
| **AC-19 a AC-23** | **PENDENTE (F4)** | Treinos originais, quiz objetivo, reflexão e filtros completos de histórico entram na F4. |
| **AC-24 a AC-26** | **PENDENTE (F5)** | Backup ZIP completo, restauração e estimativa de storage entram na F5. |
| **AC-28** | **APROVADO (F2 — Limites de importação)** | Limites de 40 MiB, 300 páginas PDF, 2.000 entradas ZIP, 100 MiB descomprimidos, 1M UTF-16, 200k tokens, cancelamento sem persistir rascunho e duplicata SHA-256 verificados. |
| **AC-27, AC-29 a AC-35** | **PENDENTE (F3–F6)** | Migração de schema, benchmark de 2 min, service worker offline de produção e gate final entram nas fases F3 a F6. |

*Nenhum critério falhou nas fases F0, F1 e F2.*

## 6. Comandos executados e resultados reais
1. `npm run lint` → **PASSOU** (0 erros, 0 avisos).
2. `npm run typecheck` → **PASSOU** (`tsc -b --noEmit` sem erros).
3. `npm run test:unit` → **PASSOU** (`6 test files passed, 30 tests passed` em Vitest: `tokenizer.test.ts`, `engine.test.ts`, `spikes.test.ts`, `persistence.test.ts`, `importers-f2.test.ts`, `uiFlow.test.tsx`).
4. `npm run test:e2e` → **PASSOU** (`6 passed` no Playwright usando Google Chrome em `http://localhost:4173`, cobrindo `f1-flow.spec.ts` e `f2-importers.spec.ts`).
5. `npm run build` → **PASSOU** (build de produção e worker PDF local gerados em `dist/`).

## 7. Ambiente, navegador/aparelho e fixtures
- **SO:** Windows 10/11 x64
- **Runtime:** Node.js `v24.14.0` · npm `11.9.0`
- **Navegador verificado em E2E:** Google Chrome Desktop (canal `chrome` via Playwright em `1280x720` e `360x800`).
- **Aparelhos físicos (Android / iOS):** Não executados neste ciclo local (permanecem pendentes na matriz de `ACCEPTANCE-TESTS.md`).
- **Fixtures criadas (`tests/fixtures/corpus.ts`):** `FX-01` (100 tokens determinísticos), `FX-02` (português com NFD/NFC, abreviações, decimais, parágrafos, emoji e palavra longa), `FX-03` (TXT UTF-8 com/sem BOM e bytes inválidos), `FX-04` (PDF textual de 3 páginas), `FX-05` (PDF escaneado sem texto, PDF misto e PDF em 2 colunas), `FX-06` (EPUB reflowable de 3 capítulos) e `FX-07` (EPUB hostil com `<script>`, `onerror`, `javascript:`, URLs remotas, path traversal `..`, DRM e fixed-layout).

## 8. Riscos, limitações atuais e revisões humanas pendentes
- **Limitações atuais do produto (fim da F2):**
  - Apenas o modo **RSVP** está disponível no leitor. O modo de **Leitura Guiada** e a alternância preservando o mesmo token pertencem à **F3**.
  - Os três textos de treino e questionários de compreensão pertencem à **F4**.
  - Exportação/restauração de backup ZIP e cache offline PWA completo pertencem à **F5**.
- **Aceite pessoal pendente:** O conforto visual e a experiência de importação de arquivos reais do usuário dependem da avaliação direta do usuário.

## 9. Arquivos relevantes adicionados/atualizados na F2
- `src/infrastructure/importers/types.ts` — Constantes de limites (`MAX_IMPORT_FILE_BYTES`, `MAX_PDF_PAGES`, `MAX_EPUB_ENTRIES`, `MAX_EPUB_UNCOMPRESSED_BYTES`, `IMPORT_TIMEOUT_MS`) e contratos de extração/prévia.
- `src/infrastructure/importers/txtImporter.ts` — Importador `.txt` UTF-8 estrito.
- `src/infrastructure/importers/pdfImporter.ts` — Importador `.pdf` com worker local `pdfjs-dist`, âncoras por página e heurísticas de baixa confiança.
- `src/infrastructure/importers/epubImporter.ts` — Importador `.epub` reflowable com descompressão incremental `fflate` e sanitização XHTML em `DOMParser` inerte.
- `src/infrastructure/importers/pipeline.ts` — Orquestrador unificado de importação cancelável, timeout e detecção de duplicata SHA-256.
- `src/features/library/LibraryPage.tsx` — Interface de importação de arquivos, progresso cancelável, aviso de duplicata e prévia navegável por página/capítulo.
- `tests/fixtures/corpus.ts`, `tests/integration/importers-f2.test.ts` e `tests/e2e/f2-importers.spec.ts` — Fixtures `FX-03..FX-07` e testes automatizados da F2.
- `docs/decisions/ADR-003-f2-importers-and-isolation.md` e `docs/evidence/F2-verification-report.md` — Registro arquitetural e evidências da F2.

## 10. Próxima tarefa concreta (Início da Fase F3)
- **Fase F3 — Leitura guiada, sessões robustas e preferências (`IMPLEMENTATION-PLAN.md` seção 6):**
  1. Implementar o modo de **Leitura Guiada** em texto corrido (`guidedUnit`: `token` ou `chunk` de `3` tokens), com rolagem suave mantendo a faixa ativa visível, pausa imediata ao rolar manualmente com botão **"Voltar ao ponto de leitura"** e clique em palavra com o leitor pausado para reposicionar o cursor.
  2. Garantir alternância imediata **RSVP ↔ Leitura Guiada** preservando exatamente `contentVersionId + tokenIndex` (`AC-13`) e preservação de cursor ao alterar tema, tamanho de fonte (`fontScale`), largura da coluna (`columnWidth`) ou rotação de tela (`AC-14`).
  3. Completar a tela de **Configurações / Preferências** persistidas em `preferences` no Dexie e validar os critérios **AC-12, AC-13, AC-14** até atingir o **Gate G3**.
