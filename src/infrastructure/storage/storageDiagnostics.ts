export interface StorageDiagnostics {
  supported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  persisted: boolean | null;
  persistSupported: boolean;
  origin: string;
}

export interface PersistStorageOutcome {
  supported: boolean;
  granted: boolean;
  message: string;
}

export function formatBytesPtBr(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return 'Não informado pelo navegador';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1).replace('.', ',')} KiB`;
  }
  const mib = kib / 1024;
  if (mib < 1024) {
    return `${mib.toFixed(1).replace('.', ',')} MiB`;
  }
  const gib = mib / 1024;
  return `${gib.toFixed(2).replace('.', ',')} GiB`;
}

/**
 * Consulta a estimativa de espaço (`navigator.storage.estimate`) e o status de persistência (`persisted`)
 * de forma resiliente, exibindo fallback honesto quando a API não está disponível (AC-26).
 */
export async function getStorageDiagnostics(): Promise<StorageDiagnostics> {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'local';

  if (
    typeof navigator === 'undefined' ||
    !navigator.storage ||
    typeof navigator.storage.estimate !== 'function'
  ) {
    return {
      supported: false,
      usageBytes: null,
      quotaBytes: null,
      persisted: null,
      persistSupported: false,
      origin,
    };
  }

  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  let persisted: boolean | null = null;
  const persistSupported = typeof navigator.storage.persist === 'function';

  try {
    const estimate = await navigator.storage.estimate();
    if (typeof estimate.usage === 'number') {
      usageBytes = estimate.usage;
    }
    if (typeof estimate.quota === 'number') {
      quotaBytes = estimate.quota;
    }
  } catch {
    // Mantém null caso o navegador falhe na estimativa
  }

  if (typeof navigator.storage.persisted === 'function') {
    try {
      persisted = await navigator.storage.persisted();
    } catch {
      persisted = null;
    }
  }

  return {
    supported: usageBytes !== null || quotaBytes !== null,
    usageBytes,
    quotaBytes,
    persisted,
    persistSupported,
    origin,
  };
}

/**
 * Solicita armazenamento persistente (`navigator.storage.persist()`).
 * Recusa do navegador não é erro fatal e nunca impede a leitura (AC-26).
 */
export async function requestPersistentStorage(): Promise<PersistStorageOutcome> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage ||
    typeof navigator.storage.persist !== 'function'
  ) {
    return {
      supported: false,
      granted: false,
      message:
        'Este navegador não disponibiliza a solicitação de armazenamento persistente. Use o backup .reading-backup.zip para proteger seu acervo.',
    };
  }

  try {
    const granted = await navigator.storage.persist();
    if (granted) {
      return {
        supported: true,
        granted: true,
        message:
          'Armazenamento persistente concedido pelo navegador para esta origem.',
      };
    }
    return {
      supported: true,
      granted: false,
      message:
        'O navegador manteve o regime padrão de armazenamento (best-effort). Você pode continuar lendo normalmente; recomendamos exportar backups periódicos.',
    };
  } catch {
    return {
      supported: true,
      granted: false,
      message:
        'Não foi possível alterar o modo de persistência neste momento. A leitura continua normal.',
    };
  }
}
