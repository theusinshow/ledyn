# ADR-015 — Marcadores, busca no documento e schema v2

- **Data:** 2026-10-23
- **Status:** Implementado; validação técnica automatizada concluída; uso real pelo usuário pendente.

## Contexto

Para livros longos, o usuário aprovou marcadores com nota e busca dentro do documento. A busca não precisa gravar nada. Os marcadores são dados pessoais duráveis, então exigem uma tabela nova no banco, uma migração explícita e cobertura no backup.

## Decisão

### Busca (sem persistência)

- `domain/documents/textSearch.ts`: o texto normalizado é "dobrado" para minúsculas e sem acentos, mantendo o mesmo comprimento UTF-16. Os offsets encontrados valem direto no conteúdo versionado, e o token é localizado por busca binária. Consulta mínima de 2 caracteres, até 200 resultados, com trecho de contexto.
- Medido num texto de 3,12 milhões de caracteres: preparar a busca leva ~170 ms (uma vez, ao abrir); cada consulta leva ~3 ms.
- Interface: diálogo aberto pela tecla `/` ou pelo botão "Buscar". Enter vai ao primeiro resultado; clicar num resultado faz seek (pausado).

### Marcadores (schema v2)

- `BookmarkRecord { id, documentId, contentVersionId, tokenIndex, excerpt, note, createdAt, updatedAt }`, ancorado no cursor canônico (`contentVersionId + tokenIndex`).
- **Dexie v2:** `bookmarks: 'id, documentId, [documentId+tokenIndex], createdAt'`. Migração **aditiva**, sem `upgrade()`; os dados existentes não são tocados. `DB_SCHEMA_VERSION = 2`. Uma base v1 abre normalmente; uma base de versão futura continua bloqueada sem apagar nada (comportamento anterior preservado).
- **Repositório:** `addBookmark` (um por token: repetir no mesmo ponto devolve o existente; valida documento e versão de conteúdo), `listBookmarks` (em ordem do texto), `updateBookmarkNote` (até 2.000 caracteres), `deleteBookmark`. Os marcadores são removidos na mesma transação de `deleteDocumentTransactional` e de "limpar dados locais", e contam como dado pessoal para a regra de restaurar só em biblioteca vazia.
- **Backup:** exporta `data/bookmarks.json` e `counts.bookmarks`. Na restauração:
  - aceita `dbSchemaVersion` 1 e 2 (`SUPPORTED_BACKUP_DB_SCHEMA_VERSIONS`); backups v1 restauram com zero marcadores;
  - a partir do v2, o arquivo de marcadores é obrigatório e validado por Zod;
  - um marcador duplicado, ou apontando para documento, versão ou posição inexistente, recusa o backup inteiro, sem gravar nada.
- **Interface:** painel "Marcadores" na coluna lateral do leitor, agora presente em todos os formatos. Tecla `M` ou botão "+ Marcar" marca o ponto atual. Cada marcador permite ir até ele, anotar e remover, e a lista pode ser exportada em Markdown (download local).

## Compatibilidade

- Backups gerados por esta versão (schema v2) não restauram em versões anteriores do app, que só aceitavam o v1. É o mesmo comportamento já documentado para versões futuras.

## Verificação

- Integração (`tests/integration/bookmarks-and-schema-v2.test.ts`): base v1 real (Dexie só com o schema v1, com dados) aberta pela v2 sem perda; regras do repositório; exclusão em cascata; ida e volta do backup v2 com marcadores; backup v1 reescrito restaurando com zero marcadores; marcador adulterado (hash recalculado) recusado sem gravar nada.
- Unitários: `tests/unit/textSearch.test.ts`.
- E2E: `tests/e2e/search-and-bookmarks.spec.ts`.
