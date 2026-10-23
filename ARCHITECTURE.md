# Arquitetura — núcleo web local-first

Versão 1.0 · 21/10/2026. Contratos propostos para implementar os requisitos de [PRODUCT.md](PRODUCT.md).

## 1. Visão geral

Aplicação cliente estática, sem servidor de aplicação. React renderiza a interface; serviços de domínio coordenam importação e sessões; motores puros normalizam texto e controlam apresentação; repositórios Dexie persistem os dados. Workers isolam tarefas pesadas quando compatíveis com a biblioteca. O service worker cuida dos assets da PWA, sem assumir a persistência da biblioteca.

```text
React + Tailwind + shadcn/ui
          |
Casos de uso: importar / ler / avaliar / recuperar
          |
Domínio puro: normalização, tokens, relógio, quiz, métricas
          |
Portas: repositórios / parser / relógio / plataforma / backup
          |
Dexie / PDF.js / epub.js / APIs web / worker / ZIP
```

Direção de dependência: interface → casos de uso → domínio/portas. Adaptadores implementam portas. O domínio não importa React, Dexie, PDF.js, epub.js, Tauri ou Capacitor.

Não criar monorepo ou servidor por antecipação. Usar um projeto Vite com diretórios bem delimitados; extrair pacotes compartilhados somente se a fase nativa demonstrar necessidade.

## 2. Stack e responsabilidades

| Componente | Responsabilidade | Limite |
| --- | --- | --- |
| React + TypeScript estrito | Telas, componentes, composição de hooks. | Componentes não implementam temporizador ou cálculo de métricas. |
| Vite | Desenvolvimento e build cliente. | Confirmar Node e plugins compatíveis na F0. |
| Tailwind CSS | Tokens visuais e estilos responsivos. | Usar integração correspondente à versão instalada. |
| shadcn/ui | Componentes locais acessíveis de base. | Revisar foco, semântica e personalização; instalar somente o necessário. |
| Zustand | Estado transitório do leitor, filtros, diálogos e rascunhos. | Não é a fonte durável da biblioteca ou do histórico. |
| Dexie/IndexedDB | Biblioteca, textos, progresso, sessões, quiz e preferências. | Não garante permanência contra limpeza/evicção. |
| PDF.js (`pdfjs-dist`) | Extrair texto de PDFs suportados e fornecer worker. | Sem OCR nem garantia de ordem de leitura. |
| epub.js (`epubjs`) | Interpretar pacote, spine e conteúdo de EPUB local. | Sem DRM, script, rede ou renderização arbitrária de XHTML. |
| Plugin PWA para Vite | Manifesto, service worker e precache. | Não colocar arquivos pessoais no cache de assets. |
| Vitest + Testing Library | Domínio, repositórios e componentes críticos. | Mocks não provam suporte real de navegador. |
| Playwright | Fluxos em navegador, produção/offline e atualizações. | Emulação não substitui Android/iOS físicos. |

Dependências de apoio propostas: validador de esquemas como Zod e biblioteca ZIP com descompressão incremental limitada, como fflate. Declarar dependências diretas quando usadas diretamente; não depender acidentalmente de pacote transitivo do epub.js. Confirmar APIs/licenças na F0 e registrar em decisão técnica.

As referências oficiais estão em [SOURCES.md](SOURCES.md). Nenhum número de versão não verificado deve ser usado como promessa de compatibilidade. Registrar versões exatas e lockfile na implementação.

## 3. Estrutura proposta do projeto implementado

```text
src/
  app/                 # bootstrap, rotas, providers, limites de erro
  components/ui/       # componentes shadcn locais
  features/
    library/           # lista, busca, importação e prévia
    reader/            # RSVP, guiado e controles
    training/          # catálogo de exercícios e quiz
    history/           # sessões e tentativas reais
    settings/          # preferências, espaço e backup
  domain/
    documents/         # normalização, tokens e âncoras
    reading/           # estado, relógio, pontuação e métricas
    comprehension/     # perguntas, respostas e pontuação
  application/         # casos de uso e portas
  infrastructure/
    db/                # Dexie, schema, migrações, repositórios
    importers/         # txt, pdf, epub, pré-validação
    backup/            # manifesto, hashes, exportação/restauração
    platform/          # web agora; adaptadores nativos depois
  workers/             # extração, hashing e ZIP quando viável
  content/training/    # textos originais e quizzes versionados
  shared/              # erros tipados e utilitários pequenos
public/                # ícones, assets e recursos offline necessários
tests/
  unit/
  integration/
  e2e/
  fixtures/
docs/
  decisions/
  evidence/
  HANDOFF.md
```

Evitar `shared` como depósito genérico. Rotas propostas: `/library`, `/reader/:documentId`, `/training`, `/quiz/:attemptId`, `/history` e `/settings`. Escolher roteamento compatível com hospedagem estática e documentar fallback de navegação; testar deep link online e offline. Uma rota inexistente deve recuperar navegação sem apagar dados.

## 4. Modelo persistido

IDs UUID gerados localmente; timestamps ISO UTC para registros, exibidos no fuso do dispositivo. Durações usam relógio monotônico enquanto o processo está ativo, sem subtrair timestamps de parede para medir leitura.

| Entidade / store | Campos essenciais | Índices e regras |
| --- | --- | --- |
| `documents` | id, title, format, sourceHash, contentVersionId, createdAt, updatedAt, lastOpenedAt, warnings, isTraining | `id`, `sourceHash`, `lastOpenedAt`, `title`; metadados leves. |
| `sourceFiles` | documentId, blob, originalName, mime, byteSize, sha256 | `documentId`; original imutável. Texto colado gera Blob UTF-8. |
| `contents` | id, documentId, normalizationVersion, tokenizerVersion, normalizedText, blocks, tokenCount, contentHash | `id`, `documentId`; snapshot imutável para posição e quiz. |
| `tokenChunks` | contentVersionId, chunkIndex, tokens | chave composta; até 2.000 tokens por chunk proposto. |
| `progress` | documentId, contentVersionId, cursor, completed, updatedAt, revision | `documentId`; cursor é token ainda não concluído ou `tokenCount` no final. |
| `sessions` | id, documentId, contentVersionId, status, modeSegments, startedAt, endedAt, activeMs, presentedCount, coverageRanges, settingsChanges, cursor, checkpointRevision | `id`, `documentId`, `startedAt`; atualizações idempotentes. |
| `questionSets` | id, contentVersionId, version, questions, source, reviewStatus | `id`, `contentVersionId`; questões e evidências locais. |
| `quizAttempts` | id, sessionId, questionSetId, questionSetVersion, answers, status, correctCount, totalCount, submittedAt, repeated | `id`, `sessionId`, `submittedAt`; envio final único. |
| `reflections` | id, sessionId, text, updatedAt | `id`, `sessionId`; sem nota automática. |
| `settings` | key, value, schemaVersion | `key`; validar por esquema e limites. |
| `leases` | key, ownerId, expiresAt, revision | `key`; exclusão mútua de sessão e operações de manutenção. |
| `bookmarks` (schema v2) | id, documentId, contentVersionId, tokenIndex, excerpt, note, createdAt, updatedAt | `id`, `documentId`, `[documentId+tokenIndex]`, `createdAt`; removidos junto com o documento; incluídos no backup a partir do v2 (ADR-015). |

`leases` é operacional: não exportar nem restaurar locks ativos. Seeds de treino têm IDs e versões estáveis; atualização não sobrescreve snapshots usados por tentativas existentes. `reviewStatus` diferencia material produzido pelo agente e material conferido pelo usuário, sem fingir uma revisão que não ocorreu.

### 4.1 Contratos mínimos de domínio

```ts
type Token = {
  index: number;
  text: string;
  start: number; // offset UTF-16 inclusivo no texto normalizado
  end: number;   // offset UTF-16 exclusivo
  blockId: string;
  boundary: 'none' | 'clause' | 'sentence' | 'paragraph';
};

type ReadingCursor = {
  contentVersionId: string;
  tokenIndex: number; // 0..tokenCount; tokenCount = fim
};

type SourceAnchor =
  | { kind: 'text'; originalStart: number; originalEnd: number }
  | { kind: 'pdf'; page: number; itemStart: number; itemEnd: number }
  | { kind: 'epub'; spineIndex: number; href: string; blockPath: string };

type ImportIssue = {
  code: string;
  severity: 'warning' | 'error';
  message: string;
};
```

Esses tipos são contratos ilustrativos, não uma implementação pronta. Âncoras de origem pertencem aos blocos. Para PDF, página é 1-based e faixa de itens é convenção interna versionada; não alegar equivalência com bbox de palavra. Para EPUB, `href` deve ser caminho interno validado. CFI pode ser adicionado posteriormente; o cursor canônico do MVP é sempre `contentVersionId + tokenIndex`.

### 4.2 Regras de persistência

- Repositórios são a única camada que conhece stores Dexie. UI não escreve diretamente no banco.
- Commit da importação escreve metadados, original, conteúdo, tokens e progresso em uma transação curta. Parsing/hashing ocorrem antes dela; não manter transação aberta aguardando APIs externas.
- Erro no commit reverte tudo. Rascunhos ficam transitórios e não aparecem na biblioteca.
- Checkpoint grava sessão e progresso na mesma transação. Contadores são totais do snapshot com revisão crescente, não incrementos reaplicados a cada retry.
- Não gravar por palavra. Manter o motor em memória e persistir no máximo a cada 2 s, mais transições explícitas.
- Deletar documento remove relacionamentos na mesma transação. Treinos podem ser reinstalados pelo catálogo, mas apagar um treino também remove suas tentativas após confirmação.
- Migrações Dexie são explícitas e testadas com fixture de versão anterior. Nunca usar `deleteDatabase` como solução automática. Histórico: v1 (MVP); v2 (23/10/2026) adiciona `bookmarks`, migração aditiva sem `upgrade()` (ADR-015). A restauração aceita backups de schema v1 e v2.
- Se versão do banco for superior à suportada, abrir estado de incompatibilidade sem escrever ou apagar. Oferecer retorno à versão compatível, sem fingir backup novo se a base não puder ser lida com segurança.

### 4.3 Duas abas e concorrência

No MVP há **uma única sessão de leitura ativa por origem**, mesmo que sejam documentos distintos. Adquirir lease em transação Dexie antes de reproduzir; heartbeat a cada 2 s; vencimento proposto de 10 s. `ownerId` é único por aba. Antes de checkpoint e avanço, validar propriedade e revisão. Ao perder lease ou encontrar conflito, pausar e invalidar callbacks pendentes.

`BroadcastChannel`, quando disponível, avisa as abas; não é a garantia de exclusão. Ao ocultar a aba, pausar, confirmar checkpoint e liberar lease quando possível. Se a gravação falhar, não iniciar reprodução em outra aba até reconciliação ou expiração segura. Aba suspensa verifica lease antes de qualquer avanço ao retornar.

Backup/restauração/exclusão usam lock de manutenção e recusam execução durante leitura ativa. A segunda aba pode navegar pela biblioteca em modo de leitura de dados, mas não sobrescrever progresso ou executar manutenção concorrente.

## 5. Pipeline de importação

```text
seleção → validação superficial → hash do original → duplicata?
        → extração limitada → normalização → tokenização
        → avisos + prévia → confirmação → transação → biblioteca
```

1. Conferir tamanho antes de ler o arquivo completo; aceitar apenas formatos definidos. Detectar incompatibilidade de assinatura/estrutura com mensagem específica.
2. Calcular SHA-256 local para duplicata. Hash igual oferece abrir existente. Arquivo diferente com mesmo texto não é automaticamente fundido. Para texto colado, hashear os bytes UTF-8 originais.
3. Gerar `jobId` e `AbortSignal`; atualizar estágio, sem percentual falso. Quando o total de páginas/itens é conhecido, mostrar progresso real desse estágio.
4. Extrair com limites **durante** o processamento, além das verificações antecipadas. Cancelamento termina trabalho/worker e ignora resultados tardios pelo `jobId`.
5. Produzir blocos, âncoras, texto e avisos. A prévia permite navegar por páginas/capítulos, não só ler o primeiro parágrafo.
6. Normalizar e tokenizar com versão fixa; validar limites finais. Rejeitar texto sem tokens.
7. Pedir confirmação do conteúdo extraído, guardar original e snapshot. Não modificar silenciosamente a extração depois de uma sessão ou quiz.

### 5.1 TXT e texto colado

TXT UTF-8 com ou sem BOM; detectar bytes inválidos e avisar em vez de trocar acentos silenciosamente. Outras codificações não são garantidas no MVP. Preservar parágrafos, normalizar quebras de linha e Unicode NFC, remover controles não imprimíveis exceto separadores úteis. Texto colado é interpretado como texto literal, nunca HTML executável.

### 5.2 PDF.js

Carregar bytes locais por `getDocument`, com worker do mesmo pacote/build servido localmente. Extrair páginas sequencialmente ou com concorrência pequena e limitada; liberar cada página ao concluir. Cancelar e destruir `loadingTask`/documento ao sair.

Usar `getTextContent` e posições dos itens para agrupar linhas/blocos com heurística documentada. Ordem de itens não é garantia semântica. Não eliminar cabeçalhos, hifens de fim de linha ou notas agressivamente no MVP; preferir aviso a perda de conteúdo. Identificar página sem texto e avisar sobre documentos mistos; documento totalmente sem texto falha com "sem camada de texto; OCR não incluído".

Não renderizar formulários, anexos, ações ou JavaScript do PDF. Não executar links extraídos. Empacotar recursos de fonte/CMap/WASM que a versão escolhida exigir; verificar sua presença no teste offline, sem CDN. PDFs com senha recebem erro de formato não suportado nesta versão, sem coleta de senha no MVP.

### 5.3 epub.js

Pré-validar o ZIP antes de entregar conteúdo ao adaptador epub.js. Rejeitar caminhos absolutos, `..`, entradas duplicadas conflitantes, criptografia/DRM detectada e layout fixo. Não extrair arquivos no sistema operacional. Impor limites de entradas, bytes por entrada e bytes reais expandidos; cancelar descompressão ao exceder o teto, sem confiar só no tamanho declarado no cabeçalho.

Processar spine na ordem declarada, preservando fronteiras de capítulos. O carregador do adaptador resolve **apenas entradas do arquivo local**. Recusar referências externas, `javascript:`, entidades externas e qualquer fallback de fetch. Não usar a URL de um capítulo como autorização para acesso à rede.

MVP usa epub.js para estrutura/spine e obtenção de conteúdo, mas extrai **somente texto e blocos** para o leitor próprio. Nunca inserir XHTML do EPUB no DOM vivo por `innerHTML` ou `dangerouslySetInnerHTML`. Se o parser da biblioteca demandar DOM, usar documento inerte sanitizado/isolamento apropriado, removendo scripts, handlers, frames, objetos, estilos e referências carregáveis antes de qualquer inserção. Não ativar `allowScriptedContent`.

A F0 deve provar com fixture hostil que abrir o livro não executa código nem carrega recursos externos. Se a versão disponível do epub.js não permitir cumprir isso diretamente, registrar o bloqueio e implementar o carregamento local isolado antes de declarar suporte. Não resolver o teste simplesmente desabilitando EPUB ou liberando CSP/rede.

### 5.4 Normalização e tokenização

Criar `normalizationVersion = 1` e `tokenizerVersion = 1`. O texto canônico tem offsets UTF-16; não misturar com bytes UTF-8 ou índices de code points. Preservar mapa por bloco para a fonte.

Regra inicial: separar por espaços Unicode, preservar pontuação adjacente, ignorar segmentos sem letras/números como palavras de contagem e associar pontuação isolada ao token vizinho quando possível. Definir casos de emoji, aspas, travessão, hífen, número decimal e abreviação em fixtures. NFC acontece antes de gerar offsets.

Não depender da variação de `Intl.Segmenter` entre navegadores para o cursor persistido. Se utilizado em heurísticas, persistir o resultado e versão, nunca retokenizar automaticamente em cada abertura. Novo algoritmo gera nova versão de conteúdo mediante ação explícita; progresso e quiz antigos continuam vinculados ao snapshot anterior. Editor do texto importado fica fora do MVP; correções podem ser coladas como novo documento.

## 6. Motor de leitura

### 6.1 Máquina de estados

```text
loading → ready(paused) → playing ↔ paused → completed
              |             |         |
              └─────────────┴─────────┴→ error
```

`ended` e `interrupted` pertencem ao ciclo de sessão persistida, não a um segundo temporizador. Iniciar nova sessão cria ID; pausa mantém a sessão; terminar encerra; reabrir uma sessão interrompida oferece retomá-la pausada sem contar o intervalo fechado. Recomeçar texto concluído cria nova sessão e mantém a anterior.

### 6.2 Relógio e cursor

- Motor puro recebe porta `Clock` (`now`, `schedule`, `cancel`), fonte de tokens e callbacks. Em produção, `performance.now` e temporização cancelável; em teste, relógio simulado.
- `cursor` aponta para o token cujo tempo de exposição ainda não foi concluído. Preview pausada pode mostrá-lo, mas isso não aumenta métricas.
- Ao iniciar, mostrar o token atual e agendar sua duração. Ao completar a exposição, registrar apresentação/intervalo coberto, avançar cursor e mostrar o próximo.
- Pausar no meio de uma exposição mantém o cursor; retomar reapresenta esse token por uma duração completa. Tempo parcial ativo fica registrado, mas a apresentação incompleta não é contada como concluída.
- Duração-base = `60.000 / PPM` ms. Multiplicadores de pontuação seguem RF-03; atraso extra faz a PPM observada ser inferior à configurada.
- Alteração de PPM vale na próxima exposição. Seek ou mudança de modo pausa e cancela o agendamento atual; seek não gera leitura de tokens saltados.
- Manter um único agendamento ativo. Token de geração invalida callback antigo depois de pausa, remount React, seek ou mudança de documento.
- Não usar `setInterval` cego nem loops para recuperar vários tokens atrasados. Se o callback atrasar, mostrar o próximo token e dar a ele sua duração integral; nunca saltar palavras para alcançar o relógio.
- `visibilitychange` para hidden pausa imediatamente; ao voltar, não retomar sem gesto. `pagehide` tenta checkpoint, mas não é garantia de gravação. Checkpoints periódicos são a recuperação principal.
- Suspensão longa detectada por salto do relógio em primeiro plano: se atraso exceder 1 s ou três durações previstas, pausar como interrupção e não somar o excesso ao tempo ativo. Registrar somente o intervalo esperado até a interrupção detectável; não afirmar precisão durante suspensão do sistema.
- Ao concluir o último token, `cursor = tokenCount`, tempo para, sessão é finalizada uma vez e aparece resumo. Não iniciar quiz automaticamente sem ação.

### 6.3 Métricas verificáveis

| Métrica | Definição |
| --- | --- |
| `activeMs` | Soma dos intervalos em `playing`, incluindo pausas planejadas de pontuação; exclui pausa, segundo plano e quiz. |
| `presentedCount` | Exposições de tokens concluídas; repetições contam novamente e são identificáveis. |
| `coverageRanges` | União de intervalos de índices concluídos na sessão; permite contar tokens únicos sem inflar por repetição. |
| PPM observada | `presentedCount × 60.000 / activeMs`; exibir "—" quando tempo for zero; explicitar que mede apresentação. |
| Progresso | `cursor / tokenCount × 100`; posição atual, pode diminuir ao retroceder; não é cobertura vitalícia. |
| Compreensão | `correctCount / totalCount × 100` somente em tentativa enviada de quiz objetivo. |

Exemplo controlado: 100 tokens, 300 PPM, sem pontuação e sem atrasos → 20.000 ms, 100 apresentações, PPM observada 300. Reapresentar dez tokens aumenta apresentações para 110, cobertura permanece em no máximo 100. Pular diretamente ao final não produz 100 tokens de cobertura nem marca a sessão como leitura integral.

Persistir segmentos de modo, mudanças de velocidade e status para interpretar a sessão. Não chamar média de velocidades configuradas de PPM observada. Não inferir compreensão a partir do cursor.

## 7. RSVP e guiado na interface

Ambos consomem o mesmo cursor e motor. O guiado renderiza blocos do texto normalizado, com contexto suficiente ao redor do token. Carregar chunks sob demanda; para textos longos, janela de blocos com navegação acessível e destaque sem mover o cursor por mudanças de layout.

Rolagem programática somente para trazer destaque à área visível, sem disputar rolagem manual. Movimento reduzido usa salto discreto; interação manual pausa. RSVP com ponto focal destacado é opcional e não deve ter alegação de eficácia. Tamanho deve acomodar tokens longos; teste acentos, números e palavras extensas.

Zustand mantém estado transitório coerente com o motor; React não precisa re-renderizar a biblioteca inteira a cada token. Cleanup de efeitos deve resistir ao StrictMode sem duplicar relógio, listeners ou sessão.

## 8. Compreensão e exercícios

QuestionSet é vinculado a um snapshot de texto. Cada questão tem ID estável, enunciado, quatro alternativas com IDs, uma alternativa correta, explicação e intervalo-fonte. Validar referências na carga e no backup. Não embaralhar sem persistir a ordem da tentativa; MVP pode manter ordem fixa.

Criar tentativa em `draft`; salvar resposta selecionada; enviar em operação idempotente que calcula e persiste o resultado de uma vez. Bloquear reenvio/edição do resultado final. Se recarregar no rascunho, retomar respostas sem mostrar gabarito. Se abandonar, permitir continuar ou descartar a tentativa, sem transformar abandono em 0%.

Conteúdos de treino são originais produzidos para o projeto, sem copiar textos protegidos. Incluir revisão do gabarito em evidência. Tentativas repetidas levam flag e aviso de possível familiaridade; não propor progressão automática de dificuldade ou velocidade nesta versão.

## 9. Offline, ciclo de atualização e storage

Configurar manifest com nome provisório, ícones, `start_url`, `scope` e `display`; validar com o build. Precache de shell, rotas necessárias, bundles, exercícios, fontes/ícones e recursos de PDF/EPUB. Nada depende de CDN ou fonte externa em runtime. Lazy imports devem ser incluídos no plano offline, não apenas carregados por acaso na máquina do desenvolvedor.

O service worker não lê IndexedDB para alimentar cache de documentos. Atualizações usam aviso: persistir checkpoint, aguardar usuário fora da reprodução e recarregar. Se migração falhar, preservar banco e mostrar recuperação; não repetir reload em loop. Testar build A → B com sessão e dados existentes.

IndexedDB é ligado à origem/perfil. Manter porta/origem local estáveis no desenvolvimento para não parecer que os dados desapareceram. Mudança de hostname, HTTPS, porta ou app nativo pode criar outra base. Documentar transferência manual.

`navigator.storage.estimate()` informa estimativa, não capacidade garantida. `persist()` é uma ação contextual em configurações e pode ser recusada ou não existir. Tratar `QuotaExceededError`, mostrar espaço estimado e permitir exportar/remover itens. Negar persistência não impede leitura. Navegação privada pode ter limitações e deve receber mensagem quando armazenamento não estiver disponível.

Instalação é melhoria progressiva. Em navegadores sem evento/botão de instalação, mostrar instrução correspondente quando conhecida e validada; sem botão falso. HTTPS em ambiente real e localhost para desenvolvimento são os caminhos previstos. Ver [MDN sobre instalação](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing).

## 10. Backup completo e restauração segura

Formato proposto: `.reading-backup.zip` com `manifest.json`, entidades JSON versionadas e originais binários. Nunca serializar Blob como objeto JSON vazio; incluir arquivos binários de fato. Tokens e snapshots são exportados para evitar mudança de cursor por retokenização em outro navegador.

Manifesto contém `formatVersion`, `appVersion`, `dbSchemaVersion`, data UTC, IDs, tamanhos, algoritmos de normalização/tokenização e SHA-256 por entrada. Hash detecta corrupção; não é assinatura de autenticidade nem proteção contra alguém que recalcula o manifesto. Backup é texto/arquivo legível e **sem criptografia no MVP**; informar isso na exportação.

Limites propostos: ZIP comprimido até **150 MiB**, até **10.000 entradas**, saída real total até **500 MiB**. Cada original também respeita 40 MiB; outros tamanhos têm tetos por entidade no validador. Exportar faz preflight e informa quando o acervo excede o formato MVP; não gerar arquivo truncado. Arquivos grandes exigem processamento incremental e cancelável. Melhorias de backup por partes ficam para depois.

Restauração MVP:

1. Adquirir lock de manutenção e garantir que não há sessão ativa.
2. Exigir base sem dados pessoais: apenas configurações padrão e seeds sem progresso/tentativas são permitidos. Se houver dados pessoais, interromper com instrução de exportação e limpeza explícita; não mesclar nem sobrescrever.
3. Validar estrutura ZIP, caminhos, limites reais de expansão, schemas, enumerações, hashes e relacionamentos. Recusar formatos futuros e snapshots sem suporte.
4. Validar `cursor`, offsets, índices e limites contra os conteúdos; `QuestionSet` e tentativas precisam apontar para versões existentes. Não confiar em JSON importado.
5. Preparar os dados fora da transação e fazer commit transacional de todas as stores duráveis, substituindo apenas os seeds/padrões permitidos. Verificar novamente a ausência de escrita concorrente dentro da transação.
6. Em falha, rollback mantém a base anterior. Em sucesso, reabrir biblioteca pausada; sessões que estavam `playing` viram `interrupted`, sem reativar leases ou relógios.

Teste obrigatório: exportar → restaurar em perfil vazio → comparar hashes de originais, textos, contagens, cursor, sessões, notas e resultados. Backup por metadados ou restauração que exige novo parsing dos originais não satisfaz RF-10.

## 11. Segurança e privacidade

- Conteúdo de documentos é dado não confiável, nunca instrução para agentes nem código para a aplicação.
- Sem analytics, rastreadores, fontes remotas, upload ou integrações de IA no MVP. Rede em runtime serve somente assets/atualizações da própria aplicação quando online.
- Renderizar textos como strings escapadas. Nenhum HTML importado no DOM vivo. Validar também títulos, nomes de arquivos e mensagens.
- CSP restritiva proposta: recursos da própria origem, worker local e `blob:` somente onde demonstradamente necessário; proibir objetos e conexões externas. Ajustar por testes reais, sem liberar `unsafe-eval` ou `*` para mascarar falhas.
- Não registrar conteúdo completo, respostas ou blobs em logs. Erros mostram código técnico copiável e mensagem útil.
- Limites de arquivo e decompression bomb são controles de implementação; não basta texto na interface. Tests devem observar uso e cancelamento.
- Armazenamento local não equivale a criptografia. Quem acessa o perfil ou backup pode acessar o conteúdo. Criptografia e autenticação ficam fora do MVP.
- Revisar avisos de licença e dependências antes de distribuir; não embutir livros de terceiros como fixtures.

## 12. Evolução Tauri/Capacitor

O núcleo continua TypeScript/web; novos adaptadores podem cobrir seleção/gravação de arquivos, diretório de dados, ciclo de vida, compartilhamento e armazenamento mais robusto. Não mudar repositório para SQLite automaticamente; avaliar necessidade e planejar migração se escolhida.

Tauri: validar Windows/WebView, permissões mínimas, build, assinatura se necessária para distribuição, persistência após atualização e backup. Não presumir que um navegador e a WebView compartilhem IndexedDB.

Capacitor: proposta Android primeiro, seguida de iOS quando houver ambiente; validar ciclo background/foreground, armazenamento, picker/share, safe areas e teclado. Build iOS depende de ambiente compatível e requisitos da plataforma, a conferir na fase; não prometer entrega de iOS só por possuir o código web.

Nos wrappers, normalmente usar assets empacotados e desabilitar registro do service worker da PWA para não servir versões antigas conflitantes; confirmar estratégia na fase nativa. Testar arquivos/workers no esquema da WebView. Backup manual é a ponte inicial entre PWA, Windows e celular; não há sincronização implícita.

## 13. Erros tipados mínimos

`UNSUPPORTED_FORMAT`, `INVALID_ENCODING`, `FILE_TOO_LARGE`, `LIMIT_EXCEEDED`, `NO_TEXT_LAYER`, `PASSWORD_UNSUPPORTED`, `DRM_UNSUPPORTED`, `FIXED_LAYOUT_UNSUPPORTED`, `CORRUPT_FILE`, `EXTERNAL_RESOURCE_BLOCKED`, `IMPORT_CANCELLED`, `IMPORT_TIMEOUT`, `STORAGE_UNAVAILABLE`, `STORAGE_FULL`, `DB_VERSION_UNSUPPORTED`, `SESSION_LOCKED`, `BACKUP_INVALID`, `BACKUP_VERSION_UNSUPPORTED`, `RESTORE_REQUIRES_EMPTY_LIBRARY`.

Preservar causa técnica sem expor conteúdo pessoal. Cancelamento não é apresentado como erro grave. Falha de storage durante leitura pausa e mostra que o checkpoint não foi salvo; não continuar exibindo "salvo".
