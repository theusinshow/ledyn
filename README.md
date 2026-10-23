# Leitura Dinâmica Pessoal (Web / PWA Local-First)

Software pessoal de leitura dinâmica com foco em ritmo controlado (**RSVP** e **Leitura Guiada**), retenção ativa (treinos com questionário objetivo e reflexão rápida) e privacidade **local-first**. Todos os documentos, binários originais, snapshots normalizados, sessões, questionários e preferências permanecem exclusivamente no dispositivo (**IndexedDB via Dexie**), sem backend, login, IA, OCR ou telemetria.

> **Status atual da implementação:** **Fases F0 a F6 implementadas e verificadas tecnicamente (Gate G6 — MVP Web/PWA Local-First).**
> Os itens que dependem de **aparelhos físicos Android/iOS**, da **revisão humana editorial** dos 3 textos de treino (`reviewStatus: 'technical_verified_pending_human'`) e do **aceite pessoal de uso do usuário (`AC-35`)** estão listados na seção 6 deste guia e em [docs/HANDOFF.md](docs/HANDOFF.md).

---

## 1. Requisitos de Ambiente

- **Node.js:** `>= 22.0.0` (validado em `v24.14.0`)
- **npm:** `>= 10.0.0` (validado em `11.9.0`)
- **Navegador para uso e testes E2E:** Google Chrome ou Microsoft Edge estável (Desktop) / Chrome Android / Safari iOS.

---

## 2. Instalação e Execução Local

Instale as dependências a partir do lockfile:

```powershell
npm install
```

Para uso diário recomendado (com **PWA Offline** e Service Worker de produção ativos na porta fixa `4173`):

```powershell
npm run build
npm run preview
```

Para desenvolvimento com hot-reload na mesma porta fixa `4173`:

```powershell
npm run dev
```

Acesse no navegador: **`http://localhost:4173`**

> **Importante sobre dados locais e origem (`IndexedDB`):** O banco de dados local pertence exclusivamente ao perfil do navegador e à origem (`protocolo + domínio + porta`, ex.: `http://localhost:4173`). Trocar de navegador, usar janela anônima ou mudar de porta cria outra base isolada. Para mover seus dados entre navegadores, perfis ou dispositivos, utilize sempre o **Backup Completo (`.reading-backup.zip`)** em **Configurações**.

---

## 3. Comandos de Qualidade e Verificação (Gate G6)

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor Vite em `http://localhost:4173` (porta estrita). |
| `npm run lint` | Executa o ESLint em todo o código TypeScript/React. |
| `npm run typecheck` | Executa verificação de tipos estrita (`tsc -b --noEmit`). |
| `npm run test:unit` | Executa as 9 suítes (42 testes) unitárias e de integração com Vitest (tokenizador, motor RSVP/Guiado, relógio determinístico, importadores TXT/PDF/EPUB, transações Dexie, quiz, histórico, backup ZIP e StrictMode). |
| `npm run test:e2e` | Executa as 6 suítes (15 testes) E2E no navegador real com Playwright sobre o build de produção (`f1-flow`, `f2-importers`, `f3-guided-and-settings`, `f4-training-quiz-history`, `f5-backup-and-offline-pwa` e `f6-mvp-full-journey`). |
| `npm run build` | Compila TypeScript, gera o bundle de produção e o Service Worker offline (`dist/sw.js`) com precache completo. |
| `npm run preview` | Serve o build de produção em `http://localhost:4173`. |

---

## 4. Guia de Uso do MVP

### 4.1 Biblioteca e Importação Segura (4 formatos)
- Em **Biblioteca** (`/library`), adicione materiais por **Colar texto** ou **Importar arquivo** (`.txt` UTF-8, `.pdf` textual até 1.000 páginas ou `.epub` reflowable sem DRM, até `40 MiB` e `500.000` palavras).
- Toda entrada passa por **Prévia antes de salvar**, exibindo contagem de palavras, blocos/capítulos/páginas e avisos de extração (páginas PDF sem texto, múltiplas colunas/tabelas ou duplicata por hash SHA-256).
- Você pode buscar por título, renomear, cancelar importações em andamento ou excluir documentos de forma transacional.

### 4.2 Leitura em Dois Modos (RSVP e Leitura Guiada)
- Todo documento abre **sempre pausado**. Pressione **Iniciar** (ou `Espaço`) para começar.
- **Modo RSVP:** exibe uma palavra por vez no centro.
- **Modo Leitura Guiada:** exibe o texto corrido em parágrafos, destacando a palavra ou grupo (`chunk` de 3 palavras) ativo e rolando suavemente. Rolar manualmente pausa a leitura na hora e exibe o botão **Voltar ao ponto de leitura**; com o leitor pausado, clique em qualquer palavra para reposicionar o cursor.
- Alternar entre **RSVP** e **Leitura Guiada** preserva exatamente a mesma palavra (`contentVersionId + tokenIndex`).
- **Atalhos no leitor:** `Espaço` (Iniciar/Pausar), `←` / `→` (`-10` / `+10` palavras, pausando sem inflar cobertura), `-` / `+` (`-25` / `+25` PPM entre `100` e `800` PPM) e `Esc` (pausar e voltar).

### 4.3 Treinos de Compreensão, Questionário e Reflexão Rápida
- Em **Treinos** (`/training`), há **3 textos originais em português** (300–600 palavras cada), cada um acompanhado de **4 perguntas objetivas** com gabarito sustentado por citação literal e offsets UTF-16 verificados no snapshot.
- Ao concluir um treino, clique em **Responder questionário (4 perguntas)**: as escolhas são salvas como rascunho no IndexedDB a cada clique (sobrevivendo a recarga) e o resultado detalha acertos, justificativas e trecho de evidência.
- Ao concluir qualquer **documento pessoal importado** (sem gabarito), o leitor oferece a **Reflexão rápida** (1 pergunta aberta opcional + autoavaliação `Compreendi bem` / `Parcialmente` / `Preciso reler`), sem inventar nota percentual.

### 4.4 Histórico Honesto e Filtros
- Em **Histórico** (`/history`), consulte todas as sessões reais com filtros por **Documento**, **Modo** (`RSVP`, `Leitura guiada`, `Misto`), **Status** (`Concluída`, `Pausada / Em andamento`) e **Avaliação** (`Com questionário`, `Sem questionário`).
- Cada cartão separa claramente **PPM configurada**, **PPM observada**, **Cobertura única** e **Compreensão** (`acertos/total · %` quando há quiz, ou `"—"` / autoavaliação quando não há quiz).

### 4.5 Configurações, Armazenamento e Backup Completo (`.reading-backup.zip`)
- Em **Configurações** (`/settings`), personalize tema (`Sistema`, `Claro`, `Escuro`), tamanho da fonte guiada (`16–28 px`), movimento reduzido, velocidade padrão (`100–800 PPM`) e pausas de pontuação (`1,5x` cláusula, `2x` frase, `2,5x` parágrafo).
- **Backup Completo (`.reading-backup.zip`):** exporta todos os documentos, binários originais (`sources/<documentId>.bin`), snapshots, tokens, cursores, sessões, tentativas de quiz, reflexões e preferências com manifesto SHA-256.
  - **Aviso de privacidade:** o arquivo `.reading-backup.zip` **não é criptografado** no MVP; guarde-o em local confiável.
  - **Política de restauração:** para evitar perda ou conflito silencioso, a restauração exige uma biblioteca sem dados pessoais (`RESTORE_REQUIRES_EMPTY_LIBRARY`). Caso deseje restaurar sobre um perfil já utilizado, use primeiro o botão **Limpar dados locais para restaurar** (com confirmação explícita).

---

## 5. Solução de Problemas (Troubleshooting)

- **PDF rejeitado com `NO_TEXT_LAYER`:** o PDF é escaneado (apenas imagem). O MVP não inclui OCR; utilize um PDF com texto selecionável ou cole o texto.
- **EPUB rejeitado com `DRM_UNSUPPORTED` ou `FIXED_LAYOUT_UNSUPPORTED`:** o aplicativo aceita apenas EPUBs reflowable sem proteção DRM.
- **Erro `SESSION_LOCKED` (leitura ativa em outra aba):** feche ou pause a leitura aberta na outra aba da mesma origem antes de continuar.
- **Erro `RESTORE_REQUIRES_EMPTY_LIBRARY` ao restaurar backup:** exporte um backup atual se necessário e clique em **Limpar dados locais para restaurar** em Configurações antes de selecionar o arquivo `.reading-backup.zip`.

---

## 6. Checklist de Revisão Humana (`AC-19`) e Aceite Pessoal (`AC-35`)

Para declarar o MVP concluído para o seu uso pessoal, execute o roteiro abaixo:

1. [ ] **Revisão humana dos 3 treinos (`AC-19`):** abrir `/training`, ler os 3 textos originais e conferir a clareza editorial das 12 perguntas e justificativas (atualmente marcados honestamente como `technical_verified_pending_human`).
2. [ ] **Uso pessoal real (`AC-35`):**
   - Importar pelo menos **1 texto colado**, **1 arquivo `.txt`**, **1 `.pdf` textual real** e **1 `.epub` reflowable real** de seu interesse.
   - Realizar pelo menos **3 sessões reais de leitura** (incluindo pelo menos 1 em **RSVP** e 1 em **Leitura Guiada**).
   - Completar pelo menos **1 treino com questionário** e **1 documento pessoal com reflexão rápida**.
   - Exportar um **backup `.reading-backup.zip`** e restaurá-lo em outro perfil de navegador (ou após limpar os dados locais).
   - Avaliar o conforto visual (foco, contraste, controles e rolagem guiada) em uso diário.
3. [ ] *(Opcional, se for usar no celular/tablet)* Testar abertura, pausa ao bloquear tela (`AC-11`) e instalação na tela inicial (`AC-32`) em seu aparelho físico Android/iOS.

---

## 7. Documentação de Especificação, Decisões e Evidências

- [PRODUCT.md](PRODUCT.md) — Requisitos funcionais, não funcionais e limites do MVP.
- [ARCHITECTURE.md](ARCHITECTURE.md) — Contratos de domínio, modelo Dexie, motor de leitura e segurança.
- [UX-FLOWS.md](UX-FLOWS.md) — Fluxos de tela, atalhos e diretrizes de acessibilidade.
- [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) — Plano por fases (F0 a F8) e gates de qualidade.
- [ACCEPTANCE-TESTS.md](ACCEPTANCE-TESTS.md) — Matriz de critérios de aceite (`AC-01` a `AC-35`).
- [DECISIONS.md](DECISIONS.md) e `docs/decisions/ADR-001` a `ADR-006` — Decisões arquiteturais registradas.
- [docs/evidence/f6-mvp-gate-report.md](docs/evidence/f6-mvp-gate-report.md) — Relatório completo de verificação do Gate G6.
- [docs/HANDOFF.md](docs/HANDOFF.md) — Estado detalhado do workspace, matriz verificada e próximos passos.
