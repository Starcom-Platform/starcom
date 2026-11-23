/**
 * Structured error types for the chat/communication and crypto layers.
 * Provides typed errors that callers can inspect to determine failure cause
 * and take appropriate recovery action (offline queue, re-key, reconnect, etc.).
 */

export type ChatErrorCode =
  // Network
  | 'RELAY_UNREACHABLE'
  | 'MESSAGE_SEND_FAILED'
  | 'CHANNEL_REFRESH_FAILED'
  | 'CHANNEL_CREATE_FAILED'
  | 'ATTACHMENT_UPLOAD_FAILED'
  | 'USER_LOOKUP_FAILED'
  | 'PRESENCE_FAILED'
  | 'HEALTH_CHECK_FAILED'
  | 'RETRY_FAILED'
  // Encryption / Crypto
  | 'SIGNATURE_FAILED'
  | 'KEY_ROTATION_FAILED'
  | 'ENCRYPTION_FAILED'
  | 'DECRYPTION_FAILED'
  | 'KEM_ENCAP_FAILED'
  | 'KEM_DECAP_FAILED'
  // Auth / Identity
  | 'ADAPTER_INIT_FAILED'
  | 'FALLBACK_FAILED'
  | 'IDENTITY_VERIFICATION_FAILED'
  // Security-critical
  | 'SECURE_DELETE_FAILED'
  | 'EMERGENCY_ACTIVATION_FAILED'
  | 'STEALTH_ACTIVATION_FAILED'
  | 'THREAT_MONITOR_FAILED'
  | 'THREAT_ASSESSMENT_FAILED'
  // General
  | 'SERVICE_INIT_FAILED'
  | 'UNKNOWN';

/**
 * Base error class for all chat/communication errors.
 */
export class ChatError extends Error {
  public readonly code: ChatErrorCode;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: number;

  constructor(
    code: ChatErrorCode,
    message: string,
    context?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
    this.context = context;
    this.timestamp = Date.now();
    if (cause) this.cause = cause;
  }
}

/** Network-layer failures (relay down, IPFS timeout, etc.) */
export class NetworkError extends ChatError {
  constructor(code: ChatErrorCode, message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(code, message, context, cause);
    this.name = 'NetworkError';
  }
}

/** Encryption / signing / key exchange failures */
export class EncryptionError extends ChatError {
  constructor(code: ChatErrorCode, message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(code, message, context, cause);
    this.name = 'EncryptionError';
  }
}

/** Identity / auth verification failures */
export class AuthError extends ChatError {
  constructor(code: ChatErrorCode, message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(code, message, context, cause);
    this.name = 'AuthError';
  }
}

/** Security-critical operation failures */
export class SecurityError extends ChatError {
  constructor(code: ChatErrorCode, message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(code, message, context, cause);
    this.name = 'SecurityError';
  }
}

/** Helper: wrap an unknown caught value into the appropriate ChatError subtype */
export function wrapChatError(code: ChatErrorCode, rawError: unknown, context?: Record<string, unknown>): ChatError {
  const msg = rawError instanceof Error ? rawError.message : String(rawError);
  const networkCodes: ChatErrorCode[] = [
    'RELAY_UNREACHABLE', 'MESSAGE_SEND_FAILED', 'CHANNEL_REFRESH_FAILED',
    'CHANNEL_CREATE_FAILED', 'ATTACHMENT_UPLOAD_FAILED', 'USER_LOOKUP_FAILED',
    'PRESENCE_FAILED', 'HEALTH_CHECK_FAILED', 'RETRY_FAILED',
  ];
  const encryptionCodes: ChatErrorCode[] = [
    'SIGNATURE_FAILED', 'KEY_ROTATION_FAILED', 'ENCRYPTION_FAILED',
    'DECRYPTION_FAILED', 'KEM_ENCAP_FAILED', 'KEM_DECAP_FAILED',
  ];
  const authCodes: ChatErrorCode[] = [
    'ADAPTER_INIT_FAILED', 'FALLBACK_FAILED', 'IDENTITY_VERIFICATION_FAILED',
  ];
  const securityCodes: ChatErrorCode[] = [
    'SECURE_DELETE_FAILED', 'EMERGENCY_ACTIVATION_FAILED',
    'STEALTH_ACTIVATION_FAILED', 'THREAT_MONITOR_FAILED', 'THREAT_ASSESSMENT_FAILED',
  ];

  if (networkCodes.includes(code)) return new NetworkError(code, msg, context, rawError);
  if (encryptionCodes.includes(code)) return new EncryptionError(code, msg, context, rawError);
  if (authCodes.includes(code)) return new AuthError(code, msg, context, rawError);
  if (securityCodes.includes(code)) return new SecurityError(code, msg, context, rawError);
  return new ChatError(code, msg, context, rawError);
}

/** Type guard to check if an error is a ChatError */
export function isChatError(err: unknown): err is ChatError {
  return err instanceof ChatError;
}

/** Type guard to check if a ChatError is a network error (eligible for offline queue) */
export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError;
}

/** Type guard to check if a ChatError is an encryption error (eligible for re-key) */
export function isEncryptionError(err: unknown): err is EncryptionError {
  return err instanceof EncryptionError;
}
