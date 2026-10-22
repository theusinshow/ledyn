# ADR-006 — Backup Completo ZIP, Diagnóstico de Storage e PWA Offline (Fase F5)

- **Data:** 2026-10-22
- **Status:** Aceita e implementada
- **Fase:** F5 (Gate G5)

## Contexto

Na Fase F5 precisamos fechar a portabilidade local-first e a operação 100% offline da aplicação web/PWA sem servidor:
1. Exportação e restauração de pacote `.reading-backup.zip` (`RF-10`, `AC-24`, `AC-25`, `AC-26`), contendo `manifest.json`, entidades JSON versionadas e binários originais (`sources/<documentId>.bin`), sem `leases`.
2. Diagnóstico de armazenamento local (`navigator.storage.estimate()`, `navigator.storage.persisted()`, `navigator.storage.persist()`) e comunicação clara sobre vínculo de dados com a origem do navegador (`RF-09`, `AC-26`).
3. Manifesto PWA instalável, ícones locais e Service Worker com precache integral dos bundles, chunks de importadores (`PDF.js` + worker local e `epub.js` + `fflate`) e política de atualização sem recarga automática durante leitura ativa (`RNF-04`, `AC-31`, `AC-32`, `AC-33`, `AC-34`).

## Decisões

1. **Formato e Validação Estrita de `.reading-backup.zip` (`src/infrastructure/backup/backupService.ts`):**
   - Descompressão controlada com `fflate` respeitando limites de segurança antes de tocar no IndexedDB: até `150 MiB` para o arquivo `.zip`, até `250 MiB` descompactados acumulados e até `2.500` entradas, rejeitando imediatamente caminhos relativos inválidos (`..`, barras invertidas ou caminhos absolutos) com `BACKUP_INVALID`.
   - Validação de `manifest.json` (`backupFormatVersion`, `schemaVersion`, contagens exatas e mapa `sha256` de cada arquivo JSON e binário `sources/<documentId>.bin`), seguida de validação de schema Zod e integridade referencial cruzada (`documents`, `sourceFiles`, `content`, `cursors`, `sessions`, `questionSets`, `quizAttempts`, `reflections`, `preferences`).
   - Restauração exige biblioteca sem dados pessoais (`RESTORE_REQUIRES_EMPTY_LIBRARY`, ignorando apenas o catálogo fixo de treinos `training-*`) e grava tudo em uma única transação Dexie `rw` com rollback integral em caso de falha (`AC-25`).

2. **Diagnóstico de Armazenamento e Origem (`src/infrastructure/storage/storageDiagnostics.ts`):**
   - Consulta segura de `navigator.storage.estimate()` e `navigator.storage.persisted()` com fallback explícito quando a Storage API não é suportada pelo navegador.
   - Ação explícita na tela de Configurações para solicitar armazenamento persistente (`navigator.storage.persist()`) e limpar dados pessoais locais com confirmação antes de restaurar um backup.

3. **Service Worker Offline e Atualização Controlada (`vite.config.ts` e `src/infrastructure/pwa/serviceWorkerManager.ts`):**
   - Plugin de build (`ledynOfflinePwaPlugin`) gera `dist/sw.js` com hash determinístico dos artefatos de produção e precache completo de HTML, CSS, JS, ícones, manifesto e chunks locais de `pdfjs-dist` (`pdf.mjs` + `pdf.worker.mjs`), normalizando respostas redirecionadas para suportar navegação SPA offline.
   - Quando uma nova versão do Service Worker entra em estado `installed` com controlador ativo, o app exibe um banner discreto sem recarregar automaticamente (`AC-33`). Ao confirmar a atualização durante uma leitura, o `ReaderPage` pausa o motor, persiste o checkpoint atual no IndexedDB e só então recarrega.

## Consequências

- A importação inédita de arquivos `.txt`, `.pdf` e `.epub`, bem como a leitura RSVP/Guiada, treinos e histórico, funcionam 100% offline após o primeiro carregamento (`AC-31`), com zero dependências de CDN (`AC-34`).
- O round-trip de backup entre perfis distintos preserva integralmente documentos, binários originais, snapshots tokenizados, posição do cursor, histórico, tentativas de quiz, reflexões e preferências (`AC-24`).
