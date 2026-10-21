# Leitura Dinâmica Pessoal (Web / PWA Local-First)

Software pessoal de leitura dinâmica com foco em ritmo controlado (RSVP e leitura guiada), retenção e privacidade local-first. Todos os documentos, snapshots normalizados, sessões e preferências permanecem exclusivamente no dispositivo (IndexedDB via Dexie), sem backend, login ou telemetria.

> **Status atual da implementação:** Ciclo **F0 + F1 concluído** (primeira fatia funcional: Texto colado → Prévia → Persistência transacional → Biblioteca → Leitura RSVP → Pausa/Retomada → Conclusão).
> Esta primeira entrega **não é o MVP completo**. Os importadores de arquivos (`.txt`, `.pdf`, `.epub`), leitura guiada, exercícios de compreensão, backup ZIP e offline PWA entram nas fases F2 a F6 conforme [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) e [docs/HANDOFF.md](docs/HANDOFF.md).

---

## 1. Requisitos de Ambiente

- **Node.js:** `>= 22.0.0` (validado em `v24.14.0`)
- **npm:** `>= 10.0.0` (validado em `11.9.0`)
- **Navegador para uso e testes E2E:** Google Chrome ou Microsoft Edge estável no Windows.

---

## 2. Instalação e Execução Local

Instale as dependências a partir do lockfile:

```powershell
npm install
```

Inicie o servidor de desenvolvimento na porta fixa `4173`:

```powershell
npm run dev
```

Acesse no navegador: **`http://localhost:4173`**

> **Importante sobre dados locais (IndexedDB):** O armazenamento IndexedDB é vinculado à origem (`http://localhost:4173`). Mantenha a mesma porta e o mesmo perfil de navegador para preservar seus documentos e pontos de leitura entre execuções.

---

## 3. Comandos de Qualidade e Verificação

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor Vite em `http://localhost:4173` (porta estrita). |
| `npm run lint` | Executa o ESLint em todo o código TypeScript/React. |
| `npm run typecheck` | Executa verificação de tipos estrita (`tsc -b --noEmit`). |
| `npm run test:unit` | Executa testes unitários e de integração com Vitest (tokenizador, motor RSVP, relógio determinístico, spikes PDF/EPUB, transações Dexie e fluxo React em StrictMode). |
| `npm run test:e2e` | Executa os testes E2E no navegador real com Playwright (fluxo F1 completo, persistência após recarga, atalhos, viewport móvel e proteção de duas abas). |
| `npm run build` | Compila TypeScript e gera o bundle de produção em `dist/`. |
| `npm run preview` | Serve o build de produção em `http://localhost:4173`. |

---

## 4. Roteiro Rápido para Testar a Entrega F1

1. Execute `npm run dev` e abra `http://localhost:4173/library`.
2. Clique em **Adicionar texto**, informe um título opcional e cole um texto de sua preferência (notará que espaços em branco isolados mantêm o botão **Preparar texto** desabilitado).
3. Clique em **Preparar texto** para abrir a **Prévia da importação**: confira a contagem real de palavras/tokens, parágrafos e amostra do texto normalizado.
4. Clique em **Salvar e abrir**: o aplicativo grava atomicamente o texto original UTF-8, o snapshot normalizado, os chunks de tokens e o progresso inicial no IndexedDB, abrindo o leitor **sempre pausado** (padrão 250 PPM).
5. Clique em **Iniciar** (ou pressione `Espaço`) para ler em **RSVP**:
   - Use `-` / `+` (ou os botões visíveis) para ajustar a velocidade entre **100 e 800 PPM** (passo de 25). O novo ritmo entra na próxima palavra sem cortar a palavra atual.
   - Use `←` / `→` (ou os botões `-10` / `+10`) para retroceder ou avançar 10 palavras: o leitor pausa imediatamente e não contabiliza palavras saltadas como lidas.
   - Minimize ou troque de aba durante a leitura: a reprodução pausa imediatamente, salva um checkpoint e exige retomada manual ao voltar.
6. Recarregue a página (`F5`): o leitor reabre **pausado** exatamente no último checkpoint confirmado, exibindo o aviso de retomada.
7. Abra a mesma URL do leitor em uma **segunda aba** e tente iniciar a leitura nas duas ao mesmo tempo: a segunda aba bloqueará a reprodução com aviso de conflito de sessão ativa.
8. Leia até a última palavra para visualizar o **Resumo da sessão concluída** (tempo ativo real, palavras apresentadas, cobertura única e PPM observada) e consulte o registro em **Histórico**.

---

## 5. Documentação de Especificação e Decisões

- [PRODUCT.md](PRODUCT.md) — Requisitos funcionais, não funcionais e limites do MVP.
- [ARCHITECTURE.md](ARCHITECTURE.md) — Contratos de domínio, modelo Dexie, motor de leitura e segurança.
- [UX-FLOWS.md](UX-FLOWS.md) — Fluxos de tela, atalhos e diretrizes de acessibilidade.
- [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) — Plano por fases (F0 a F8) e gates de qualidade.
- [ACCEPTANCE-TESTS.md](ACCEPTANCE-TESTS.md) — Matriz de critérios de aceite (AC-01 a AC-35).
- [DECISIONS.md](DECISIONS.md) e `docs/decisions/` — Decisões confirmadas, defaults adotados e ADRs.
- [docs/HANDOFF.md](docs/HANDOFF.md) — Estado detalhado da entrega atual, matriz verificada e próxima tarefa (F2).
