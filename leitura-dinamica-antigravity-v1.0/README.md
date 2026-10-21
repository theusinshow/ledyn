# Leitura dinâmica pessoal — pacote de implementação

Versão da documentação: **1.0 — 21/10/2026**. Idioma do produto: português do Brasil. Nome provisório, sem decisão de marca.

Este pacote orienta a implementação de um software pessoal de leitura em **web/PWA**, utilizável no Windows e no celular. O MVP entrega uma PWA local-first. Aplicativo Windows com Tauri e aplicativos móveis com Capacitor são fases posteriores, com validação própria.

**Estado atual: especificação, sem aplicação implementada.** Não há `package.json`, dependências instaladas ou testes da aplicação executados neste pacote.

## 1. Como começar no Google Antigravity

1. Extraia o ZIP em uma pasta de projeto nova. A pasta `leitura-dinamica-antigravity-v1.0` deve ficar como raiz aberta no Antigravity, com `AGENTS.md` visível nessa raiz.
2. Leia [PRODUCT.md](PRODUCT.md) e [DECISIONS.md](DECISIONS.md) para entender o escopo e quais detalhes foram propostos neste pacote.
3. Abra essa pasta como workspace no Antigravity. Não abra o ZIP como se fosse um projeto executável.
4. Copie **somente o bloco de prompt** de [PROMPT-INICIAL.md](PROMPT-INICIAL.md) para a conversa do agente.
5. O primeiro ciclo deverá inspecionar o workspace, registrar versões compatíveis e executar a F0 e a fatia F1. A implementação começa com texto colado, persistência e RSVP; os outros formatos entram depois.
6. Avalie a entrega pelo roteiro de demonstração e pelas evidências, não apenas por capturas de tela. Continue as fases com o prompt de continuação do mesmo arquivo.

O Antigravity documenta a descoberta de `AGENTS.md` no workspace e nos diretórios. O prompt também exige sua leitura explícita para tornar o processo verificável. Não é necessário instalar um workflow ou alterar configurações globais. Referência: [regras oficiais](https://www.antigravity.google/docs/rules/).

## 2. Arquivos e ordem de leitura

| Arquivo | Finalidade |
| --- | --- |
| [PRODUCT.md](PRODUCT.md) | Problema, prioridades, limites, requisitos e definição do MVP. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Módulos, dados, importação, temporização, persistência, segurança e evolução nativa. |
| [UX-FLOWS.md](UX-FLOWS.md) | Telas, fluxos, estados, acessibilidade e mensagens. |
| [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) | Fases, responsáveis lógicos, dependências, entregas e gates. |
| [AGENTS.md](AGENTS.md) | Instruções para o agente que implementará o projeto. |
| [PROMPT-INICIAL.md](PROMPT-INICIAL.md) | Prompt inicial copiável e prompt de continuação. |
| [ACCEPTANCE-TESTS.md](ACCEPTANCE-TESTS.md) | Cenários verificáveis, fixtures e matriz de cobertura. |
| [DECISIONS.md](DECISIONS.md) | Origem das decisões, propostas adicionais e pontos em aberto. |
| [SOURCES.md](SOURCES.md) | Referências técnicas oficiais consultadas e limites da pesquisa. |
| [VALIDATION.md](VALIDATION.md) | Verificações realizadas no pacote de documentação. |
| [PACKAGE-CONTENTS.json](PACKAGE-CONTENTS.json) | Manifesto de arquivos, tamanhos e hashes. |
| [SHA256SUMS.txt](SHA256SUMS.txt) | Integridade dos documentos e do manifesto. |

Em caso de conflito: instrução atual do usuário > decisões confirmadas em `DECISIONS.md` > escopo de `PRODUCT.md` > contratos de `ARCHITECTURE.md` > critérios de `ACCEPTANCE-TESTS.md` > detalhes de UX e plano. Não resolver divergências silenciosamente: registrar o ajuste em `docs/decisions/` quando houver código.

## 3. Decisões-base

- React + Vite + TypeScript; Tailwind CSS + shadcn/ui.
- Zustand para estado transitório; Dexie sobre IndexedDB para dados duráveis.
- PDF.js para PDF com texto; epub.js para EPUB sem DRM, com restrições descritas na arquitetura.
- RSVP e leitura guiada; sessões, progresso e testes de compreensão locais.
- Sem backend, login ou sincronização no MVP. Dados de um dispositivo não aparecem automaticamente no outro.
- PWA primeiro; Tauri no Windows e Capacitor no celular depois.

## 4. Limites que precisam permanecer visíveis

- RSVP é apresentação de palavras em sequência. A velocidade configurada não comprova leitura, retenção ou ganho cognitivo.
- O MVP não faz OCR, não remove DRM e não preserva o layout editorial de PDF/EPUB. A leitura ocorre sobre texto normalizado, com prévia para conferência.
- Os testes objetivos usam exercícios locais com gabarito revisável. Arquivos pessoais não recebem perguntas automáticas inventadas; podem ter reflexão sem nota.
- Armazenamento local está sujeito à política do navegador. Backup exportável e restauração testada fazem parte do MVP.
- PWA exige primeiro carregamento bem-sucedido para ficar disponível offline. Instalação e acesso a recursos variam por navegador; o aplicativo web continua utilizável quando a instalação não está disponível.
- Tauri/Capacitor não implicam migração automática do IndexedDB da PWA. A transferência inicial será por backup, validada na fase nativa.

## 5. Uso local e dependências futuras

O agente deverá escolher versões estáveis compatíveis, fixar o gerenciador e criar lockfile. Não copiar comandos antigos de Tailwind ou Vite sem conferir a versão. Não há versão de pacote prescrita como "a mais recente" nesta documentação.

Depois da F0, o projeto deverá oferecer os comandos `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:e2e`, `npm run build` e `npm run preview`. **Esses comandos ainda não existem neste pacote.** A documentação da aplicação deverá explicar instalação, inicialização, porta fixa e teste offline em build de produção.

Para testar no celular físico, `localhost` do computador não é o celular. Servir o build em uma origem HTTPS acessível pelo aparelho; registrar a origem usada. Publicar externamente depende de autorização do usuário. Não recomendar ignorar erros de certificado como procedimento normal.

## 6. Resultado esperado da primeira entrega

Uma fatia pequena que permita colar um texto, conferir a prévia, salvar, abrir RSVP, iniciar/pausar, alterar a velocidade e reabrir no último ponto confirmado. Deve incluir testes do motor e da persistência, além de limitações registradas. Não deve começar por um painel decorativo com contadores simulados.

O restante do MVP está dividido em fases fechadas. A prontidão técnica e o aceite do usuário são registrados separadamente. O pacote organiza o desenvolvimento; não afirma que o produto já esteja pronto.
