# Relatório de Execução de Verificação — Ciclo F0 e F1

- **Data/hora e fuso:** 2026-10-21T16:20:00-03:00 (`America/Sao_Paulo`)
- **Ambiente:** Windows (Node.js `v24.14.0`, npm `11.9.0`, Google Chrome Desktop estável via Playwright `1.64.1`, Vitest `5.0.5` + `fake-indexeddb@6.2.6` + `jsdom@26.1.0`)

---

## Registro por Cenário Executado

### AC-01 — Texto colado e biblioteca (RF-01/RF-02)
- **Fixture:** `FX-02` (`tests/fixtures/corpus.ts`) e texto de 15 palavras em E2E
- **Procedimento / Comando:** `npm run test:unit` (`tests/integration/persistence.test.ts`, `tests/unit/tokenizer.test.ts`) e `npm run test:e2e` (`tests/e2e/f1-flow.spec.ts`)
- **Resultado esperado:** Colar texto, preparar, conferir contagem e confirmar grava documento, blob UTF-8 original, snapshot normalizado e chunks de tokens; recarregar mantém item e abrir inicia pausado; espaços vazios não habilitam preparação.
- **Resultado observado:** Todas as asserções passaram em integração e no navegador Chrome real.
- **Status:** `APROVADO` (escopo F1 de texto colado; validação em aparelho Android/iOS físico permanece pendente para F5/F6).

### AC-02 — Commit atômico e rascunho (RF-02)
- **Fixture:** `FX-01` com injeção de falha `QuotaExceededError` na transação + cancelamento na prévia E2E
- **Procedimento / Comando:** `npm run test:unit` (`tests/integration/persistence.test.ts`) e `npm run test:e2e` (`tests/e2e/f1-flow.spec.ts`)
- **Resultado esperado:** Cancelar na prévia não cria documento; falha na transação reverte `documents`, `sourceFiles`, `contents`, `tokenChunks` e `progress` deixando 0 registros órfãos.
- **Resultado observado:** Contagem confirmada em 0 em todas as 5 tabelas após falha injetada; cancelamento em E2E manteve biblioteca vazia.
- **Status:** `APROVADO`

### AC-06 — Ritmo-base determinístico (RF-03)
- **Fixture:** `FX-01` (100 tokens sem pontuação)
- **Procedimento / Comando:** `npm run test:unit` (`tests/unit/engine.test.ts`)
- **Resultado esperado:** A 300 PPM com pontuação desligada, 100 exposições demandam exatamente 20.000 ms no `VirtualClock`; primeiro token conta somente após 200 ms e o último recebe 200 ms integrais; cursor final = 100, `presentedCount = 100`, PPM observada = 300.
- **Resultado observado:** `clock.now() === 20000`, `cursor.tokenIndex === 100`, `presentedCount === 100`, `activeMs === 20000`, `observedWpm === 300`.
- **Status:** `APROVADO`

### AC-07 — Um relógio e nenhuma palavra saltada (RF-03)
- **Fixture:** `FX-01`
- **Procedimento / Comando:** `npm run test:unit` (`tests/unit/engine.test.ts` e `tests/integration/uiFlow.test.tsx` com `<React.StrictMode>`)
- **Resultado esperado:** No máximo 1 agendamento ativo; callbacks antigos invalidados por geração; atraso controlado de callback não dispara rajada de tokens.
- **Resultado observado:** `clock.getActiveTimerCount() <= 1` em todas as transições; atraso de 60 ms avançou exatamente 1 token; StrictMode não duplicou timers.
- **Status:** `APROVADO`

### AC-08 — Pausa, retrocesso e seek (RF-03/RF-05)
- **Fixture:** `FX-01` e E2E
- **Procedimento / Comando:** `npm run test:unit` (`tests/unit/engine.test.ts`) e `npm run test:e2e` (`tests/e2e/f1-flow.spec.ts`)
- **Resultado esperado:** Pausar aos 80 ms mantém cursor no token 0 e registra 80 ms parciais sem contar apresentação; retomar reapresenta por 200 ms completos; seek `-10`/`+10` pausa e não infla cobertura.
- **Resultado observado:** Comportamento exato verificado no motor e na interface web.
- **Status:** `APROVADO`

### AC-09 — Alteração de velocidade (RF-03)
- **Fixture:** `FX-01` e E2E
- **Procedimento / Comando:** `npm run test:unit` (`tests/unit/engine.test.ts`) e `npm run test:e2e` (`tests/e2e/f1-flow.spec.ts`)
- **Resultado esperado:** Mudar de 250 para 300 PPM durante reprodução preserva os 240 ms da exposição atual e aplica 200 ms na próxima; faixa 100–800 validada e passo 25 respeitado.
- **Resultado observado:** Transição exata aos 240 ms + 200 ms = 440 ms; valores fora de 100–800 rejeitados com erro claro.
- **Status:** `APROVADO`

### AC-10 — Pausas de pontuação (RF-03)
- **Fixture:** `FX-02`
- **Procedimento / Comando:** `npm run test:unit` (`tests/unit/tokenizer.test.ts`)
- **Resultado esperado:** Multiplicadores 1,5 (`clause`), 2,0 (`sentence`), 2,5 (`paragraph`), prevalecendo o maior; fator 1,0 quando desligado; abreviações (`Dr.`, `Sra.`, `etc.`, `E.U.A.`) e decimais (`3,14`, `1.250,50`) preservados sem falso fim de frase; NFC antes dos offsets UTF-16.
- **Resultado observado:** Todos os offsets UTF-16 e durações verificados com sucesso.
- **Status:** `APROVADO`

### AC-11 — Segundo plano e suspensão (RF-03/RF-05)
- **Fixture:** `FX-01`
- **Procedimento / Comando:** `npm run test:unit` (`tests/unit/engine.test.ts` e `tests/integration/persistence.test.ts`)
- **Resultado esperado:** Ocultar página (`visibilitychange`) pausa e grava checkpoint; salto de suspensão longa (> 1 s / 3x duração) pausa como `system_suspension` sem somar tempo suspenso ao `activeMs`; reabertura após fechar não soma tempo fechado.
- **Resultado observado:** Verificado em testes unitários e de integração; validação manual em aparelho Android/iOS físico permanece pendente para F3/F6.
- **Status:** `PARCIALMENTE VERIFICADO / PENDENTE APARELHO FÍSICO`

### AC-15 — Checkpoint e encerramento abrupto (RF-05)
- **Fixture:** `FX-01` e E2E
- **Procedimento / Comando:** `npm run test:unit` (`tests/integration/persistence.test.ts`) e `npm run test:e2e` (`tests/e2e/f1-flow.spec.ts`)
- **Resultado esperado:** Checkpoint periódico (1,8 s <= 2 s) e imediato em transições; recarga/encerramento abrupto reabre pausado no último checkpoint confirmado; erro de gravação pausa e exibe aviso sem mostrar "salvo".
- **Resultado observado:** Aprovado em integração e em reload real no navegador Chrome.
- **Status:** `APROVADO`

### AC-16 — Duas abas (RF-05)
- **Fixture:** `FX-01` e 2 páginas no mesmo contexto Playwright
- **Procedimento / Comando:** `npm run test:unit` (`tests/integration/persistence.test.ts`) e `npm run test:e2e` (`tests/e2e/f1-flow.spec.ts`)
- **Resultado esperado:** Iniciar leitura na aba A bloqueia reprodução na aba B via lease no Dexie (`SESSION_LOCKED`), exibindo alerta claro; liberar na aba A ou aguardar expiração (10 s) permite retomada segura na aba B.
- **Resultado observado:** Aprovado tanto com `BroadcastChannel` desabilitado (transação pura no Dexie) quanto em duas abas reais no Chrome via Playwright.
- **Status:** `APROVADO`
