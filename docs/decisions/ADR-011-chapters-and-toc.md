# ADR-011 — Sumário e capítulos no leitor

- **Data:** 2026-10-23
- **Status:** Implementado; validação técnica automatizada concluída; teste com livros reais do usuário pendente.

## Contexto

Em livros longos (o usuário vai importar um de 600 páginas), navegar só por página ou pela barra de posição é insuficiente. O usuário aprovou "sumário e capítulos" como próxima melhoria.

## Decisão

- Os capítulos são **derivados em tempo de leitura** a partir do que já está salvo. Nada novo é gravado: sem migração, sem mudança no backup, sem retokenizar (`src/domain/documents/chapters.ts`).
  - **EPUB:** um capítulo por item do spine (âncora `spineIndex` já persistida nos blocos). O título é a primeira linha do capítulo quando tem até 60 caracteres; senão, "Capítulo N".
  - **PDF:** sumário (outline) do arquivo original via `PdfPageRenderer.getOutline()`, até 3 níveis e 1.000 entradas. Os destinos são resolvidos para página, e a página para o primeiro token dela ou da próxima com texto. Links externos do sumário são ignorados, nunca abertos. PDF sem sumário mostra um aviso e mantém o mapa de páginas.
  - Texto colado e TXT não têm capítulos.
- O fim de cada capítulo é o início do próximo de mesmo nível ou superior. O capítulo atual é o mais específico que contém o cursor.
- **Interface:** painel "Sumário" na coluna lateral, com o capítulo atual destacado, progresso por capítulo, contador "n / total" e o nome do capítulo no cabeçalho. Clicar num capítulo faz seek, que pausa a leitura, como os demais saltos.
- **PDF aberto uma única vez:** o hook `usePdfRenderer` passou a ser dono da instância do PDF.js e a compartilha entre o mapa e o sumário. Antes o mapa abria o arquivo sozinho; abrir duas vezes dobraria a memória num arquivo de até 40 MiB.

## Limites

- Sumário de PDF que aponta para páginas sem texto extraído leva à próxima página com texto.
- A qualidade do sumário depende do arquivo: muitos PDFs não têm outline. A detecção heurística de títulos não foi implementada, para não inventar estrutura.

## Verificação

- Unitários: `tests/unit/chapters.test.ts`.
- E2E: `tests/e2e/reader-chapters.spec.ts`. Usa um PDF com outline (nova fixture FX-04o), um PDF sem outline e um EPUB (FX-06); cobre navegação, capítulo atual e o mapa acompanhando o salto.
