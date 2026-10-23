# Produto — leitura dinâmica pessoal

Versão 1.0 · 21/10/2026 · Especificação para implementação.

## 1. Problema e objetivo

Criar um ambiente pessoal para importar textos, praticar leitura com ritmo controlado e observar velocidade e compreensão em conjunto. A ferramenta deve reduzir o esforço para começar uma sessão e preservar o ponto de leitura entre acessos no mesmo dispositivo.

O produto terá uma base web responsiva, instalável como PWA onde houver suporte, para uso no Windows e no celular. O núcleo deverá ser reaproveitado posteriormente em Tauri e Capacitor. A primeira versão não será um SaaS nem uma plataforma educacional multiusuário.

**Sucesso do MVP:** o usuário consegue importar conteúdo suportado, conferir o texto, ler em RSVP ou modo guiado, interromper e retomar, fazer um exercício de compreensão, consultar o próprio histórico e recuperar seus dados por backup — inclusive offline após preparação inicial.

## 2. Origem e status das decisões

As tecnologias e os modos listados em [DECISIONS.md](DECISIONS.md) são decisões confirmadas pelo pedido atual. Valores numéricos, modelo de questionários, organização de fases e detalhes de UX são **propostas de implementação deste pacote**. Podem ser ajustados por evidência de uso, sem substituir silenciosamente a stack ou ampliar o MVP.

O histórico recuperado da conversa anterior contém as mensagens do usuário, mas as respostas do assistente aparecem como referências internas sem conteúdo. Este documento não atribui a essas respostas decisões que não puderam ser lidas.

## 3. Usuário e situações de uso

Um único usuário, sem conta. Situações prioritárias:

1. No Windows, colar um artigo e praticar por alguns minutos.
2. No celular, continuar um texto que foi importado **nesse aparelho**, mesmo sem conexão.
3. Experimentar uma velocidade, reduzir quando necessário e revisar um trecho anterior.
4. Fazer um exercício curto e comparar resultados de tentativas semelhantes.
5. Exportar os dados de um dispositivo e restaurá-los em outro, de forma manual e explícita.

Não presumir que mobilidade significa sincronização. Cada origem/perfil de navegador mantém sua própria biblioteca local.

## 4. Princípios de produto

- **Texto antes de painel:** a ação principal é começar ou continuar uma leitura.
- **Compreensão junto da velocidade:** mostrar a velocidade como parâmetro ou observação, sem tratá-la como prova de aprendizagem.
- **Controle explícito:** leitura começa por ação do usuário, pausa com facilidade e não dispara novamente ao voltar de outra aba.
- **Dados locais e recuperáveis:** nenhum conteúdo importado é enviado a servidores pela aplicação no MVP.
- **Honestidade de extração:** texto extraído pode perder estrutura; uma importação concluída não significa que a ordem foi semanticamente validada.
- **Pequenas entregas completas:** primeiro fluxo funcional com persistência real; depois novos formatos, robustez e embalagem.

## 5. Escopo priorizado

| Prioridade | Entrega | Escopo concreto |
| --- | --- | --- |
| P0 | Biblioteca local | Listar, buscar por título, renomear, abrir, remover com confirmação; ordenar por último acesso. |
| P0 | Entrada de texto | Colar texto e importar TXT UTF-8, PDF textual e EPUB reflowable sem DRM. |
| P0 | Prévia da importação | Mostrar amostra, extensão, contagem, avisos e confirmar antes de salvar. |
| P0 | RSVP | Uma palavra por vez, 100–800 PPM, padrão 250, ajuste de 25, pausas de pontuação configuráveis. |
| P0 | Leitura guiada | Texto normalizado em contexto, destaque por palavra, avanço automático no mesmo ritmo e navegação manual pausada. |
| P0 | Sessões e retomada | Estado inicial pausado, checkpoints, posição por documento, resumo e histórico reais. |
| P0 | Compreensão | Três exercícios locais com quatro questões objetivas cada; reflexão opcional para arquivos sem questionário. |
| P0 | Preferências | Tema claro/escuro/sistema, tamanho do texto, velocidade, pausa de pontuação, movimento reduzido. |
| P0 | Offline/PWA | Shell, rotas, exercícios e dependências de parsing locais disponíveis após preparação. |
| P0 | Recuperação | Exportar backup completo, validar/restaurar em biblioteca vazia, preservar versões e integridade. |
| P0 | Qualidade | Teclado, toque, estados de erro, limites de recursos e testes dos fluxos críticos. |
| P1 | Evolução de leitura | Grupos de 2–3 palavras, modos adicionais, editor de questionários, marcações. Fora do MVP. |
| P1 | Windows | Tauri após estabilidade da PWA; instalador e migração manual validados. |
| P1 | Celular nativo | Capacitor; Android primeiro como proposta, iOS conforme ambiente e necessidade. |
| P2 | Futuro opcional | Sincronização, IA, OCR, integração externa; exigem novo escopo. |

Nenhuma entrega P1/P2 deve bloquear a finalização das P0 nem ser implementada silenciosamente para "completar a arquitetura".

## 6. Requisitos funcionais e aceite

### RF-01 — Biblioteca

Cada item mostra título, formato, progresso e último acesso. Progresso deriva da posição atual; não representa compreensão. Biblioteca vazia apresenta "Adicionar texto" e "Experimentar um exercício".

**Aceite:** criar dois documentos, renomear um, buscar pelo título, reabrir e remover o outro. Após reiniciar, os dados refletem essas operações. Remoção apaga documento e registros associados de forma transacional. A interface informa que o histórico daquele documento também será removido.

### RF-02 — Importação com confirmação

Suportar texto colado, `.txt` UTF-8, `.pdf` textual e `.epub` reflowable sem DRM. Usar PDF.js e epub.js por adaptadores. MIME é uma pista; validar estrutura, extensão e conteúdo. A importação cria um rascunho, nunca um documento legível antes do commit final.

**Aceite:** um arquivo válido de cada tipo chega à prévia, conserva acentos e parágrafos razoavelmente, é confirmado e pode ser reaberto offline. Cancelar, exceder limite, falhar ou faltar espaço não deixa documento incompleto. Arquivo idêntico oferece abrir o existente; não duplica silenciosamente.

Limites propostos: arquivo de até **40 MiB**, PDF de até **1.000 páginas**, texto normalizado de até **3.000.000 de unidades UTF-16 e 500.000 tokens** (ampliados em 23/10/2026, ADR-008), EPUB de até **2.000 entradas e 100 MiB de saída descompactada acumulada**. Encerrar ao atingir o primeiro limite. Extração com mais de 180 segundos requer cancelamento por timeout e mensagem; não interpretar isso como garantia de processamento em 180 segundos. Limites de backup são próprios, definidos na arquitetura.

PDF escaneado sem texto não é aceito como importação bem-sucedida. PDF com senha, arquivos corrompidos, EPUB com DRM, EPUB de layout fixo e arquivos fora dos limites apresentam explicação e alternativa. PDF em colunas ou com tabelas recebe aviso de ordem potencialmente incorreta e exige prévia. Sem reconstrução editorial nem OCR no MVP.

### RF-03 — RSVP

RSVP apresenta tokens em uma posição estável, preservando acentos e pontuação. O usuário inicia, pausa, retoma, retrocede e avança pausado. Primeira versão trabalha com uma palavra por apresentação. Palavra longa deve caber por quebra controlada ou ajuste limitado de fonte, sem corte silencioso.

**Aceite:** a 300 PPM, sem pausas extras, cada token tem duração-base de 200 ms no relógio controlado de teste; 100 tokens correspondem a 20 s de exposição ideal. Pausar não avança; recomeçar não cria dois temporizadores. Alteração de velocidade entra na próxima apresentação. Ocultar a página pausa e exige retomada manual.

Pontuação ligada por padrão: multiplicador 1,5 para vírgula, ponto e vírgula e dois-pontos; 2 para final de frase; 2,5 para fim de parágrafo. Aplicar apenas o maior multiplicador, sem somar. Siglas e decimais usam regra conservadora versionada, com exemplos de teste. Não vender o resultado como segmentação linguística perfeita.

### RF-04 — Leitura guiada

Mostra o texto normalizado em contexto e destaca o token atual. Usa o mesmo cursor e o mesmo motor do RSVP. O MVP não projeta o destaque sobre as coordenadas originais de páginas PDF/EPUB.

**Aceite:** alternar RSVP/guiada mantém exatamente o token e deixa a leitura pausada. Redimensionar, mudar fonte ou girar o celular não muda o cursor. Durante reprodução, destaque continua visível; rolagem manual pausa. Clicar em palavra posiciona o cursor pausado e não conta o trecho saltado como apresentado.

### RF-05 — Sessões e retomada

Salvar posição e métricas periodicamente e nas transições importantes. Uma reabertura sempre começa pausada. Retomar uma sessão interrompida não conta tempo de navegador fechado nem avança palavras no intervalo.

**Aceite:** checkpoint a cada no máximo 2 segundos enquanto há leitura, e imediatamente em pausa, seek, mudança de modo e conclusão. Encerramento abrupto pode perder até o último intervalo não confirmado; a interface não promete perda zero. Reabrir no último checkpoint persistido e marcá-lo como recuperado quando cabível.

### RF-06 — Compreensão

Entregar três textos de treino originais curtos, aproximadamente 300–600 palavras cada, com quatro perguntas de alternativa única, quatro opções por pergunta, uma correta, justificativa e trecho-fonte. O agente deverá verificar que cada gabarito é sustentado pelo texto e apresentar o material para revisão do usuário. Gabaritos são locais e inspecionáveis; não há finalidade de avaliação formal.

**Aceite:** após o treino, o usuário responde, envia uma vez, vê acertos, total e explicações; a tentativa permanece no histórico. Quatro acertos em quatro geram 100%; três em quatro, 75%. Não existe nota antes do envio nem "0%" para ausência de questionário. Repetição registra nova tentativa e mostra "texto já praticado" quando houver tentativa anterior.

Conteúdo pessoal importado sem questionário oferece anotações/reflexão, explicitamente sem pontuação. Sem IA, geração automática ou alegação de que todo arquivo terá teste objetivo no MVP.

### RF-07 — Histórico e métricas

Mostrar data, documento, modo, tempo ativo, tokens apresentados, velocidade observada e compreensão quando existir. Os cartões vêm de registros reais; estados vazios não recebem resultados fictícios.

**Aceite:** pausa, aba oculta, navegação manual e tempo de questionário não aumentam tempo ativo de leitura. Revisitar palavras pode aumentar apresentações, mas não a cobertura única da sessão. Velocidade observada é apresentações concluídas divididas por tempo ativo; não é velocidade comprovada de leitura. Uma sessão com tempo zero mostra "—". Nunca calcular um índice combinado "PPM × compreensão" como medida científica.

### RF-08 — Preferências e acessibilidade

Salvar configurações globais no IndexedDB, sem duplicar a mesma preferência durável em Zustand e localStorage. Velocidade por sessão registra as mudanças para explicar métricas. Faixa de fonte proposta: 16–32 px no modo guiado, com zoom do navegador livre.

**Aceite:** fluxo principal funciona por teclado e toque; foco visível, rótulos, alvos de pelo menos 44 × 44 CSS px para comandos principais, contraste adequado e sem depender só de cor. Leitor de tela acessa texto estático/guiado pausado e controles; não receberá anúncios a cada palavra do RSVP. Movimento reduzido remove rolagem animada, não desativa o controle do usuário.

### RF-09 — Offline e instalação

Preparar cache do aplicativo, exercícios e recursos locais de parsing. Arquivos e histórico permanecem no IndexedDB, fora do cache de assets. Avisar quando a preparação offline terminou. Não oferecer funcionamento offline no primeiro acesso sem cache.

**Aceite:** em build de produção, preparar o aplicativo online, importar um documento, fechar, ativar offline e abrir diretamente biblioteca, leitor e configurações. Importar um arquivo local offline, inclusive PDF e EPUB, também funciona. Atualização fica pendente durante sessão, e só recarrega após checkpoint e ação do usuário.

### RF-10 — Backup e exclusão

Backup inclui originais, textos normalizados, tokens/versões, progresso, histórico, questionários, tentativas, reflexões e preferências. Exportação e importação não usam servidor. Primeira versão restaura apenas em biblioteca sem dados pessoais; mesclagem fica para depois.

**Aceite:** exportar de um perfil e restaurar em outro vazio reconstitui documentos, posição e histórico. Arquivo inválido, versão futura, referências quebradas, hash divergente ou espaço insuficiente não alteram a base. Se a base já contém dados pessoais, explicar a restrição e oferecer exportá-los primeiro; não apagá-los automaticamente.

## 7. Requisitos não funcionais

| ID | Requisito | Evidência esperada |
| --- | --- | --- |
| RNF-01 | Sem login/backend/telemetria no MVP. | Inspeção de rede em importação, leitura, quiz e backup; nenhuma transmissão de conteúdo. |
| RNF-02 | Interface responsiva de 360 a 1440 CSS px. | Capturas e teste em 360×800, 768×1024 e 1440×900; sem comandos essenciais cortados. |
| RNF-03 | UI continua responsiva durante importação. | Cancelar responde em até 1 s nos aparelhos de referência registrados; encerramento de worker se necessário. |
| RNF-04 | Leitura fluida em primeiro plano. | Medir 2 minutos a 300 PPM; p95 do atraso de apresentação até 50 ms como alvo, sem saltar tokens. Registrar aparelho/navegador e resultado. |
| RNF-05 | Retomada consistente. | Testes de recarga normal, interrupção abrupta, migração e duas abas. |
| RNF-06 | Dados não executam código. | EPUB/HTML/PDF/backup hostis não executam scripts nem provocam requests externos. |
| RNF-07 | Build reproduzível. | Lockfile, runtime registrado, instalação limpa, verificações automatizadas e build passam. |
| RNF-08 | Biblioteca útil sem carregar livros inteiros. | Metadados consultados separadamente; 200 itens de fixture listados em até 2 s após bootstrap no equipamento registrado. |

Alvos de desempenho são critérios propostos, sujeitos à medição em hardware documentado. Não afirmar compatibilidade universal por testes em um computador.

## 8. Fora do MVP

Sem conta, nuvem, sincronização, colaboração, pagamentos, marketplace, feed social, notificações, competição, gamificação extensa, IA, OCR, remoção de DRM, importação por URL, leitura de páginas autenticadas, audiolivro, tradução, editor de e-books, anotações avançadas, restauração mesclada ou bibliotecas ilimitadas.

Também ficam fora instaladores Tauri/Capacitor, publicação em lojas e serviços externos. Definir adaptadores não autoriza implementar essas plataformas durante o MVP.

## 9. Critério de conclusão do MVP

Todos os RF-01 a RF-10 e RNF críticos devem ter evidência ou limitação impeditiva registrada. A trajetória completa deve ser demonstrável: importar → confirmar → ler → pausar → reabrir → alternar modo → concluir → fazer treino com quiz → ver histórico → exportar → restaurar → usar offline.

O gate técnico exige todos os cenários P0 de [ACCEPTANCE-TESTS.md](ACCEPTANCE-TESTS.md) aprovados. Falhas críticas de dados, reprodução ou privacidade impedem declarar o MVP concluído. Aceite pessoal do usuário é uma etapa separada; não decorre automaticamente do resultado dos testes.

## 10. Riscos e mitigação

| Risco | Tratamento no MVP |
| --- | --- |
| Velocidade alta com baixa compreensão | Exibir métricas separadas, permitir reduzir ritmo e comparar exercícios com ressalva de repetição. |
| Texto PDF fora de ordem | Prévia, aviso, amostra de cada página e opção de cancelar/colar texto corrigido. |
| Evicção ou limpeza do navegador | Persistência solicitável, espaço estimado, backup completo e instrução de recuperação. |
| Arquivo malicioso ou muito grande | Limites reais de processamento, parsing isolado, sem scripts/recursos remotos, cancelamento. |
| Temporizadores em segundo plano | Pausa automática e nenhuma compensação acelerada ao voltar. |
| Três plataformas simultâneas | PWA aceita antes de abrir as fases nativas. |
| Crescimento do escopo por agentes | Fases com entregas delimitadas, revisão de contratos e nenhum recurso extra sem decisão explícita. |
