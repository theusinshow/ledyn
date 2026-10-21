# ADR-001 — Versões da Stack, Defaults Reversíveis e Spikes de PDF.js / epub.js

- **Data:** 2026-10-21
- **Status:** Aceito (Ciclo F0/F1)

## Contexto

O pacote de especificação (`DECISIONS.md`, `ARCHITECTURE.md`, `IMPLEMENTATION-PLAN.md`) confirma a stack base (React, Vite, TypeScript estrito, Tailwind CSS, shadcn/ui, Zustand, Dexie/IndexedDB, PDF.js e epub.js) e determina que na F0 sejam escolhidas versões estáveis compatíveis, registrados os defaults adotados e realizados spikes exploratórios locais de `pdfjs-dist` e `epubjs` + pré-validação ZIP (`fflate`).

## Decisão

1. **Runtime e Gerenciador**:
   - Node.js `v24.14.0`, npm `11.9.0`, com `package-lock.json` versionado e 0 vulnerabilidades (`npm audit`).
2. **Versões Exatas Instaladas**:
   - `react`: `19.3.1` / `react-dom`: `19.3.1`
   - `vite`: `8.3.5` / `@vitejs/plugin-react`: `6.1.2`
   - `typescript`: `5.9.3` (compatível com `typescript-eslint@8.72.0` e modo `strict: true` + `noUncheckedIndexedAccess: true`)
   - `tailwindcss`: `4.3.3` / `@tailwindcss/vite`: `4.3.3`
   - `zustand`: `5.0.15` (restrito a estado transitório; nenhuma persistência duplicada em `localStorage`)
   - `dexie`: `4.4.6`
   - `pdfjs-dist`: `6.4.299`
   - `epubjs`: `0.3.93` (com override de segurança `@xmldom/xmldom: 0.9.12`)
   - `fflate`: `0.8.3` / `zod`: `4.6.7`
   - `vitest`: `5.0.5` / `@testing-library/react`: `16.3.3` / `@playwright/test`: `1.64.1`
3. **Defaults Reversíveis Adotados (`DECISIONS.md` P01–P15)**:
   - P01: Idioma `pt-BR` e nome provisório "Leitura Dinâmica Pessoal".
   - P02: Sem backend, login, telemetria ou sincronização no MVP.
   - P03: Texto colado na F1; importadores completos TXT/PDF/EPUB na F2.
   - P04: RSVP de 1 palavra por exposição, 100–800 PPM, padrão 250 PPM, passo 25 PPM, multiplicadores de pontuação 1,5x (`clause`), 2,0x (`sentence`) e 2,5x (`paragraph`), prevalecendo sempre o maior.
   - P07: Limites de 40 MiB por arquivo (atualizado de 20 MiB para 40 MiB por solicitação do usuário), 300 páginas PDF, 1.000.000 de unidades UTF-16 e 200.000 tokens.
   - P10: Um único leitor ativo por origem com lease no Dexie (TTL 10 s, heartbeat/checkpoint até 2 s).
   - P11: Vitest + Testing Library + Playwright.
4. **Resultado dos Spikes F0 (`src/infrastructure/importers/pdfSpike.ts` e `epubSpike.ts`)**:
   - **PDF.js**: Validado uso de `pdfjs-dist/legacy/build/pdf.mjs` com `disableFontFace: true` e `useSystemFonts: true`, extraindo `page.getTextContent()` localmente sem CDN e liberando memória com `page.cleanup()`, `doc.cleanup()` e `loadingTask.destroy()`.
   - **epub.js + fflate**: Validada pré-validação incremental do ZIP via `Unzip` (`fflate`), medindo entradas e bytes descomprimidos reais durante o fluxo (bloqueando zip bombs, path traversal `..`, DRM em `META-INF/encryption.xml` e `rendition:layout` `pre-paginated`). Para extração de capítulos, o XHTML é processado em um documento `DOMParser` inerte, removendo `<script>`, `<style>`, `<iframe>`, `<object>`, `<link>`, handlers `on*` e URIs externas/javascript antes de extrair somente texto, sem jamais inserir HTML no DOM vivo nem habilitar `allowScriptedContent`.

## Impacto

- Nenhum bloqueador para a Fase F2. Os adaptadores definitivos da F2 evoluirão os módulos validados no spike adicionando worker dedicado, progresso por página/capítulo, `AbortSignal` e timeout de 60 s.
