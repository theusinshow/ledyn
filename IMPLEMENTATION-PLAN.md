# Plano de implementação por fases e papéis

Versão 1.0 · 21/10/2026. O plano é orientado por entregas e evidências, sem estimativa de prazo não validada.

## 1. Estratégia de execução

Desenvolver fatias utilizáveis. O primeiro ciclo termina com texto colado → salvo → RSVP → pausa → retomada. Esse ciclo não conclui o MVP. O MVP completo inclui os demais formatos, guiado, compreensão, histórico, backup e offline verificados.

Por padrão, um único agente pode assumir os papéis abaixo sequencialmente. Os nomes são responsabilidades, não exigência de abrir vários agentes ou serviços. Paralelismo só deve ser usado quando autorizado pelo usuário, houver capacidade no ambiente e os contratos já estiverem estáveis. Não adicionar framework de orquestração ao aplicativo.

### Papéis lógicos

| Papel | Responsabilidade | Entrega revisável |
| --- | --- | --- |
| Coordenador | Reconstruir estado, controlar escopo e dependências, manter handoff. | Plano curto, tarefas e decisão de avançar baseada em evidência. |
| Arquiteto | Contratos de texto/cursor, modelo persistido, importação segura e limites. | ADRs, interfaces e riscos resolvidos por spike. |
| Executor de núcleo/dados | Motor de leitura, tokenização, Dexie, sessão e backup. | Implementação com testes de comportamento e migração. |
| Executor de interface | Biblioteca, leitor, guiado, quiz, acessibilidade e erros. | Fluxos funcionais com dados reais e evidência visual. |
| Verificador | Reproduzir critérios, testar offline/arquivos e apontar lacunas. | Matriz de resultados, defeitos e relatório sem aprovação presumida. |

Se houver múltiplos agentes: somente um integra e altera lockfile/schema/contratos centrais por vez. Dividir por arquivos e interfaces explícitas; nenhum agente pode redefinir cursor ou schema isoladamente. Não usar uma revisão de outro agente como substituto dos testes reais ou do aceite do usuário.

## 2. Dependências

```text
F0 preparação e riscos
  ↓
F1 texto + persistência + RSVP
  ↓
F2 biblioteca/importadores TXT/PDF/EPUB
  ↓
F3 guiado + sessões robustas + preferências
  ↓
F4 compreensão + histórico
  ↓
F5 backup + offline/PWA + atualização
  ↓
F6 integração e gate MVP
  ├── F7 Windows/Tauri (escopo posterior)
  └── F8 celular/Capacitor (escopo posterior)
```

Testes e segurança entram desde F1; F6 não é a primeira vez que são considerados. A estrutura de backup e o modelo de versões devem ser previstos em F0/F1, embora a interface de exportação seja entregue na F5. Critérios AC que atravessam fases podem acumular evidência parcial, mas só recebem status aprovado quando todo o cenário estiver verificado; a parte ainda não implementada permanece pendente.

## 3. F0 — preparação e redução de riscos

**Entrada:** este pacote e workspace aberto. **Papéis:** coordenador + arquiteto, sequencialmente por padrão.

Tarefas:

1. Inspecionar arquivos existentes, Git e alterações locais antes de criar projeto. Se a pasta tiver trabalho, preservá-lo e adaptar a inicialização; não sobrescrever.
2. Ler todos os documentos-base, listar decisões confirmadas e defaults propostos. Resolver contradições pelo registro de decisões.
3. Conferir documentação oficial e compatibilidade de runtime/Vite/React/Tailwind/shadcn/PWA. Registrar versões exatas, gerenciador e licença. Criar projeto TypeScript estrito e lockfile.
4. Estruturar pastas, rotas, lint, typecheck, testes e build; evitar dependências sem uso.
5. Definir contratos de conteúdo, token, cursor, sessão, quiz e erros antes dos componentes.
6. Fazer spike curto com PDF.js local e epub.js local: um arquivo simples, worker offline e EPUB hostil sem script/rede. Registrar resultado e abordagem; não montar produto inteiro nesse spike. Se algo bloquear F2, descrevê-lo, mantendo a F1 viável.
7. Definir schema Dexie inicial e estratégia de migração/checkpoint; criar corpus de fixtures sintéticas/originais com permissões de uso claras.
8. Criar `docs/HANDOFF.md`, `docs/evidence/` e checklist de critérios. Definir aparelho/navegador de referência disponível.

**Saída:** projeto executável vazio, contratos e riscos registrados, comandos de qualidade funcionando, plano F1 com arquivos-alvo. `npm run build`, lint, typecheck e um smoke de bootstrap passam. Não escrever testes que apenas confirmem que uma função vazia retorna um valor fixo.

**Gate G0:** ambiente e contratos suficientes para F1. Se o spike EPUB falhar, G0 pode registrar esse risco sem bloquear texto/RSVP, mas F2 não poderá ser concluída até resolvê-lo. Não declarar suporte de importação ainda.

## 4. F1 — primeira fatia funcional

**Entrada:** G0. **Papéis:** núcleo/dados + interface + verificação.

Tarefas:

- Implementar normalização/tokenização versionadas e fixtures com acentos, pontuação e parágrafos.
- Texto colado → prévia → commit transacional de original, conteúdo e tokens no Dexie.
- Biblioteca mínima com abrir e título; consulta leve, sem carregar todos os textos.
- Motor RSVP com uma palavra, 100–800 PPM, pontuação, iniciar/pausar, seek pausado e fim.
- Persistência de sessão/progresso a cada até 2 s e em transições. Estado de gravação e erro visível.
- Um leitor ativo por origem com lease e cancelamento de callback antigo; testar StrictMode e recarga.
- UI inicial responsiva clara/escura e controles por teclado/toque. Sem dados de desempenho inventados.

**Aceite da fase:** AC-01, AC-02, AC-06 a AC-11 e AC-15/AC-16 aplicáveis. Critérios mais amplos permanecem pendentes, sem marcar conjunto inteiro como aprovado parcialmente.

**Demonstração:** colar texto de 100 tokens → prévia → salvar → tocar 300 PPM → iniciar → pausar → recarregar → continuar no checkpoint → chegar ao fim. Mostrar teste de relógio de 20 s ideal sem pontuação e prova de persistência.

**Saída:** primeira entrega utilizável, evidências de domínio/persistência e limitações. Atualizar README de execução e handoff. Encerrar o primeiro ciclo do prompt inicial aqui, apresentando o que foi implementado e a próxima fase; nenhum aceite adicional é inventado.

**Gate G1:** fluxo completo funciona com dados reais e sem erro crítico de cursor/dados. Não chamar essa entrega de "MVP pronto".

## 5. F2 — biblioteca e importadores completos

**Entrada:** G1. **Papéis:** arquiteto/importação + dados + interface + verificação.

Tarefas:

- Completar busca, ordenação, renomeação, remoção transacional e estados vazios.
- TXT UTF-8 com BOM/sem BOM e erro de encoding; título e duplicata por hash.
- PDF.js com worker local, páginas/blocos/âncoras, prévia navegável e avisos; distinguir PDF vazio, misto e protegido.
- EPUB reflowable sem DRM via epub.js, spine ordenado, ZIP limitado, carregamento local sem script/rede e normalização de capítulos.
- Implementar cancelamento, timeout, limites durante processamento e descarte de resultados tardios.
- Preservar original/snapshot e não salvar rascunhos incompletos. Medir responsividade durante importação.

**Aceite:** AC-03 a AC-05 e partes de importação de AC-17/AC-28; repetir smoke de F1 após os novos adaptadores. As partes de restauração/backup desses critérios continuam pendentes até F5.

**Saída:** os quatro caminhos de entrada suportados e documentados; corpus de fixtures e mensagens reproduzíveis. Evidência de arquivo válido e falha por formato.

**Gate G2:** imports suportados chegam ao mesmo contrato de domínio; nenhum EPUB executa script ou consulta rede externa; nenhum cancelamento deixa documento parcial. Um aviso de PDF complexo não é falha por si só, mas a ausência de prévia/aviso é.

## 6. F3 — guiado, sessões robustas e preferências

**Entrada:** G2.

Tarefas:

- Leitura guiada contextual com mesmo cursor/motor, scroll controlado e navegação pausada.
- Alternância de modo, redimensionamento, orientação e fontes sem mudar token.
- Preferências persistidas no Dexie; tema de sistema e movimento reduzido.
- Completar métricas: tempo ativo, apresentações, cobertura única, PPM observada e segmentos de modo/velocidade.
- Fechamento abrupto, conflito de abas, suspensão longa e falha de checkpoint com recuperação clara.
- Testar texto longo sem renderizar 200.000 spans de uma vez; preservar navegação acessível.

**Aceite:** AC-12 a AC-18, AC-27, AC-29 e AC-30 aplicáveis; regressão de motor e importação.

**Saída:** dois modos utilizáveis e sessões confiáveis, com comportamento de recuperação documentado.

**Gate G3:** alternância preserva identidade do token; rolagem manual pausa; duas abas não somam/reescrevem sessão; métricas não contam navegação e segundo plano.

## 7. F4 — compreensão e histórico

**Entrada:** G3.

Tarefas:

- Criar três textos de treino originais de aproximadamente 300–600 palavras, quatro perguntas cada, com quatro opções, uma correta, justificativa e âncora.
- Validar gabaritos contra os textos e registrar revisão técnica. Apresentar conteúdo para conferência do usuário; não marcar revisão humana por conta própria.
- Implementar catálogo, leitura de treino, rascunho de quiz, envio idempotente, resultado persistido e repetição identificada.
- Para importados sem quiz, reflexão sem nota. Não adicionar geração IA ou editor de perguntas ao MVP.
- Histórico de sessões/tentativas com filtros simples e detalhes reais. Estados "sem questionário", "rascunho" e "—" distintos de 0%.

**Aceite:** AC-19 a AC-23, com fixtures determinísticas de 4/4 e 3/4, rascunho após recarga e reenvio sem duplicata.

**Saída:** ciclo treino → leitura → quiz → resultado → histórico, mais reflexão em texto pessoal.

**Gate G4:** gabaritos sustentados pelo texto e resultados matematicamente corretos; ausência de revisão humana continua visível se ainda pendente. Consistência técnica não substitui avaliação pessoal do conteúdo.

## 8. F5 — recuperação e PWA offline

**Entrada:** G4; modelo de versões já definido.

Tarefas:

- Exportar backup completo ZIP, com originais binários, snapshots, quiz/histórico/preferências e hashes.
- Restaurar apenas em biblioteca sem dados pessoais; validar versão, limites, caminhos, relacionamentos e integridade antes da transação.
- Testar rollback e round-trip entre perfis, sem reimportar documentos ou retokenizar.
- Storage estimate/persist como melhoria progressiva; QuotaExceeded e storage indisponível com UX útil.
- Manifesto, ícones, cache de assets, todos os chunks e dependências de parsing offline; sem CDN.
- Aviso de atualização que espera pausa/checkpoint/ação do usuário. Validar build A → B com banco existente.
- Documentar origem fixa, acesso HTTPS no celular, instalação suportada e limites de dados locais.

**Aceite:** AC-24 a AC-26, AC-31 a AC-35. Testar service worker em produção/preview, fora do dev server como evidência final.

**Saída:** recuperação portátil e PWA offline preparada. Relatório de instalação em pelo menos Windows Chromium e Android Chromium físicos se disponíveis; Safari/iOS conforme matriz e evidência efetiva.

**Gate G5:** backup completo restaurado com integridade e fluxo offline incluindo importação de PDF/EPUB local. Se não houver aparelho físico, automação pode passar, mas compatibilidade desse aparelho fica explicitamente pendente para F6.

## 9. F6 — integração e gate do MVP

**Entrada:** G5.

Tarefas:

1. Instalação limpa pelo lockfile, lint, typecheck, testes unitários/integração, E2E e build.
2. Executar todos os P0 de `ACCEPTANCE-TESTS.md`, registrando navegador, aparelho, commit e resultado; corrigir falhas e repetir só o que foi afetado.
3. Fluxo contínuo completo, sem seeds de resultados fictícios: adicionar texto → importar PDF/EPUB → ler em dois modos → interromper/retomar → treinar/quiz → histórico → backup/restaurar → offline.
4. Matriz responsiva, teclado, zoom, leitor de tela em modo estático e toque. Registrar limites da auditoria de acessibilidade.
5. Medir alvos de desempenho definidos, com configuração e corpus reproduzíveis.
6. Revisar rede/privacidade e fixtures hostis. Corrigir falhas de dados, script e requests externos antes do gate.
7. Atualizar guia do usuário, execução, limites, backup e troubleshooting; apresentar checklist de aceite pessoal.

**Saída:** relatório técnico e demonstração para o usuário, mais pendências separadas. Se houver falha P0, declarar "MVP incompleto" e listar requisito/cenário, impacto e próximo passo.

**Gate G6 técnico:** todos os P0 aprovados na matriz disponível e nenhuma falha crítica aberta. **Gate de uso pessoal:** usuário confirma adequação de leitura, conforto, conteúdo e fluxo. Não atribuir essa confirmação ao usuário se ela não aconteceu.

Novas plataformas exigem a PWA tecnicamente estável e decisão explícita de avançar ao escopo nativo. O prompt inicial não autoriza publicação nem embalagem antecipada.

## 10. F7 — Windows com Tauri, depois do MVP

**Entrada:** G6 e autorização para iniciar a fase nativa. **Fora do prompt inicial.**

- Conferir versões/requisitos atuais de Tauri e ferramentas Windows; criar casca mínima usando build web.
- Adaptadores de arquivo, dados e ciclo de vida; permissões mínimas e ausência de service worker conflitante.
- Importar backup da PWA; não copiar silenciosamente bases de outro perfil.
- Validar workers, seleção de PDF/EPUB, leitura offline, backup e atualização sem perda de dados na WebView.
- Gerar instalador para uso pessoal quando autorizado; documentar assinatura/distribuição sem prometer loja.

**Gate G7:** instalação limpa e atualização sobre versão anterior preservam dados; mesmo roteiro de leitura/quiz/backup passa. Regressão web permanece verde.

## 11. F8 — celular com Capacitor, depois do MVP

**Entrada:** G6 e autorização para fase móvel; pode ocorrer antes/depois de F7 conforme necessidade.

- Android primeiro como default proposto; conferir SDK/versões e ambiente. Planejar iOS conforme acesso a ambiente compatível.
- Empacotar assets, desativar service worker conflitante, integrar picker/share e dados por adaptadores mínimos.
- Pausar/checkpoint em background, bloqueio de tela e encerramento pelo sistema; validar retomada manual.
- Testar safe areas, teclado, fontes, orientação, arquivos grandes dentro do limite e falta de espaço.
- Transferir biblioteca por backup; sem sincronização implícita.

**Gate G8:** build instalado em aparelho físico, fluxos críticos e restauração aprovados; distribuição/loja é decisão separada. Se iOS não foi testado, não declarar suporte iOS pronto.

## 12. Regras para trabalho paralelo futuro

Somente quando expressamente autorizado: interface de quiz pode ser construída em paralelo com componentes de histórico após contratos F3; não paralelizar migração de banco e código que presume o novo schema sem sincronização. Cada tarefa informa entrada, arquivos sob responsabilidade, contrato, critérios de aceite e evidência de saída.

O integrador revisa diffs e roda checks da combinação real. Não aceitar "meus testes passaram" como prova de que a combinação funciona. Em conflito, parar somente a parte dependente, preservar alterações e resolver contrato antes de continuar. Um agente não deve criar features extras para aproveitar tempo ocioso.

## 13. Modelo de handoff obrigatório

Criar/atualizar `docs/HANDOFF.md` com:

```text
Fase e objetivo atual:
Estado do workspace / commit / alterações não commitadas:
Decisões confirmadas e defaults adotados:
Entregas implementadas:
Critérios AC aprovados, falhos e pendentes:
Comandos executados e resultados reais:
Ambiente, navegador/aparelho e fixtures:
Riscos/limitações e revisões humanas pendentes:
Arquivos relevantes:
Próxima tarefa concreta e critério de conclusão:
```

Não limpar o histórico de pendências para aparentar conclusão. Não registrar teste não executado como aprovado. Cada novo ciclo começa por esse handoff e pelo estado real do workspace.
