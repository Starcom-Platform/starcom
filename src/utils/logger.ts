/**
 * Logger utility for standardized logging throughout the application.
 * Centralizes log formatting, level control, and production silencing.
 *
 * Usage:
 *   import { createLogger } from '@utils/logger';
 *   const log = createLogger({ prefix: 'MyComponent' });
 *   log.debug('Initializing...', someData);
 *   log.error('Failed to load:', error);
 *
 * In production, only ERROR and WARN are emitted by default.
 * Set `localStorage.setItem('starcom_log_level', 'DEBUG')` to override at runtime.
 */

// Log levels in order of verbosity
export enum LogLevel {
  SILENT = -1,
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  enableConsole?: boolean;
}

/** Resolve the default log level from environment and runtime overrides. */
function resolveDefaultLevel(): LogLevel {
  // Runtime override via localStorage (useful for debugging production)
  try {
    const override = localStorage.getItem('starcom_log_level');
    if (override && override in LogLevel) {
      return LogLevel[override as keyof typeof LogLevel];
    }
  } catch {
    // localStorage unavailable (SSR, tests, etc.)
  }

  // Vite exposes mode via import.meta.env
  try {
    // NOT `(import.meta as any).env?.PROD`. The cast stops Vite recognising
    // this as a static read, so it emits the WHOLE env object instead of
    // substituting one value — and this module is imported almost everywhere,
    // which put every VITE_ variable into several chunks at once.
    if (import.meta.env.PROD) return LogLevel.WARN;
  } catch {
    // Fallback for non-Vite environments
  }

  return LogLevel.DEBUG;
}

class Logger {
  private level: LogLevel;
  private prefix: string;
  private enableConsole: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? resolveDefaultLevel();
    this.prefix = options.prefix ?? '';
    this.enableConsole = options.enableConsole ?? true;
  }

  /** Set the current log level. */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /** Get the current log level. */
  getLevel(): LogLevel {
    return this.level;
  }

  private formatPrefix(): string {
    return this.prefix ? `[${this.prefix}]` : '';
  }

  /** Log an error message (level 0 — always shown unless SILENT). */
  error(message: unknown, ...args: unknown[]): void {
    if (this.level >= LogLevel.ERROR && this.enableConsole) {
      console.error(this.formatPrefix(), message, ...args);
    }
  }

  /** Log a warning message (level 1). */
  warn(message: unknown, ...args: unknown[]): void {
    if (this.level >= LogLevel.WARN && this.enableConsole) {
      console.warn(this.formatPrefix(), message, ...args);
    }
  }

  /** Log an info message (level 2). */
  info(message: unknown, ...args: unknown[]): void {
    if (this.level >= LogLevel.INFO && this.enableConsole) {
      console.info(this.formatPrefix(), message, ...args);
    }
  }

  /** Log a debug message (level 3 — suppressed in production by default). */
  debug(message: unknown, ...args: unknown[]): void {
    if (this.level >= LogLevel.DEBUG && this.enableConsole) {
      console.debug(this.formatPrefix(), message, ...args);
    }
  }

  /** Create a child logger with a specific prefix. */
  createChildLogger(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      enableConsole: this.enableConsole,
    });
  }
}

/** Default application-wide logger instance. */
export const logger = new Logger();

/** Create a domain-specific logger with a prefix (e.g. component or service name). */
export const createLogger = (options: LoggerOptions): Logger => {
  return new Logger(options);
};

export type { Logger };
export default logger;
