# ADR-003 — Importadores TXT, PDF e EPUB, Isolamento de Conteúdo Hostil e Pipeline Transacional (F2)

- **Data:** 2026-10-21
- **Status:** Aceito (Ciclo F2)

## Contexto

A Fase F2 (`IMPLEMENTATION-PLAN.md` §5, `ARCHITECTURE.md` §6, `PRODUCT.md` §5.2–5.3 e `ACCEPTANCE-TESTS.md` AC-03, AC-04, AC-05, AC-28) exige:

1. Importadores reais e canceláveis para `.txt` UTF-8, `.pdf` textual (`pdfjs-dist`) e `.epub` reflowable (`epubjs` + pré-validação incremental `fflate`).
2. Pré-validação estrita antes de ler bytes ou descomprimir: tamanho máximo de arquivo (`40 MiB`), máximo de páginas PDF (`300`), máximo de entradas ZIP (`2.000`), máximo de bytes descomprimidos em EPUB (`100 MiB`), timeout de `60.000 ms` e limites pós-normalização (`1.000.000` unidades UTF-16 e `200.000` tokens).
3. Isolamento total contra conteúdo hostil: proibição absoluta de `allowScriptedContent`, proibição de inserir HTML/XHTML importado no DOM vivo, bloqueio de `http:`, `https:`, `//`, `javascript:`, `data:` executáveis, `<script>`, `<iframe>`, `<object>`, `<embed>` e atributos `on*`.
4. Detecção de duplicatas por hash `SHA-256` antes de salvar e prévia navegável por seção (Página no PDF, Capítulo no EPUB).

## Decisão

1. **Importador `.txt` (`src/infrastructure/importers/txtImporter.ts`)**:
   - Valida assinatura binária inicial (`%PDF-`, `PK\x03\x04`, bytes NUL) para rejeitar arquivos binários renomeados como `.txt`.
   - Remove BOM UTF-8 (`0xEF 0xBB 0xBF`) quando presente e decodifica com `new TextDecoder('utf-8', { fatal: true })`, rejeitando qualquer byte inválido com `INVALID_ENCODING`.
2. **Importador `.pdf` (`src/infrastructure/importers/pdfImporter.ts`)**:
   - Configura `GlobalWorkerOptions.workerSrc` para o worker empacotado localmente pelo Vite (`pdfjs-dist/legacy/build/pdf.worker.mjs?url`) quando em navegador real, sem CDN externa.
   - Processa página a página (`1..numPages`), respeitando `AbortSignal` e liberando recursos com `page.cleanup()`, `doc.cleanup()` e `loadingTask.destroy()` em blocos `try/finally`.
   - Registra `SourceAnchor` canônico `{ kind: 'pdf', page, itemStart, itemEnd }` e gera `PreviewSection` por página para navegação na prévia.
   - Detecta heurísticas de baixa confiança: páginas em branco intercaladas (`PDF_MIXED_EMPTY_PAGES`) e saltos verticais sugestivos de múltiplas colunas/tabelas (`PDF_COMPLEX_LAYOUT`), exibindo aviso explícito na prévia antes da confirmação. Rejeita PDFs 100% sem camada de texto com `NO_TEXT_LAYER`.
3. **Importador `.epub` (`src/infrastructure/importers/epubImporter.ts`)**:
   - Realiza descompressão incremental via `Unzip` (`fflate`), contabilizando cada entrada e cada byte descomprimido em tempo real e abortando imediatamente se ultrapassar `2.000` entradas ou `100 MiB` descomprimidos, ou se houver `..` / caminho absoluto (`CORRUPT_FILE`).
   - Rejeita `META-INF/encryption.xml` com `DRM_UNSUPPORTED` e `rendition:layout = pre-paginated` com `FIXED_LAYOUT_UNSUPPORTED`.
   - Valida a estrutura do pacote com `epubjs` (`Packaging`) sobre o documento OPF parseado localmente e percorre o `spine` na ordem declarada.
   - Sanitiza cada capítulo XHTML exclusivamente dentro de um `DOMParser` inerte (`sanitizeChapterDocumentInert`), removendo tags ativas/remotas, atributos `on*` e referências externas antes de extrair apenas texto puro estruturado em parágrafos e `SourceAnchor` `{ kind: 'epub', spineIndex, href, blockIndex }`.
4. **Pipeline Unificado e Cancelamento (`src/infrastructure/importers/pipeline.ts`)**:
   - `ImportJobHandle` combina `AbortController` do usuário com timeout de `60 s`.
   - Mesmo que uma promessa assíncrona termine próximo ao cancelamento, `commitPreparedDocument` verifica `isImportJobCancelled(job)` antes de abrir a transação Dexie, garantindo que jobs cancelados jamais persistam dados (`AC-28`).

## Impacto

- `AC-03`, `AC-04`, `AC-05` e `AC-28` validados em suíte de integração (`tests/integration/importers-f2.test.ts`) e no navegador real via Playwright (`tests/e2e/f2-importers.spec.ts`) com zero requisições externas e zero execução de script.
