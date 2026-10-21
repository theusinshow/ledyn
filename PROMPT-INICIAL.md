# Prompt inicial para o Google Antigravity

Abra como workspace a pasta extraída que contém `AGENTS.md` e os demais documentos. Copie o bloco abaixo para a conversa do agente. Não é um comando de terminal nem exige configurar workflow.

## Prompt — primeiro ciclo F0/F1

```text
Quero implementar um software pessoal de leitura dinâmica web/PWA, para usar no Windows e no celular. Você está no workspace com o pacote de especificação. Execute o trabalho local, não se limite a sugerir um plano.

Comece inspecionando os arquivos, o estado Git e eventuais alterações existentes. Preserve o trabalho anterior. Leia integralmente AGENTS.md, README.md, DECISIONS.md, PRODUCT.md, ARCHITECTURE.md, UX-FLOWS.md, IMPLEMENTATION-PLAN.md e ACCEPTANCE-TESTS.md. Use SOURCES.md como referência técnica e confira a compatibilidade das versões escolhidas na documentação oficial.

Decisões confirmadas: React + Vite + TypeScript; Tailwind CSS + shadcn/ui; Zustand; Dexie/IndexedDB; PDF.js; epub.js; modos RSVP e leitura guiada; testes de compreensão; local-first; MVP primeiro como PWA. Tauri para Windows e Capacitor para celular vêm somente depois do MVP. Sem backend, login, sincronização, IA, OCR ou telemetria no MVP.

Os detalhes marcados como propostas em DECISIONS.md podem ser adotados como defaults reversíveis. Registre as escolhas em docs/decisions/ e peça decisão apenas se houver mudança material de escopo, stack, privacidade, custo ou risco de perda de dados. Não invente decisões do diálogo anterior.

Neste primeiro ciclo, conclua F0 e F1 de IMPLEMENTATION-PLAN.md. Não implemente todo o produto de uma vez. Antes de editar, apresente brevemente a leitura do escopo, riscos e a fatia que irá entregar; depois siga com implementação, testes e correções sem parar apenas no planejamento.

F0: validar ambiente e versões compatíveis; criar projeto TypeScript estrito, lockfile, rotas e comandos de qualidade; definir contratos de conteúdo/cursor/sessão e schema Dexie; fazer spike limitado de PDF.js/epub.js local e seguro, registrando riscos sem montar essas features completas ainda. Criar docs/HANDOFF.md.

F1: entregar texto colado → prévia → salvamento transacional local → biblioteca mínima → RSVP real → pausa → checkpoint → recarga/retomada pausada → conclusão. RSVP de uma palavra por vez, padrão 250 PPM, faixa 100–800, passo 25, pausas de pontuação conforme produto. Original, texto normalizado, tokens e versões devem ser persistidos. Não renderizar números ou resultados fictícios.

O motor deve ter relógio testável, um único agendamento, cursor estável e cleanup seguro. Alterar velocidade aplica na próxima exposição. Seek pausa e não conta tokens saltados. Ocultar a página pausa, não soma tempo de fundo e nunca retoma automaticamente. Checkpoint a cada até 2 s e nas transições; uma sessão ativa por origem, com proteção para duas abas. Reabrir usa o último checkpoint confirmado sem contar o período fechado.

Faça UI simples, responsiva e legível, com estado vazio, carregamento e erro; controles por toque e teclado, foco visível e sem autoplay. Sem começar por dashboard decorativo. Preserve arquitetura suficiente para adicionar TXT/PDF/EPUB e guiado nas fases seguintes, sem implementar wrappers nativos ou abstrações especulativas agora.

Escreva e execute testes relevantes para tokenização, cursor, temporização, pausa, cancelamento de callback, métricas e transações. O cenário determinístico de 100 tokens a 300 PPM sem pausas extras deve totalizar 20 s no relógio de teste. Verifique o fluxo real no navegador, persistência após recarga e conflito de abas. Rode lint, typecheck, testes aplicáveis e build; corrija falhas dentro da fase. Não declare executado o que não conseguiu rodar.

Não publique, não crie contas, não use credenciais reais e não envie textos a serviços externos. Não apague dados ou arquivos existentes para simplificar. Dependências locais necessárias e verificadas podem ser instaladas conforme permissões do ambiente. Não inicie múltiplos agentes por padrão; os papéis do plano podem ser cumpridos sequencialmente.

Ao concluir F1, atualize docs/HANDOFF.md com estado do workspace, decisões, arquivos relevantes, entregas, critérios AC aprovados/falhos/pendentes, comandos realmente executados e limitações. Entregue um roteiro curto para eu executar e testar o fluxo. Separe claramente esta primeira fatia do MVP completo e indique a próxima tarefa F2. Se houver bloqueio, mostre a evidência e continue o que for independente, sem ocultar a pendência.
```

## Prompt — continuar uma fase

Use este segundo bloco depois de revisar a entrega anterior. Ele autoriza a próxima fase pendente **dentro do MVP**, sem autorizar embalagem nativa ou publicação.

```text
Continue o projeto de leitura dinâmica a partir do estado real do workspace. Leia AGENTS.md, docs/HANDOFF.md e os documentos-base, confira Git, dependências e evidências existentes e preserve alterações anteriores.

Conclua a próxima fase pendente de F2 a F6 em IMPLEMENTATION-PLAN.md, respeitando suas dependências e critérios. Se a fase anterior tiver falhas P0 que afetam a próxima, corrija-as primeiro. Use os defaults de DECISIONS.md sem ampliar escopo. Não recomece o projeto nem substitua a stack.

Implemente, teste e corrija a fase autorizada; atualize os documentos e o handoff com resultados reais, limitações e próximo passo. Não marque critérios parcialmente testados como aprovados nem use emulação como prova de aparelho físico. Mantenha visíveis revisões humanas pendentes e formatos/plataformas ainda não validados.

Não inicie F7/Tauri, F8/Capacitor, sincronização, IA ou publicação. Se F6 já estiver tecnicamente concluída, apresente o resumo de validação e as decisões restantes para evolução, sem criar novo escopo por conta própria.
```

## Como avaliar a resposta do agente

O primeiro ciclo deve resultar em arquivos de aplicação reais, instrução de execução e evidências da fatia F1. Se vier apenas planejamento, solicitar execução da fase já autorizada. Se afirmar "MVP pronto" após somente RSVP/texto colado, conferir o gate G6 e os critérios restantes: isso ainda é a primeira fatia.
