# Registro de decisões e premissas

Versão 1.0 · 21/10/2026.

## 1. Evidência disponível

Pedido atual: continuar a conversa "Criar software leitura dinâmica" e entregar um ZIP com documentação Markdown e prompt inicial para o Google Antigravity.

Foi consultada a conversa de ID `6ad8fcf6-72b8-83e9-875d-e38486526410`. As mensagens recuperadas do usuário confirmam uso pessoal, plataformas web/desktop/celular, definição de MVP/arquitetura/UX/planejamento e intenção de usar o novo Antigravity. As mensagens antigas do assistente foram retornadas apenas como marcadores `chatgpt-content-reference`, sem texto substantivo. Nenhum detalhe adicional é atribuído a elas neste pacote.

## 2. Decisões confirmadas pelo pedido atual

| ID | Decisão | Consequência |
| --- | --- | --- |
| D01 | Uso pessoal. | Um usuário local, sem estrutura SaaS/multitenant. |
| D02 | Web/PWA, Windows e celular. | Web responsiva primeiro; evolução nativa separada. |
| D03 | React/Vite/TypeScript. | Base cliente única tipada. |
| D04 | Tailwind/shadcn. | Estilos e componentes coerentes, sem trocar stack visual. |
| D05 | Zustand. | Estado transitório do frontend. |
| D06 | Dexie/IndexedDB. | Persistência durável local no MVP. |
| D07 | PDF.js e epub.js. | Adaptadores para importação PDF/EPUB. |
| D08 | RSVP e leitura guiada. | Dois modos sobre o mesmo conteúdo/cursor. |
| D09 | Testes de compreensão. | Exercícios e resultados associados a sessões. |
| D10 | Local-first. | Fluxos principais não dependem de backend; dados locais. |
| D11 | MVP primeiro PWA. | Nenhum wrapper nativo na entrega MVP. |
| D12 | Tauri/Capacitor posteriormente. | Portas de plataforma e fases nativas depois do aceite PWA. |
| D13 | Documentação detalhada, critérios, limites e fases de agentes. | Plano com gates, evidência e responsabilidades explícitas. |

## 3. Propostas adicionais deste pacote

As escolhas abaixo tornam a implementação executável, mas não são apresentadas como decisões históricas recuperadas. O prompt inicial autoriza adotá-las como defaults reversíveis, salvo nova instrução do usuário.

| ID | Proposta | Justificativa / revisão |
| --- | --- | --- |
| P01 | Português do Brasil e nome provisório "Leitura dinâmica pessoal". | Adequado ao pedido; marca e identidade podem mudar depois. |
| P02 | Sem backend, login, telemetria ou sincronização no MVP. | Reduzir dependência externa e manter privacidade local. |
| P03 | Texto colado/TXT primeiro; PDF e EPUB ainda dentro do MVP completo. | Fatias funcionais antes dos parsers mais complexos. |
| P04 | RSVP de uma palavra, 100–800 PPM, padrão 250 e passo 25. | Controles simples; validar conforto no uso pessoal. |
| P05 | Guiado sobre texto normalizado, com destaque por palavra. | Compartilha cursor e evita prometer fidelidade editorial. |
| P06 | Três treinos originais, quatro perguntas cada; reflexão sem nota nos imports. | Compreensão objetiva sem IA ou necessidade de perguntas para todo arquivo. |
| P07 | Limites de 20 MiB por arquivo, 300 páginas PDF e texto final limitado. | Conter custo no celular; revisar só com medição e testes. |
| P08 | Backup completo ZIP com originais e snapshots. | Local-first precisa de saída e recuperação reais. |
| P09 | Restauração apenas em biblioteca sem dados pessoais. | Evita um algoritmo de merge antes do MVP. |
| P10 | Um leitor ativo por origem, checkpoints de até 2 s. | Evita sobrescrita entre abas e define recuperação possível. |
| P11 | Vitest, Testing Library e Playwright. | Domínio, componentes e fluxos reais em camadas diferentes. |
| P12 | Um agente executor por padrão; papéis podem ser sequenciais. | Reduz conflitos e custo; paralelismo só quando autorizado e útil. |
| P13 | Android antes de iOS na fase Capacitor. | Escopo incremental; reavaliar com aparelhos disponíveis. |
| P14 | Sem cronograma fechado. | Duração depende de ambiente, testes e disponibilidade para revisão. |
| P15 | Encerrar primeiro ciclo após F1 com handoff. | Entrega inicial pequena e verificável; não equivale ao MVP concluído. |

## 4. Pontos ainda a decidir na execução

Não bloqueiam a escrita do pacote nem o início da F0/F1:

- Nome final, ícone e identidade visual.
- Versões exatas de Node, React, Vite, Tailwind e demais pacotes compatíveis na data de implementação.
- Navegadores e aparelhos físicos disponíveis para a matriz de validação.
- Origem de teste HTTPS no celular; hospedagem externa somente com autorização.
- Biblioteca ZIP/validador de esquema após spike de compatibilidade, com preferência inicial descrita na arquitetura.
- Infraestrutura para assinar/distribuir Windows e disponibilizar ambiente iOS, apenas nas fases posteriores.

O agente pode resolver detalhes rotineiros e documentá-los. Deve consultar o usuário se a decisão mudar stack, privacidade, plataformas, custo, limites por motivo material ou extensão do MVP.

## 5. Decisões que não estão autorizadas por este pacote

Criar serviço de nuvem, enviar livros a API de IA, usar credenciais reais, publicar aplicativo/site/loja, incorporar conteúdo protegido, remover DRM, apagar uma biblioteca existente, substituir a stack ou implementar Tauri/Capacitor antes do gate PWA.

Não criar novas "aprovações históricas" para justificar essas ações. A autorização para implementar localmente o MVP não equivale a autorização para distribuição ou operações externas.

## 6. Como registrar mudanças quando houver código

Criar registros pequenos em `docs/decisions/ADR-XXX-titulo.md`: contexto, decisão, alternativas realmente consideradas, impacto no escopo, contratos alterados, testes afetados e status. Atualizar os documentos e critérios correspondentes na mesma mudança.

Não substituir o histórico por uma narrativa de sucesso. Se um requisito ficar incompleto, deve aparecer no handoff com evidência e próximo passo.
