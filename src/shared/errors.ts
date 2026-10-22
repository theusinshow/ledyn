export type ErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'INVALID_ENCODING'
  | 'FILE_TOO_LARGE'
  | 'LIMIT_EXCEEDED'
  | 'NO_TEXT_LAYER'
  | 'PASSWORD_UNSUPPORTED'
  | 'DRM_UNSUPPORTED'
  | 'FIXED_LAYOUT_UNSUPPORTED'
  | 'CORRUPT_FILE'
  | 'EXTERNAL_RESOURCE_BLOCKED'
  | 'IMPORT_CANCELLED'
  | 'IMPORT_TIMEOUT'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_FULL'
  | 'DB_VERSION_UNSUPPORTED'
  | 'SESSION_LOCKED'
  | 'BACKUP_INVALID'
  | 'BACKUP_VERSION_UNSUPPORTED'
  | 'RESTORE_REQUIRES_EMPTY_LIBRARY'
  | 'DOCUMENT_NOT_FOUND'
  | 'EMPTY_TEXT'
  | 'INVALID_SPEED'
  | 'QUIZ_INCOMPLETE'
  | 'QUIZ_ALREADY_SUBMITTED';

const DEFAULT_USER_MESSAGES: Record<ErrorCode, string> = {
  UNSUPPORTED_FORMAT: 'Formato de arquivo não suportado nesta versão.',
  INVALID_ENCODING: 'Codificação de texto inválida. Use um arquivo UTF-8 válido.',
  FILE_TOO_LARGE: 'O arquivo excede o limite de 40 MiB desta versão.',
  LIMIT_EXCEEDED: 'O texto excede o limite desta versão. Importe um trecho menor.',
  NO_TEXT_LAYER: 'Este PDF não possui texto selecionável. OCR não está incluído nesta versão.',
  PASSWORD_UNSUPPORTED: 'PDF protegido por senha não é suportado nesta versão.',
  DRM_UNSUPPORTED: 'Este EPUB tem proteção não suportada. O aplicativo não remove DRM.',
  FIXED_LAYOUT_UNSUPPORTED: 'Esta versão aceita EPUB de texto refluível. O layout fixo não é suportado.',
  CORRUPT_FILE: 'Não foi possível ler a estrutura deste arquivo.',
  EXTERNAL_RESOURCE_BLOCKED: 'Recurso externo ou script bloqueado por segurança.',
  IMPORT_CANCELLED: 'A preparação foi cancelada.',
  IMPORT_TIMEOUT: 'A preparação demorou além do limite e foi interrompida.',
  STORAGE_UNAVAILABLE: 'O armazenamento local do navegador não está disponível neste momento.',
  STORAGE_FULL: 'Não foi possível salvar por falta de espaço. O texto ainda não foi adicionado.',
  DB_VERSION_UNSUPPORTED: 'A base de dados local pertence a uma versão mais recente e incompatível.',
  SESSION_LOCKED: 'Já existe uma leitura ativa em outra aba.',
  BACKUP_INVALID: 'O arquivo de backup é inválido ou está corrompido.',
  BACKUP_VERSION_UNSUPPORTED: 'A versão deste backup não é suportada por esta versão do aplicativo.',
  RESTORE_REQUIRES_EMPTY_LIBRARY: 'A restauração exige uma biblioteca sem dados pessoais.',
  DOCUMENT_NOT_FOUND: 'Documento não encontrado na biblioteca local.',
  EMPTY_TEXT: 'Insira um texto com pelo menos uma palavra legível antes de preparar.',
  INVALID_SPEED: 'A velocidade deve estar entre 100 e 800 PPM.',
  QUIZ_INCOMPLETE: 'Responda todas as questões antes de enviar o questionário.',
  QUIZ_ALREADY_SUBMITTED: 'Este questionário já foi enviado e finalizado.',
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly userMessage: string;
  public readonly recoverable: boolean;

  constructor(
    code: ErrorCode,
    userMessage?: string,
    options?: { cause?: unknown; recoverable?: boolean },
  ) {
    const resolvedMessage = userMessage ?? DEFAULT_USER_MESSAGES[code];
    super(`[${code}] ${resolvedMessage}`);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = resolvedMessage;
    this.recoverable = options?.recoverable ?? true;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function toAppError(error: unknown, fallbackCode: ErrorCode = 'STORAGE_UNAVAILABLE'): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    if (
      error.name === 'QuotaExceededError' ||
      error.message.includes('QuotaExceededError') ||
      (error.cause instanceof Error && error.cause.name === 'QuotaExceededError')
    ) {
      return new AppError('STORAGE_FULL', DEFAULT_USER_MESSAGES.STORAGE_FULL, { cause: error });
    }
    if (error.name === 'VersionError') {
      return new AppError('DB_VERSION_UNSUPPORTED', DEFAULT_USER_MESSAGES.DB_VERSION_UNSUPPORTED, {
        cause: error,
        recoverable: false,
      });
    }
  }
  return new AppError(fallbackCode, DEFAULT_USER_MESSAGES[fallbackCode], { cause: error });
}
