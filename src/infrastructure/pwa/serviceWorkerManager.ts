export type SwStatusListener = (state: {
  offlineReady: boolean;
  updateAvailable: boolean;
}) => void;

let currentRegistration: ServiceWorkerRegistration | null = null;
let offlineReady = false;
let updateAvailable = false;
const listeners = new Set<SwStatusListener>();

const pauseBeforeUpdateCallbacks = new Set<() => Promise<void>>();

function notifyListeners(): void {
  const snapshot = { offlineReady, updateAvailable };
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function subscribeSwStatus(listener: SwStatusListener): () => void {
  listeners.add(listener);
  listener({ offlineReady, updateAvailable });
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Registra um callback (ex.: ReaderPage) que pausa o motor e grava checkpoint no IndexedDB
 * antes de aplicar uma atualização de Service Worker (AC-33).
 */
export function registerBeforeSwUpdateHandler(
  handler: () => Promise<void>,
): () => void {
  pauseBeforeUpdateCallbacks.add(handler);
  return () => {
    pauseBeforeUpdateCallbacks.delete(handler);
  };
}

export function registerAppServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // Pré-aquece os módulos locais do PDF.js em segundo plano para garantir importação offline imediata (AC-31)
  if (!('__vitest_environment__' in globalThis)) {
    void import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => {});
    void import('pdfjs-dist/legacy/build/pdf.worker.mjs')
      .then((mod) => {
        const g = globalThis as Record<string, unknown>;
        if (!g.pdfjsWorker) {
          g.pdfjsWorker = mod;
        }
      })
      .catch(() => {});
  }

  // Suporte a eventos de simulação controlada de atualização em testes E2E (AC-33)
  window.addEventListener('ledyn:sw-update-waiting', () => {
    updateAvailable = true;
    notifyListeners();
  });

  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      currentRegistration = registration;

      if (registration.active) {
        offlineReady = true;
        notifyListeners();
      }

      if (registration.waiting && navigator.serviceWorker.controller) {
        updateAvailable = true;
        notifyListeners();
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // Há uma versão anterior controlando a página -> aguarda ação explícita do usuário (AC-33)
              updateAvailable = true;
              notifyListeners();
            } else {
              // Primeira instalação concluída -> pronto para uso offline (AC-31)
              offlineReady = true;
              notifyListeners();
            }
          } else if (installing.state === 'activated') {
            offlineReady = true;
            notifyListeners();
          }
        });
      });
    })
    .catch(() => {
      // Falha silenciosa em ambientes que não suportam Service Worker
    });
}

/**
 * Executa pausa/checkpoint de qualquer leitura ativa, envia SKIP_WAITING ao Service Worker em espera
 * e recarrega a aplicação de forma segura (AC-33).
 */
export async function applyPendingServiceWorkerUpdate(): Promise<void> {
  for (const handler of pauseBeforeUpdateCallbacks) {
    try {
      await handler();
    } catch {
      // Prossegue mesmo se o checkpoint já tiver sido salvo
    }
  }

  updateAvailable = false;
  notifyListeners();

  if (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    currentRegistration?.waiting
  ) {
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      navigator.serviceWorker.addEventListener('controllerchange', done, {
        once: true,
      });
      currentRegistration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(done, 800);
    });
  }

  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}
