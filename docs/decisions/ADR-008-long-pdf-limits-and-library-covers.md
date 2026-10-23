# ADR-008 — Limites para livros PDF longos e capas na biblioteca

- **Data:** 2026-10-23
- **Status:** Implementado; validação técnica automatizada concluída; teste com o livro real do usuário pendente.

## Contexto

O usuário quer importar um PDF de 600 páginas e ver a capa de cada documento na biblioteca. O default P07 (300 páginas, 1.000.000 de unidades UTF-16, 200.000 tokens, timeout de 60 s) bloqueava esse livro em mais de um ponto: um livro de 600 páginas tem tipicamente 180–300 mil palavras.

## Decisões

1. **Limites (P07 revisado):** `MAX_PDF_PAGES = 1.000`, `MAX_NORMALIZED_UTF16_LENGTH = 3.000.000`, `MAX_TOKEN_COUNT = 500.000` e `IMPORT_TIMEOUT_MS = 180.000`. O limite de **40 MiB por arquivo foi mantido** (decisão anterior do usuário); PDFs longos com muitas imagens podem passar disso. Os limites continuam valendo durante a leitura do arquivo, e os testes seguem usando limites configuráveis (`limite-1/limite/limite+1`).
2. **Capa:** primeira página do arquivo original preservado, desenhada com PDF.js em worker dedicado quando o cartão entra na tela (`IntersectionObserver`). As capas são geradas uma de cada vez e guardadas só em memória (object URL) durante a sessão (`src/infrastructure/pdf/pdfCoverService.ts`). Nenhum dado novo vai para o Dexie: a capa é derivada do original, então não há migração de schema nem mudança no formato de backup. Formatos sem página visual (texto colado, TXT, EPUB) recebem uma capa tipográfica gerada. Toda capa mostra uma barra de progresso de leitura.

## Consequências

- Livros grandes ocupam mais IndexedDB (tokens em chunks de 2.000) e mais memória no leitor, que carrega todos os tokens. No celular isso precisa de validação em aparelho físico.
- A capa é refeita a cada carregamento da biblioteca. Para cada PDF visível, o app lê o binário inteiro, até 40 MiB. Guardar a capa no banco seria uma otimização futura, mas exigiria migração de schema e decidir se ela entra no backup.
- A importação de PDF ainda roda o PDF.js na thread principal (comportamento da F2). Num livro real e pesado, a interface pode ficar lenta durante a extração.

## Verificação

- `tests/e2e/pdf-long-book.spec.ts`: PDF sintético de 600 páginas com 181.200 tokens (fixture FX-04L), importado, salvo, com capa gerada e aberto no leitor, com o mapa indicando "/ 600", no Chrome desktop. Tempo medido no log do teste: menos de 1,5 s. É um PDF sintético leve; **não é uma medida de livros reais com fontes embutidas e imagens**.
- `tests/e2e/reader-pdf-scan.spec.ts`: a capa da FX-04i contém a figura do PDF; texto colado mostra a capa tipográfica.
