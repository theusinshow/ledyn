# Critérios de aceite e plano de verificação

Versão 1.0 · 21/10/2026. **Todos os cenários estão planejados, não executados na aplicação.** Este pacote contém documentação, sem código do produto.

## 1. Como usar esta matriz

Cada cenário AC-01 a AC-35 é P0 para o MVP, no escopo de plataforma definido abaixo. Registrar `APROVADO`, `FALHOU`, `NÃO EXECUTADO` ou `NÃO APLICÁVEL` com justificativa específica. Falta de equipamento não é aprovação nem torna um requisito aplicável automaticamente não aplicável.

Usar testes unitários para regras puras, integração para transações/relacionamentos, E2E para fluxos reais e teste manual para instalação/aparelhos/acessibilidade. Uma captura de tela não comprova persistência ou precisão do relógio. Um teste mockado não comprova comportamento do parser/IndexedDB no navegador.

Todos os critérios P0 aplicáveis precisam passar antes de declarar gate técnico concluído. Aceite de conforto/adequação pelo usuário e revisão dos textos/gabaritos têm status separado.

### Matriz mínima de ambiente proposta

| Ambiente | Cobertura | Status inicial |
| --- | --- | --- |
| Windows + Chrome ou Edge estável | Fluxos completos, teclado, offline, instalação e atualização. | Não executado. |
| Android + Chrome estável em aparelho físico | Toque, importação local, offline, instalação, orientação e retomada. | Não executado. |
| Chromium automatizado | E2E e regressão em viewports desktop/móvel. | Não executado. |
| Firefox desktop | Smoke funcional web e detecção de incompatibilidade; instalação pode não se aplicar. | Não executado. |
| Safari/iOS em aparelho físico | Smoke web, instalação quando disponível, armazenamento e ciclo de vida. Exigido antes de declarar iOS validado. | Não executado. |

O MVP pode ter suporte validado inicialmente em Windows/Android e iOS explicitamente pendente. Emulação móvel não será descrita como validação de aparelho físico. Registrar versões reais no momento da execução.

## 2. Corpus de fixtures a criar na implementação

Todas sintéticas, originais ou de licença compatível. Não precisam conter dados pessoais.

| ID | Fixture | Uso |
| --- | --- | --- |
| FX-01 | Texto determinístico de 100 tokens sem pontuação; checksum fixo. | Relógio 300 PPM / 20 s. |
| FX-02 | Português com NFC/NFD, aspas, hífens, decimais, abreviações, parágrafos, emoji e palavra longa. | Offsets, tokenização e pontuação. |
| FX-03 | TXT UTF-8, BOM, bytes inválidos e arquivo vazio. | Encoding e vazio. |
| FX-04 | PDF textual simples de 3 páginas, com ordem conhecida. | Extração e âncoras. |
| FX-05 | PDF escaneado, misto, duas colunas, com senha e corrompido. | Limites e avisos; sem OCR. |
| FX-06 | EPUB reflowable de 3 capítulos e sumário local. | Ordem do spine e retomada. |
| FX-07 | EPUB com script, handler, recurso remoto, path traversal, metadado fixed-layout, DRM detectável e arquivo inválido. | Rejeição/isolamento; nenhuma rede/script. |
| FX-08 | Arquivos no limite e acima; ZIP com tamanho declarado falso e expansão controlada acima do teto. | Limites reais sem fixture que esgote a máquina. |
| FX-09 | Três textos originais de 300–600 palavras, quatro questões cada e evidência-fonte. | Compreensão e revisão. |
| FX-10 | Base anterior com documento, progresso, sessão e tentativa. | Migração e integridade. |
| FX-11 | Backups válido, adulterado, versão futura, relação órfã, cursor fora de faixa e original ausente. | Restauração e rollback. |
| FX-12 | Biblioteca sintética de 200 metadados e texto longo dentro dos limites. | Lista e renderização. |

Fixtures hostis devem ser pequenas/controladas: não é necessário consumir 500 MiB para provar que a contagem incremental de um teto configurável funciona. Depois testar limites de produção com cuidado e registrar recursos usados.

## 3. Casos de aceite

### AC-01 — Texto colado e biblioteca (RF-01/RF-02)

**Dado** biblioteca sem dados pessoais, **quando** colar FX-02, preparar, conferir e confirmar, **então** surge um documento com título e contagem reais; original UTF-8, snapshot e tokens estão persistidos. Recarregar mantém o item e abrir começa pausado. Espaços vazios não habilitam importação.

**Verificação:** integração de repositório e E2E. Renomear/buscar/ordenar sem carregar blobs de todos os itens. Registrar que a contagem segue o tokenizer versionado.

### AC-02 — Commit atômico e rascunho (RF-02)

Cancelar na prévia não adiciona documento. Simular falha de escrita durante commit reverte metadados, original, conteúdo, tokens e progresso. Rascunho permanece disponível na UI até sair; erro não mostra "salvo".

**Verificação:** falha controlada de transação + E2E de cancelamento. Inspecionar ausência de órfãos em todas as stores relacionadas.

### AC-03 — TXT e duplicatas (RF-02)

Importar FX-03 com e sem BOM conserva acentos; bytes inválidos e vazio dão erro específico. Importar o mesmo arquivo novamente oferece abrir existente, sem aumentar a contagem. Dois arquivos distintos com mesmo título não são fundidos pelo título.

**Verificação:** unitário de normalização/hash e E2E com arquivos reais.

### AC-04 — PDF suportado e limites semânticos (RF-02)

FX-04 produz texto e âncoras por página na ordem esperada para a fixture. FX-05 sem camada textual falha com mensagem de OCR fora do escopo; misto indica páginas ausentes; colunas mostram aviso e prévia navegável; senha/corrupção são rejeitadas com clareza.

**Verificação:** parser PDF.js real, sem mock de `getTextContent`, online e offline preparado. Nenhum arquivo aceito é anunciado como semanticamente perfeito por passar no parser.

### AC-05 — EPUB suportado e isolamento (RF-02/RNF-06)

FX-06 conserva ordem dos três capítulos e fronteiras de parágrafo; depois de salvar pode ser reaberto offline. FX-07 não executa script/handler, não carrega imagem/font/iframe/link remoto e não acessa caminho externo. DRM/fixed-layout detectados são rejeitados explicitamente.

**Verificação:** epub.js real e interceptação de rede com contador de execução de script. Testar comportamento do adaptador antes de inserir qualquer conteúdo em DOM vivo. Sem ativar `allowScriptedContent`.

### AC-06 — Ritmo-base determinístico (RF-03)

Com FX-01, 300 PPM e pontuação desligada, 100 exposições completas demandam 20.000 ms no relógio simulado; primeiro token só conta depois de 200 ms e o último recebe duração integral. Resultado: cursor 100, 100 apresentações e PPM observada 300.

**Verificação:** unitário com relógio controlado. Não exigir tempo de parede exatamente igual em um navegador ocupado.

### AC-07 — Um relógio e nenhuma palavra saltada (RF-03)

Executar iniciar/pausar/iniciar rapidamente, remount e StrictMode. Existe no máximo um agendamento ativo. Callback antigo não avança depois de cancelar. Atraso controlado de callback não dispara uma rajada de tokens para compensar.

**Verificação:** unitário do motor e integração do hook React.

### AC-08 — Pausa, retrocesso e seek (RF-03/RF-05)

Pausar no meio da exposição mantém o cursor; retomar reapresenta o token atual por duração completa. Voltar/avançar 10 ou clicar em palavra pausa, limita índice e não conta tokens saltados. Seek até o fim não gera cobertura integral falsa.

**Verificação:** domínio com relógio e E2E de controles.

### AC-09 — Alteração de velocidade (RF-03)

Mudar de 250 para 300 PPM durante reprodução aplica o novo valor à próxima exposição, sem truncar a atual ou criar relógio extra. Valores fora de 100–800 são validados; botões respeitam passos/limites. Registrar mudança na sessão.

**Verificação:** relógio simulado e E2E de slider/campo/botões.

### AC-10 — Pausas de pontuação (RF-03)

Em FX-02, testar clause/sentence/paragraph: pausa = maior entre base × (1,5/2/2,5 − 1) e os mínimos 150/500/750 ms; prevalece a fronteira mais forte. Testar o fator de comprimento (1,15/1,3), a rampa (1,6/1,4/1,2/1,1), a retomada no início da frase só após pausa da sessão e a letra de foco em coluna fixa (ADR-009). Desligar o ritmo inteligente usa fator 1, sem rampa nem recuo. Abreviações e decimais têm comportamento documentado, offsets preservados e nenhum token vazio.

**Verificação:** unitários de classificação e duração, com fixtures explícitas. Aceitar heurística documentada; não afirmar análise linguística universal.

### AC-11 — Segundo plano e suspensão (RF-03/RF-05)

Ocultar a página pausa e tenta checkpoint; voltar continua pausado no token salvo, sem contar tempo oculto. Suspensão longa não gera avanço acelerado nem tempo ativo arbitrário. Encerramento e reabertura não contam o tempo entre processos.

**Verificação:** integração com eventos e teste real de troca de aba/app em Windows/Android; documentar aproximação do relógio em suspensão.

### AC-12 — Mesmo cursor entre modos (RF-04)

No token 37, alternar RSVP/guiado/RSVP deixa o leitor pausado no mesmo `contentVersionId + tokenIndex`, inclusive com pontuação e acentos. Alternância não cria sessão duplicada.

**Verificação:** E2E e asserção do cursor persistido.

### AC-13 — Guiado e rolagem (RF-04)

Durante reprodução, destaque permanece visível com contexto. Rolagem manual e toque em palavra pausam. Scroll programático não é interpretado como gesto manual nem cria um loop de pausa/retomada.

**Verificação:** E2E desktop e toque físico. Não usar coordenada de PDF como se fosse alinhamento de palavra normalizada.

### AC-14 — Layout, fonte e texto longo (RF-04/RNF-02)

Em 360×800, 768×1024 e 1440×900, controles cabem e texto não corta comandos. Girar aparelho, aumentar fonte e usar zoom de 200% preserva cursor. Palavra longa/acentos não somem. FX-12 abre sem criar toda a biblioteca/tokenização em DOM ao mesmo tempo.

**Verificação:** capturas claras/escuras e interação; capturas não substituem asserção de posição.

### AC-15 — Checkpoint e encerramento abrupto (RF-05)

Checkpoint ocorre em até 2 s de leitura e imediatamente em pausa/seek/mudança de modo/fim. Encerrar abruptamente recupera último checkpoint confirmado, dentro do limite documentado; nenhum tempo fechado é somado. Falha de checkpoint pausa e informa que o avanço não foi salvo.

**Verificação:** integração com falha de escrita e E2E de recarga/fechamento. Não presumir que `unload` sempre grava.

### AC-16 — Duas abas (RF-05)

Iniciar leitura na aba A bloqueia reprodução em B, mesmo em outro documento. Lease, revisão e callback antigo não permitem gravações concorrentes após expiração/retorno. Encerrar A abruptamente permite recuperação depois do vencimento seguro, sem duplicar contadores.

**Verificação:** dois contextos/páginas na mesma origem com banco compartilhado. BroadcastChannel ausente deve manter exclusão via transação.

### AC-17 — Falha de storage (RF-02/RF-05/RF-10)

Simular indisponibilidade de IndexedDB e QuotaExceeded no import/checkpoint/restauração. Interface oferece explicação e não marca sucesso. Base anterior é preservada; nenhuma limpeza automática. Preferências negadas de persistência não impedem leitura quando o banco funciona.

**Verificação:** injeção de falhas de repositório + comportamento real onde possível. Não confundir quota estimada com garantia.

### AC-18 — Métricas sem inflação (RF-07)

Ler 100 exposições completas no cenário ideal produz valores definidos em AC-06. Repetir 10 tokens aumenta apresentações para 110, não cobertura além de 100. Pausas, quiz, seek e segundo plano não contam como leitura. Tempo zero mostra "—", não infinito/NaN.

**Verificação:** unitário de agregação e integração do snapshot; dados de UI conferem com o registro.

### AC-19 — Conteúdo e gabaritos (RF-06)

Existem três treinos originais com quatro questões cada, quatro alternativas, exatamente uma correta, justificativa e trecho-fonte válido. Testar referência à versão certa do texto. Registrar revisão técnica e revisão humana separadas; não marcar a segunda sem retorno do usuário.

**Verificação:** schema automatizado, inspeção semântica de cada pergunta e apresentação para conferência.

### AC-20 — Pontuação objetiva (RF-06)

Responder 4/4 e 3/4 produz 100% e 75%. Antes de enviar não há nota; respostas incompletas impedem envio com indicação acessível. Depois do envio mostram-se explicações e fontes; resultado não pode ser editado como rascunho.

**Verificação:** domínio e E2E, com gabarito conhecido.

### AC-21 — Rascunho, repetição e idempotência (RF-06)

Selecionar respostas e recarregar mantém rascunho sem revelar gabarito. Duplo clique/retry envia uma tentativa única. Repetir treino cria outra tentativa, preserva a anterior e informa familiaridade. Abandono não vira nota zero.

**Verificação:** integração transacional e E2E.

### AC-22 — Arquivo sem questionário (RF-06)

Documento pessoal sem QuestionSet mostra "Sem questionário" e reflexão opcional. Reflexão é persistida sem nota, avaliação IA ou inferência de compreensão.

**Verificação:** E2E e inspeção da entidade; nenhuma chamada externa.

### AC-23 — Histórico e exclusão (RF-01/RF-07)

Listar sessões/tentativas com valores reais, filtros por documento e quiz. Excluir um documento após confirmação remove original, conteúdo, progresso, sessões, reflexões e tentativas relacionadas, sem afetar outros documentos. Histórico vazio não recebe resultados simulados.

**Verificação:** integração de exclusão e E2E de histórico/recarga.

### AC-24 — Backup completo round-trip (RF-10)

Com quatro formatos, sessões, quiz, rascunho, reflexão e preferências, exportar e restaurar em perfil vazio. Comparar hashes de originais, conteúdo, versões, tokens, cursor e contagens. Sessões restauradas não reproduzem automaticamente; leases não são transferidos.

**Verificação:** integração de manifesto e E2E entre dois perfis, com arquivos binários reais. Não vale exportar apenas metadados.

### AC-25 — Backup inválido e base ocupada (RF-10)

Rejeitar FX-11, caminhos perigosos, expansão acima do teto e entrada ausente. Falha em qualquer validação/transação deixa a base intacta. Base com dados pessoais bloqueia restauração e explica ausência de merge; não apaga os dados.

**Verificação:** validador unitário, rollback e E2E. Hash de integridade não é descrito como assinatura criptográfica de confiança.

### AC-26 — Espaço, persistência e origem (RF-09/RF-10)

Mostrar espaço estimado quando suportado e fallback quando não. Pedido de persistência é contextual; recusado não significa erro fatal. Mudança de origem/perfil não mostra falsa garantia de dados compartilhados. Exportação avisa que backup não é criptografado.

**Verificação:** testes com APIs disponíveis/ausentes e revisão do guia do usuário.

### AC-27 — Acessibilidade prática (RF-08)

Fluxo adicionar → ler → pausar → quiz → backup executável por teclado. Foco visível, labels, feedback de erro e retorno de foco em diálogos. Controles principais acessíveis por toque. Contraste e zoom conforme UX; movimento reduzido respeitado. Leitor de tela acessa texto estático e não recebe centenas de anúncios RSVP.

**Verificação:** automação de acessibilidade quando disponível + inspeção manual. Relatar cobertura; não declarar certificação completa.

### AC-28 — Limites, cancelamento e conteúdo hostil (RF-02/RNF-03/RNF-06)

Testar cada teto em `limite-1`, `limite` e `limite+1` em unidades corretas; 40 MiB significa 40×1024² bytes. Descompressão conta bytes reais, não só cabeçalhos. Cancelar responde em até 1 s no ambiente registrado e impede commit de resultado tardio. Timeout encerra job com mensagem. Nenhuma fixture hostil executa código ou acessa rede externa.

**Verificação:** limites configuráveis em testes + amostras reais, interceptação de rede e observação de responsividade. Não esgotar recursos da máquina como método de teste.

### AC-29 — Desempenho medido (RNF-04/RNF-08)

Por 2 min a 300 PPM no primeiro plano, medir atraso de apresentação e ausência de saltos. Alvo p95 ≤ 50 ms. Biblioteca de 200 metadados abre em até 2 s após bootstrap no equipamento registrado. Falha do alvo exige perfilamento/ajuste ou revisão explícita do requisito, sem marcar aprovado por percepção.

**Verificação:** relatório com dispositivo, navegador, energia, corpus e método; relógio ideal do AC-06 não substitui medição real.

### AC-30 — Preferências (RF-08)

Mudar tema, fonte, PPM e pontuação; reiniciar preserva no Dexie. Tema de sistema acompanha mudança quando selecionado. Valor salvo inválido recebe fallback validado e aviso quando necessário. Não há duas fontes duráveis divergentes para a mesma preferência.

**Verificação:** integração de settings e E2E após recarga.

### AC-31 — Offline de produção (RF-09)

Preparar build online e aguardar estado pronto; importar documentos; fechar e reabrir sem rede em deep link. Biblioteca, dois modos, quiz, histórico, backup e configurações funcionam. Importar PDF e EPUB **pela primeira vez nessa sessão offline**, sem depender de chunks casualmente carregados antes, funciona com assets locais.

**Verificação:** build/preview com service worker ativo e rede bloqueada; também aparelho físico. Primeiro acesso sem cache deve mostrar limitação honesta, quando houver shell de fallback.

### AC-32 — Instalação PWA (RF-09)

Windows Chromium e Android Chromium disponíveis oferecem instalação pelo navegador e abrem em contexto apropriado. Manifesto/ícones/start URL corretos. Navegador sem instalação mantém uso web com instrução/fallback verdadeiro. Não criar botão que promete instalação não suportada.

**Verificação:** manual, com navegador/aparelho/versão e evidência. iOS só é declarado validado após seu próprio teste.

### AC-33 — Atualização e migração (RF-05/RF-09)

Build A com sessão/dados → disponibilizar build B com migração compatível → aviso de atualização sem reload durante reprodução → pausar, checkpoint, confirmar atualização → abrir pausado com dados. Migração falha preserva base e não entra em reload loop. Banco futuro impede escrita sem apagar.

**Verificação:** E2E com dois builds e FX-10; testes de migração transacional.

### AC-34 — Rede, privacidade e logs (RNF-01/RNF-06)

Monitorar importação/leitura/quiz/backup: zero upload de conteúdo e nenhum request externo provocado por arquivo. Runtime usa assets próprios, sem fonte/CDN/analytics. Logs não contêm corpo de livros, respostas completas ou blobs. CSP não está desabilitada para fazer fixtures passarem.

**Verificação:** inspeção de rede, código/configuração e fixtures hostis; testes offline reforçam, mas não substituem essa inspeção.

### AC-35 — Instalação limpa e documentação (RNF-07)

Em checkout/pasta limpos, runtime registrado + instalação pelo lockfile + lint + typecheck + unit/integration + E2E + build passam. README explica executar, preparar offline, origem estável, recuperar backup e limites. Handoff informa testes reais e pendências, sem resultados inventados.

**Verificação:** logs resumidos, identificação do commit/árvore e comandos. Se comando não foi executado, status é "não executado".

## 4. Gate e severidade de defeitos

- **Bloqueador:** perda/corrupção de dados, execução de código importado, upload indevido, exclusão silenciosa, relógio duplicado ou incapacidade de completar fluxo crítico.
- **Alto:** retomada incorreta, suporte anunciado que não funciona, backup incompleto, resultado de quiz errado, offline prometido sem recursos.
- **Normal:** falha de conforto/visual sem perda do fluxo, mas ainda vinculada ao requisito correspondente.

Bloqueadores e altos impedem gate técnico. Requisito P0 falho continua falho mesmo se o defeito parecer pequeno; qualquer adiamento exige decisão de escopo registrada e visível, sem reclassificação silenciosa.

## 5. Modelo de registro de execução

```text
AC:
Data/hora e fuso:
Commit ou identificação da árvore:
Ambiente (SO, navegador, versão, aparelho, viewport):
Fixture / hash / tamanho:
Procedimento ou comando:
Resultado esperado:
Resultado observado:
Status:
Evidência (log, captura, teste, arquivo):
Limitações / pendência humana:
Defeito ou próximo passo:
```

Guardar em `docs/evidence/`. Não incluir dados pessoais reais nos relatórios. A verificação documental deste pacote está em [VALIDATION.md](VALIDATION.md), separada de qualquer validação futura do software.
