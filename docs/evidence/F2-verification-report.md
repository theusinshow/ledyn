# Relatório de Verificação Técnica — Fase F2 (Biblioteca e Importadores Completos)

- **Data:** 2026-10-21
- **Ambiente Real Executado:** Windows 11 · Node.js `v24.14.0` · npm `11.9.0` · Google Chrome local (Playwright E2E) · Vitest `5.0.5` + `fake-indexeddb`.

---

## 1. Comandos de Qualidade Executados

| Comando | Status | Resultado Observado |
| --- | --- | --- |
| `npm run lint` | **PASS** | `0` erros, `0` warnings (`eslint .`) |
| `npm run typecheck` | **PASS** | `0` erros (`tsc -b --noEmit` em modo estrito) |
| `npm run test:unit` | **PASS** | `6` arquivos de teste aprovados (`30/30` testes unitários e de integração) |
| `npm run test:e2e` | **PASS** | `2` arquivos Playwright aprovados (`6/6` cenários E2E reais em Google Chrome) |
| `npm run build` | **PASS** | Bundle de produção + worker local `pdf.worker-*.mjs` gerados em `dist/` sem erros |

---

## 2. Matriz de Critérios de Aceite da F2 (`ACCEPTANCE-TESTS.md`)

| ID | Critério | Prioridade | Nível Executado | Status | Evidência Técnica |
| --- | --- | --- | --- | --- | --- |
| **AC-03** | Importar arquivo `.txt` UTF-8 válido (com e sem BOM) e rejeitar codificação inválida (`INVALID_ENCODING`), binário renomeado e arquivo vazio (`EMPTY_TEXT`) | P0 | Integração + E2E | **APROVADO** | `tests/integration/importers-f2.test.ts` (2 testes) e `tests/e2e/f2-importers.spec.ts` (importação de `FX-03`, prévia, salvamento, busca, renomeação e exclusão transacional) |
| **AC-04** | Importar `.pdf` textual (`FX-04` 3 páginas), preservar ordem, navegar por páginas na prévia, alertar layout complexo/misto (`FX-05`) e rejeitar PDF escaneado sem texto (`NO_TEXT_LAYER`) | P0 | Integração + E2E | **APROVADO** | `tests/integration/importers-f2.test.ts` (3 testes) e `tests/e2e/f2-importers.spec.ts` (navegação Páginas 1–3 na prévia, detecção de duplicata SHA-256 e rejeição de PDF escaneado) |
| **AC-05** | Importar `.epub` reflowable sem DRM (`FX-06` 3 capítulos) e bloquear conteúdo hostil (`FX-07` com `<script>`, `onerror`, `javascript:`, `<iframe>`, URLs remotas, path traversal `..`, DRM e fixed-layout) | P0 | Integração + E2E | **APROVADO** | `tests/integration/importers-f2.test.ts` (2 testes) e `tests/e2e/f2-importers.spec.ts` (observação real de `page.on('request')` com `0` requisições externas e `window.__EPUB_SCRIPT_EXECUTED__ === undefined`) |
| **AC-28** | Pré-validação de limites (`40 MiB`, `300` páginas PDF, `2.000` entradas ZIP, `100 MiB` descomprimidos, `1.000.000` chars UTF-16, `200.000` tokens), detecção de duplicata por `SHA-256` e cancelamento de importação sem persistir rascunho | P0 | Integração + E2E | **APROVADO** | `tests/integration/importers-f2.test.ts` (3 testes cobrindo `FILE_TOO_LARGE`, cancelamento via `AbortSignal` sem sujar o Dexie e detecção de duplicata) + `tests/e2e/f2-importers.spec.ts` |

---

## 3. Verificação de Isolamento e Segurança (`AC-05`)

1. **Sanitização Inerte**: Todo capítulo XHTML de EPUB é processado exclusivamente em um documento criado por `new DOMParser().parseFromString(xhtml, 'application/xhtml+xml')`, sem nunca ser anexado ao `document` vivo da aplicação e sem usar `allowScriptedContent`.
2. **Descompressão Controlada (`fflate`)**: O arquivo `.epub` é descomprimido incrementalmente verificando contagem de entradas (`<= 2.000`), soma real de bytes descomprimidos (`<= 100 MiB`) e ausência de path traversal (`..` ou caminhos absolutos) antes de construir a árvore em memória.
3. **Monitoramento de Rede no Navegador Real**: Durante o teste E2E de `FX-07` no Google Chrome, um listener `page.on('request')` inspecionou todas as requisições disparadas pela página durante a preparação da prévia, confirmação e abertura no leitor RSVP. Nenhuma requisição para fora de `http://localhost:4173` foi emitida.
