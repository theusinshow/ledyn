# ADR-007 — Design system (referência Linear) e Mapa do PDF no leitor

- **Data:** 2026-10-23
- **Status:** Implementado; validação técnica automatizada concluída; aceite visual do usuário pendente.

## Contexto

O usuário pediu para refazer o design system usando o Linear como referência e adicionar ao leitor um "scan" do PDF em leitura: um mapa da página que mostre o trecho por onde a leitura dinâmica está passando, incluindo as imagens do arquivo.

## Decisões

1. **Tokens e tipografia** (`src/index.css`): base quase preta no escuro (`#08090a`), superfícies em camadas (`card`, `surface-raised`, `surface-sunken`), bordas translúcidas finas, um acento índigo (`#5e6ad2` claro / `#7c84e8` escuro) e novos tokens `success`, `warning`, `subtle-foreground` e `border-strong`. Os nomes de token anteriores foram mantidos, para que todas as telas herdem o novo visual sem reescrita. As classes `amber-*` foram trocadas pelo token `warning`. A variante `dark:` passou a seguir a classe `.dark`, que já é controlada pela preferência salva no Dexie.
2. **Fontes locais**: `@fontsource-variable/geist@5.3.0` e `@fontsource-variable/geist-mono@5.3.0` (OFL), importadas em `src/main.tsx`. Sem CDN; os arquivos entram no precache do service worker (AC-31/AC-34).
3. **Shell**: barra lateral fixa no desktop, no estilo Linear; navegação inferior no celular. Rótulos e `aria-label` mantidos. O leitor continua sem navegação, para manter o foco, e ganhou largura `max-w-6xl` para caber o mapa.
4. **Mapa do PDF** (`src/features/reader/PdfScanPanel.tsx`): a página do **arquivo original preservado** (`sourceFiles`) é desenhada num `<canvas>` com PDF.js, o que inclui imagens e vetores. Nenhum texto do PDF é inserido no DOM. O destaque vem da âncora já persistida por bloco (`page + itemStart/itemEnd`) e de uma estimativa da linha pela fração de caracteres do token dentro do bloco (`src/domain/documents/pdfLocator.ts`). Por isso a interface diz explicitamente que o destaque é **aproximado** e não marca a palavra exata (AGENTS.md §6: guiado não é overlay preciso sobre a página PDF). Nada muda no conteúdo versionado, no cursor ou no schema.
5. **Worker dedicado** (`src/infrastructure/pdf/pdfPageRenderer.ts`): o mapa usa `PDFWorker.create({ port })` com um Worker do Vite (`?worker`), para a renderização não disputar a thread principal com o relógio do RSVP. Usa as mesmas opções seguras do importador (`isEvalSupported: false`, `disableFontFace: true`, `enableXfa: false`). O painel é carregado sob demanda (`React.lazy`) e só aparece em documentos `pdf`.
6. **Interação**: navegar pelas páginas do mapa não altera o cursor. "Ler desta página" só aparece com a leitura pausada e posiciona o cursor no primeiro token da página escolhida (ou da próxima com texto). Ao iniciar a reprodução, o mapa volta a acompanhar o cursor.

## Consequências e limites

- O destaque depende de a ordem dos itens do PDF.js ser a mesma da importação (mesma versão de `pdfjs-dist`). Se houver divergência, o mapa ainda mostra a página certa, e o destaque é descartado quando os índices não existem.
- O build passa a emitir dois chunks de worker do PDF.js (o do importador, que roda na thread principal, e o worker dedicado do mapa). Isso soma cerca de 1,2 MB ao precache offline. Unificar os dois é uma melhoria possível.
- Páginas sem texto extraído (PDF misto) aparecem no mapa sem destaque.
- EPUB e texto colado não têm mapa.

## Verificação

- Unitário: `tests/unit/pdfLocator.test.ts` (5 casos).
- E2E: `tests/e2e/reader-pdf-scan.spec.ts`. Cobre renderização real em canvas, destaque visível, navegação sem alterar o cursor, "Ler desta página", ausência de requisições externas, **imagem do PDF visível no mapa** (nova fixture FX-04i) e ausência do mapa em texto colado.
- Pendente: aceite visual do usuário e uso em aparelho físico.
