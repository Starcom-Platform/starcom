/**
 * 🛡️ UNIFIED SECURE LOGGER
 * Consolidates all secure logging utilities with enhanced security controls
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'audit' | 'security';

/**
 * ─── THERE IS NO LOG CLASSIFICATION ────────────────────────────────────────
 *
 * `classification?: 'PUBLIC' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET'` stood
 * on this interface. It governed log VERBOSITY, not access to anything: the one
 * place it was read, `shouldLogInProduction`, treated `=== 'TOP_SECRET'` as
 * "always emit in production" — backwards from any real handling semantics,
 * where the most sensitive line is the one you suppress. Nothing redacted,
 * restricted, or routed a log on the strength of it.
 *
 * It was replaced by nothing rather than by an honestly-named `alwaysEmit`
 * flag, because the flag would have been born dead. Every caller that passed
 * 'TOP_SECRET' did so through `logSecurityEvent`, which logs at level
 * 'security' — and `shouldLogInProduction` already returns true for
 * security/audit/error regardless. So the tier never changed the outcome for
 * any existing call site, and adding an option nobody needs is the wiring-stub
 * defect this codebase keeps finding.
 *
 * If a debug-level line ever genuinely must survive production suppression,
 * add the flag then, with the caller that needs it.
 */
export interface LogContext {
  component: string;
  operation?: string;
  userId?: string; // Will be hashed
  sessionId?: string; // Will be hashed
  sanitize?: boolean;
  threatLevel?: 'normal' | 'elevated' | 'high' | 'critical';
}

export interface SecurityAuditLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  component: string;
  operation: string;
  userId?: string; // Hashed
  sessionId?: string; // Hashed
  result: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'BLOCKED';
  threatLevel: string;
  metadata?: Record<string, unknown>; // Sanitized
  /**
   * A tamper-evidence TAG, not a signature.
   *
   * Documented as "Cryptographic signature for log integrity". signLog()
   * produces it by XOR-ing the serialised log against a per-session random key
   * and base64-ing the result, under its own comment "use proper HMAC in
   * production". XOR with a reused key is not a MAC: anyone who can read one
   * log and its tag can recover key material and forge the rest.
   *
   * It does detect accidental corruption, which is worth keeping, so the field
   * stays and the claim does not. Real signing exists in this codebase
   * (PQCryptoService.signMessage, ML-DSA-65) if log integrity is ever a
   * requirement rather than a nicety.
   */
  tamperTag?: string;
}

export interface LogMetrics {
  totalLogs: number;
  errorCount: number;
  warningCount: number;
  securityEvents: number;
  lastAuditTime: Date;
  /** See verifyLogIntegrity: ALTERED means a tag mismatch, i.e. corruption. */
  integrityStatus: 'INTACT' | 'ALTERED' | 'UNKNOWN';
}

export interface ComplianceReport {
  id: string;
  /*
   * Was a `reportType` union of four named compliance regimes plus
   * 'CUSTOM'. Nothing in
   * this repository generates a ComplianceReport — there is no function that
   * produces one, for any of those four regimes. A type asserting the ability
   * to emit an audit report for one of those regimes is a capability claim with no
   * implementation, and those four names carry real regulatory weight.
   */
  reportType: 'AUDIT_EXPORT' | 'CUSTOM';
  generatedAt: Date;
  reportPeriod: {
    start: Date;
    end: Date;
  };
  summary: {
    totalEvents: number;
    securityEvents: number;
    complianceViolations: number;
    dataAccessEvents: number;
    authenticationEvents: number;
  };
  findings: ComplianceFinding[];
  recommendations: string[];
  auditTrail: {
    generatedBy: string;
    reviewedBy?: string;
    approvedBy?: string;
    digitalSignature: string;
  };
}

export interface ComplianceFinding {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: 'ACCESS_CONTROL' | 'DATA_PROTECTION' | 'AUDIT_TRAIL' | 'ENCRYPTION' | 'INCIDENT_RESPONSE';
  description: string;
  affectedSystems: string[];
  evidence: string[];
  remediation: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'RISK_ACCEPTED';
  detectedAt: Date;
  resolvedAt?: Date;
}

export interface ComplianceMetrics {
  /*
   * `complianceScore: number` was declared here. Nothing computes it. See the
   * note on reportType: this is a log export, not a compliance assessment.
   */
  lastAssessment: Date;
  openFindings: number;
  criticalFindings: number;
  averageResolutionTime: number; // hours
  trendsOverTime: {
    month: string;
    score: number;
    findings: number;
  }[];
}

/**
 * Unified Secure Logger with quantum-safe audit trails
 */
export class SecureLogger {
  private static instance: SecureLogger;
  private auditLogs: Map<string, SecurityAuditLog> = new Map();
  private logBuffer: SecurityAuditLog[] = [];
  private readonly maxBufferSize = 1000;
  private readonly logSigningKey: string;
  
  private readonly SENSITIVE_FIELDS = [
    'password', 'token', 'signature', 'privateKey', 'mnemonic', 'wallet',
    'auth', 'session', 'credential', 'secret', 'key', 'pin', 'otp', 'seed'
  ];

  // A SECURITY_CLASSIFICATIONS set sat here to validate the tier field. It was
  // already dead before the field was: nothing read it.

  private constructor() {
    this.logSigningKey = this.generateLogSigningKey();
    this.initializeSecureLogging();
  }

  static getInstance(): SecureLogger {
    if (!SecureLogger.instance) {
      SecureLogger.instance = new SecureLogger();
    }
    return SecureLogger.instance;
  }

  private generateLogSigningKey(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private initializeSecureLogging(): void {
    // Setup periodic log buffer flush
    setInterval(() => {
      this.flushLogBuffer();
    }, 30000); // Flush every 30 seconds

    // Setup integrity checking
    setInterval(() => {
      this.verifyLogIntegrity();
    }, 300000); // Check integrity every 5 minutes
  }

  private generateLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Redact a value out of the log.
   *
   * ─── THIS USED TO "HASH" SECRETS WITH A 32-BIT NON-CRYPTO HASH ───────────
   *
   * It was `hashSensitiveData`, a djb2-style loop truncated to 32 bits, under
   * the comment "use proper cryptographic hash in production". sanitizeData
   * routes every field whose name contains password, token, privateKey,
   * mnemonic, wallet, secret, key, pin, otp or seed through it.
   *
   * A 32-bit digest of a short secret is brute-forceable in moments, so the
   * output was not protection — but it LOOKED like protection, which is the
   * defect. Redaction does not need a digest: the point is that the value does
   * not reach the log.
   *
   * The length is kept because it is occasionally diagnostic and reveals
   * nothing recoverable.
   */
  private redactSensitiveData(data: string): string {
    return `[redacted:${data.length}]`;
  }

  /**
   * A stable per-session token for correlating one subject across log lines.
   *
   * Distinct from redaction on purpose: userId and sessionId need to be
   * CORRELATABLE (did this actor do these five things?) while not being the
   * identifier itself. Salted with the per-session key so the mapping does not
   * survive a reload and cannot be precomputed against a known id.
   */
  private correlationToken(data: string): string {
    let hash = 0;
    const salted = `${this.logSigningKey}:${data}`;
    for (let i = 0; i < salted.length; i++) {
      hash = ((hash << 5) - hash) + salted.charCodeAt(i);
      hash = hash & hash;
    }
    return `ref_${Math.abs(hash).toString(16)}`;
  }

  /**
   * See the note on `tamperTag`: corruption detection, not authentication.
   *
   * `& 0xff` is not cosmetic. btoa() throws InvalidCharacterError on any code
   * unit above 255, and this XOR previously fed it raw UTF-16 units — so a
   * single non-Latin-1 character anywhere in a log (an emoji in a message, an
   * accented name in an error) made the audit-log writer throw. The mask keeps
   * the tag in btoa's domain. It is safe because the key is regenerated per
   * instance, so a tag is only ever compared against one computed in the same
   * session by this same function.
   */
  private computeTamperTag(log: SecurityAuditLog): string {
    const logString = JSON.stringify(log);
    let tag = '';
    for (let i = 0; i < logString.length; i++) {
      const keyChar = this.logSigningKey.charCodeAt(i % this.logSigningKey.length);
      const logChar = logString.charCodeAt(i);
      tag += String.fromCharCode((logChar ^ keyChar) & 0xff);
    }
    return btoa(tag);
  }

  private sanitizeData(data: unknown): unknown {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    const sanitized: Record<string, unknown> = {};
    const obj = data as Record<string, unknown>;

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = this.SENSITIVE_FIELDS.some(field => 
        lowerKey.includes(field.toLowerCase())
      );

      if (isSensitive) {
        sanitized[key] = this.redactSensitiveData(String(value));
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private isProductionAndLoggingDisabled(): boolean {
    return process.env.NODE_ENV === 'production' && 
           process.env.REACT_APP_ENABLE_LOGGING !== 'true';
  }

  /**
   * Whether a line survives production log suppression.
   *
   * Took a `classification` second argument and OR'd in `=== 'TOP_SECRET'`.
   * Every caller that supplied TOP_SECRET routed through a level already
   * covered by the first three clauses, so the tier never decided this for
   * anybody — see the note on LogContext.
   */
  private shouldLogInProduction(level: LogLevel): boolean {
    // Always log security events and errors in production
    return level === 'security' || level === 'audit' || level === 'error';
  }

  /**
   * Main secure logging method with enhanced security controls
   */
  log(level: LogLevel, message: string, data?: unknown, context?: LogContext): void {
    // Production safety check
    if (this.isProductionAndLoggingDisabled() &&
        !this.shouldLogInProduction(level)) {
      return;
    }

    const logId = this.generateLogId();
    const sanitizedData = context?.sanitize !== false ? this.sanitizeData(data) : data;
    
    const auditLog: SecurityAuditLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      level,
      component: context?.component || 'unknown',
      operation: context?.operation || 'general',
      userId: context?.userId ? this.correlationToken(context.userId) : undefined,
      sessionId: context?.sessionId ? this.correlationToken(context.sessionId) : undefined,
      result: 'SUCCESS',
      threatLevel: context?.threatLevel || 'normal',
      metadata: sanitizedData ? { message, data: sanitizedData } : { message }
    };

    // Sign the log for integrity
    auditLog.tamperTag = this.computeTamperTag(auditLog);

    // Store in memory and buffer
    this.auditLogs.set(logId, auditLog);
    this.logBuffer.push(auditLog);

    // Manage buffer size
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
    }

    // Console output for development
    if (process.env.NODE_ENV === 'development') {
      const consoleMethod = this.getConsoleMethod(level);
      consoleMethod(`[${level.toUpperCase()}] ${context?.component || 'STARCOM'}: ${message}`, 
                   sanitizedData || '');
    }
  }

  private getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
    switch (level) {
      case 'error':
        return console.error;
      case 'warn':
        return console.warn;
      case 'info':
      case 'audit':
      case 'security':
        return console.info;
      case 'debug':
      default:
        return console.debug;
    }
  }

  /**
   * Specialized security event logging
   */
  logSecurityEvent(
    event: string, 
    result: 'SUCCESS' | 'FAILURE' | 'BLOCKED',
    context: LogContext,
    metadata?: Record<string, unknown>
  ): void {
    const securityContext: LogContext = {
      ...context,
      // Set `classification: context.classification || 'SECRET'` here. It
      // changed nothing: this logs at level 'security', which
      // shouldLogInProduction already always emits.
      operation: event,
      threatLevel: context.threatLevel || 'elevated'
    };

    this.log('security', `Security Event: ${event}`, { result, ...metadata }, securityContext);
  }

  /**
   * Audit trail logging for compliance
   */
  logAuditEvent(
    action: string,
    userId: string,
    result: 'SUCCESS' | 'FAILURE',
    context: LogContext,
    metadata?: Record<string, unknown>
  ): void {
    const auditContext: LogContext = {
      ...context,
      // Same as logSecurityEvent: this logs at level 'audit', already
      // always-emitted, so the tier it set was inert.
      operation: action,
      userId,
      sanitize: true
    };

    this.log('audit', `Audit: ${action}`, { result, ...metadata }, auditContext);
  }

  /**
   * Get security metrics and log health
   */
  getMetrics(): LogMetrics {
    const logs = Array.from(this.auditLogs.values());
    
    return {
      totalLogs: logs.length,
      errorCount: logs.filter(l => l.level === 'error').length,
      warningCount: logs.filter(l => l.level === 'warn').length,
      securityEvents: logs.filter(l => l.level === 'security').length,
      lastAuditTime: new Date(),
      integrityStatus: this.verifyLogIntegrity() ? 'INTACT' : 'ALTERED'
    };
  }

  /**
   * Recompute every log's tamper tag and report whether they all still match.
   *
   * This detects CORRUPTION — a log mutated in place by a bug, a bad merge of
   * the in-memory map, a truncated field. It does not detect a determined
   * tamperer, who can recompute the tag as easily as this method can (see the
   * note on `tamperTag`). The reported status word is chosen accordingly.
   */
  private verifyLogIntegrity(): boolean {
    let integrityValid = true;

    for (const log of this.auditLogs.values()) {
      const { tamperTag, ...logWithoutTag } = log;
      const expectedTag = this.computeTamperTag(logWithoutTag as SecurityAuditLog);

      if (tamperTag !== expectedTag) {
        integrityValid = false;
        console.error('Audit log does not match its tamper tag:', log.id);
      }
    }

    return integrityValid;
  }

  /**
   * Get recent security events for threat analysis
   */
  getSecurityEvents(limit: number = 100): SecurityAuditLog[] {
    return Array.from(this.auditLogs.values())
      .filter(log => log.level === 'security' || log.level === 'audit')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Flush log buffer to persistent storage (if configured)
   */
  private flushLogBuffer(): void {
    if (this.logBuffer.length === 0) return;

    // In production, this would send logs to secure log aggregation service
    console.debug(`Flushing ${this.logBuffer.length} logs to secure storage`);
    
    // Clear the buffer after flushing
    this.logBuffer = [];
  }

  /**
   * Clear all logs (for emergency situations)
   */
  clearLogs(): void {
    this.auditLogs.clear();
    this.logBuffer = [];
    console.warn('🚨 All security logs have been cleared');
  }

  /**
   * Export logs for compliance or analysis
   */
  exportLogs(): SecurityAuditLog[] {
    /*
     * Took an optional classification and, when given one, returned only logs
     * whose tier matched EXACTLY. No caller ever passed it — verified across
     * src/ — which is as well: a "compliance export" that silently returns a
     * subset based on a label the logger itself defaulted to 'CONFIDENTIAL'
     * would have been worse than one that returns everything.
     */
    return Array.from(this.auditLogs.values());
  }
}

// Singleton export
export const secureLogger = SecureLogger.getInstance();

// Convenience functions
export const logSecurityEvent = (
  event: string,
  result: 'SUCCESS' | 'FAILURE' | 'BLOCKED',
  context: LogContext,
  metadata?: Record<string, unknown>
) => secureLogger.logSecurityEvent(event, result, context, metadata);

export const logAuditEvent = (
  action: string,
  userId: string,
  result: 'SUCCESS' | 'FAILURE',
  context: LogContext,
  metadata?: Record<string, unknown>
) => secureLogger.logAuditEvent(action, userId, result, context, metadata);
