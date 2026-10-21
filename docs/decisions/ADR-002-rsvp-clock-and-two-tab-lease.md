# ADR-002 — Motor de Leitura RSVP, Relógio Testável e Exclusão Mútua entre Abas

- **Data:** 2026-10-21
- **Status:** Aceito (Ciclo F0/F1)

## Contexto

O requisito RF-03, RF-05 e os critérios AC-06 a AC-11, AC-15, AC-16 e AC-18 exigem:
- Um único temporizador ativo por instância do motor, resistente ao React StrictMode, remounts e cliques rápidos.
- Relógio injetável e determinístico para testes (100 tokens a 300 PPM sem pausas extras = 20.000 ms exatos).
- Pausa em ocultação de aba (`visibilitychange`) e detecção de suspensão longa do sistema sem inflar `activeMs` nem saltar tokens.
- Exclusão mútua de leitura ativa entre abas da mesma origem.

## Decisão

1. **Porta `Clock` (`src/domain/reading/clock.ts`)**:
   - `BrowserClock` utiliza `performance.now()` e `setTimeout`/`clearTimeout`.
   - `VirtualClock` controla o tempo virtual deterministicamente em memória e expõe `getActiveTimerCount()`, `advanceBy(ms)` e `triggerNextWithLag(lagMs)`.
2. **Controle de Geração no `ReadingEngine` (`src/domain/reading/engine.ts`)**:
   - Cada agendamento incrementa `generationId` após cancelar eventual `activeTimerId` anterior. Callbacks antigos verificam `firedGeneration === this.generationId` antes de qualquer efeito.
   - Alterações de velocidade (`setWpm`) atualizam `this.wpm` sem cancelar nem truncar o timer da palavra em exibição; o novo valor entra na próxima chamada a `scheduleCurrentToken()`.
   - Pausar no meio de uma palavra soma o tempo parcial efetivo em `activeMs` (limitado à duração esperada do token), mas mantém `cursor.tokenIndex` na palavra interrompida sem incrementar `presentedCount`. Retomar reapresenta a palavra por sua duração integral.
   - Se um callback atrasar além de `Math.max(1000, expectedMs * 3)`, o motor detecta suspensão do sistema (`system_suspension`), soma apenas `expectedMs` até a interrupção, pausa imediatamente e exige retomada manual.
3. **Exclusão Mútua de Sessão (`src/infrastructure/db/leaseManager.ts` e `repositories.ts`)**:
   - A tabela `leases` do Dexie guarda a chave `'active-reading-session'` com `ownerId` (único por aba), `sessionId`, `documentId`, `expiresAt` (`now + 10.000 ms`) e `revision`.
   - Toda aquisição de lease e todo checkpoint verificam transacionalmente no Dexie se outra aba possui lease válido (`expiresAt > now`). Caso positivo, lançam `AppError('SESSION_LOCKED')` e pausam o leitor local.
   - `BroadcastChannel('ledyn-reading-lease')` atua apenas como notificação imediata auxiliar quando suportado.
