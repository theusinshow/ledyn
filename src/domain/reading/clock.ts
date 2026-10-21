export interface Clock {
  now(): number;
  schedule(callback: () => void, delayMs: number): number;
  cancel(timerId: number): void;
}

export class BrowserClock implements Clock {
  now(): number {
    return performance.now();
  }

  schedule(callback: () => void, delayMs: number): number {
    return globalThis.setTimeout(callback, delayMs) as unknown as number;
  }

  cancel(timerId: number): void {
    globalThis.clearTimeout(timerId);
  }
}

interface ScheduledTask {
  id: number;
  dueTimeMs: number;
  callback: () => void;
}

/**
 * Relógio virtual determinístico para testes unitários e de integração.
 * Permite inspecionar a quantidade de agendamentos ativos, avançar o tempo com precisão
 * e simular atrasos de callback ou suspensão do sistema operacional.
 */
export class VirtualClock implements Clock {
  private currentTimeMs = 0;
  private nextTimerId = 1;
  private tasks = new Map<number, ScheduledTask>();

  now(): number {
    return this.currentTimeMs;
  }

  schedule(callback: () => void, delayMs: number): number {
    const id = this.nextTimerId++;
    const safeDelay = Math.max(0, delayMs);
    this.tasks.set(id, {
      id,
      dueTimeMs: this.currentTimeMs + safeDelay,
      callback,
    });
    return id;
  }

  cancel(timerId: number): void {
    this.tasks.delete(timerId);
  }

  getActiveTimerCount(): number {
    return this.tasks.size;
  }

  getActiveTimerIds(): number[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * Avança o relógio em `deltaMs`, disparando na ordem cronológica todos os timers
   * cujo `dueTimeMs <= targetTime`.
   */
  advanceBy(deltaMs: number): void {
    if (deltaMs < 0) {
      throw new Error('VirtualClock.advanceBy não aceita delta negativo.');
    }
    const targetTime = this.currentTimeMs + deltaMs;

    while (true) {
      let earliestTask: ScheduledTask | null = null;
      for (const task of this.tasks.values()) {
        if (task.dueTimeMs <= targetTime) {
          if (
            earliestTask === null ||
            task.dueTimeMs < earliestTask.dueTimeMs ||
            (task.dueTimeMs === earliestTask.dueTimeMs && task.id < earliestTask.id)
          ) {
            earliestTask = task;
          }
        }
      }

      if (!earliestTask) {
        break;
      }

      this.tasks.delete(earliestTask.id);
      this.currentTimeMs = earliestTask.dueTimeMs;
      earliestTask.callback();
    }

    this.currentTimeMs = targetTime;
  }

  /**
   * Simula um atraso de execução do próximo timer ativo (ex.: aba bloqueada ou suspensão do SO),
   * disparando o próximo callback apenas em `dueTimeMs + extraLagMs`.
   */
  triggerNextWithLag(extraLagMs: number): boolean {
    let earliestTask: ScheduledTask | null = null;
    for (const task of this.tasks.values()) {
      if (earliestTask === null || task.dueTimeMs < earliestTask.dueTimeMs) {
        earliestTask = task;
      }
    }
    if (!earliestTask) {
      return false;
    }
    this.tasks.delete(earliestTask.id);
    this.currentTimeMs = earliestTask.dueTimeMs + Math.max(0, extraLagMs);
    earliestTask.callback();
    return true;
  }

  /**
   * Executa todos os timers pendentes até esvaziar a fila ou atingir `maxSteps`.
   */
  runToCompletion(maxSteps: number = 10_000): number {
    let steps = 0;
    while (this.tasks.size > 0) {
      if (steps >= maxSteps) {
        throw new Error(`VirtualClock excedeu o limite de ${maxSteps} passos.`);
      }
      let earliestTask: ScheduledTask | null = null;
      for (const task of this.tasks.values()) {
        if (earliestTask === null || task.dueTimeMs < earliestTask.dueTimeMs) {
          earliestTask = task;
        }
      }
      if (!earliestTask) {
        break;
      }
      this.tasks.delete(earliestTask.id);
      this.currentTimeMs = earliestTask.dueTimeMs;
      earliestTask.callback();
      steps++;
    }
    return steps;
  }
}
