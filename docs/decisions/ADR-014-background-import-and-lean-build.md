# ADR-014 — Importação de PDF em segundo plano e build mais leve

- **Data:** 2026-10-23
- **Status:** Implementado e verificado no Chrome desktop; desempenho com o livro real do usuário pendente.

## Contexto

- O importador de PDF rodava o PDF.js com o worker de thread principal (`globalThis.pdfjsWorker`). Num livro grande, o parsing e a extração de texto disputavam a thread da interface.
- Ao abrir o app, `registerAppServiceWorker` pré-carregava `pdf.mjs` e `pdf.worker.mjs` na thread principal (~1,7 MB). Isso também forçava o PDF.js a usar o modo sem worker dedicado.
- O worker do PDF.js saía duas vezes no build (como módulo e como Web Worker), e o leitor de EPUB (`epubjs`) entrava no bloco inicial, porque `repositories.ts` importava `pipeline.ts`, que importava os extratores de forma estática.

## Decisão

- `createPdfWorker` (`src/infrastructure/pdf/pdfWorker.ts`): no navegador, cria um Web Worker dedicado com porta explícita (`PDFWorker.create({ port })`) e o encerra ao fim de cada importação. Só nos testes (Node/jsdom) usa o worker de thread principal. O ramo de teste depende apenas de `import.meta.env.MODE`, então o build de produção o elimina.
- O pré-carregamento do PDF.js na abertura foi removido. O precache do service worker continua garantindo a importação offline (AC-31).
- Os extratores de PDF e EPUB são carregados sob demanda dentro de `pipeline.ts`, e as seis telas são carregadas por rota (`React.lazy` em `App.tsx`).

## Resultado medido (Chrome desktop, build de produção)

| | Antes | Depois |
|---|---|---|
| Bloco inicial (`index`) | 1.124,7 kB (340,0 kB gzip) | 565,8 kB (177,1 kB gzip) |
| Cópias do worker do PDF.js | 2 (≈1,24 MB cada) | 1 |
| Tamanho total de `dist` (precache offline) | 4,3 MB | 3,1 MB |
| Maior pausa entre quadros importando o PDF sintético de 600 páginas | não medido | 70 ms |
| Extração + prévia do mesmo PDF | ~0,4–0,5 s | ~0,9 s (custo das mensagens com o worker) |

O bloco inicial que sobrou é quase todo React, roteador, Dexie e Zod, usados desde a primeira tela. O aviso do Vite sobre blocos acima de 500 kB continua para esse bloco e para o worker do PDF.js.

## Limites

- Normalização e tokenização ainda rodam na thread principal; num livro real muito grande, podem causar uma pausa curta ao fim da extração.
- A medição usa um PDF sintético leve; PDFs reais com fontes e imagens precisam ser medidos com o arquivo do usuário.
