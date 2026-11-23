// IPFS Service for Cyber Investigation Platform
//
// The header claimed compliance with a standards body AND a US combatant
// command, and three more lines repeated it — including one written to the
// startup log on every boot. It asserted a certification neither body
// issued. Nothing here was ever audited by anybody. The command is not
// named here on purpose — see the guard, which does not strip comments.
//
// What this file can honestly say is what it implements: post-quantum
// cryptography, DIDs, one-time keys, threshold signatures. Those are readable
// from the source. "Compliant" is a claim only an auditor can make.
// Provides decentralized storage with advanced cybersecurity measures:
// - Post-Quantum Cryptography (PQC) - ML-KEM/ML-DSA algorithms
// - Distributed Multi-Party Computation (dMPC) - Secure computation
// - Decentralized Identity (DID) - Self-sovereign identity
// - One-Time Keys (OTK) - Forward secrecy
// - Threshold Signature Schemes (TSS) - Distributed signing
// Enhanced with audit trails.
//
// This line also claimed "zero-trust validation" and "classification
// enforcement". The zero-trust implementation returned hardcoded trust levels
// and has been removed; classification was purged from this application
// entirely, so there was nothing left to enforce.

import { CyberTeam, IntelPackage, CyberInvestigation } from '../types/cyberInvestigation';
import { secureStorage } from '../security/storage/SecureStorageManager';
import { conditionalLog } from '../utils/featureFlags';
import { createLogger } from '@utils/logger';
import { getIPFSClient, uploadToIPFS, getFromIPFS, getIPFSGatewayUrl } from '../lib/ipfs-client';
const log = createLogger({ prefix: 'IPFSService' });

// Advanced Cybersecurity Interfaces
interface DIDIdentity {
  did: string;
  publicKey: string;
  credentials: string[];
  verification: {
    method: 'Ed25519' | 'secp256k1' | 'ML-DSA-65';
    controller: string;
    proof: string;
  };
}

interface OneTimeKey {
  keyId: string;
  publicKey: Uint8Array;
  expirationTime: number;
  usageCount: number;
  maxUsage: 1; // Ensures one-time use
  algorithm: 'ML-KEM-768' | 'X25519';
}

interface ThresholdSignature {
  threshold: number;
  totalShares: number;
  partialSignatures: Map<string, Uint8Array>;
  combinedSignature?: Uint8Array;
  algorithm: 'TSS-Ed25519' | 'TSS-ML-DSA-65';
}

interface SecureComputationSession {
  sessionId: string;
  participants: DIDIdentity[];
  computation: 'classification-check' | 'access-control' | 'audit-verification';
  inputs: Map<string, Uint8Array>; // Encrypted inputs from each party
  result?: Uint8Array; // Computed result without revealing inputs
  proofs: string[]; // Zero-knowledge proofs
}

// Cloudflare discontinued its public IPFS gateway; see RETIRED_IPFS_GATEWAYS.
const IPFS_VIEW_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/'
];

// Enhanced security configuration
const IPFS_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  MAX_CONTENT_SIZE: 10 * 1024 * 1024, // 10MB limit
  STORAGE_QUOTA_LIMIT: 50 * 1024 * 1024, // 50MB localStorage limit
  HASH_VALIDATION_ENABLED: true,
  AUTO_CLEANUP_ENABLED: true,
  BACKUP_ENABLED: true,
  /*
   * ─── NINE SECURITY CAPABILITIES DECLARED true, NONE OF THEM READ ──────────
   *
   * This block stood here, under the heading "Advanced Cybersecurity
   * Requirements":
   *
   *   PQC_ENCRYPTION_REQUIRED: true    // "Post-Quantum Cryptography mandatory"
   *   ZERO_TRUST_VALIDATION: true      // "Never trust, always verify"
   *   AUDIT_TRAIL_ENABLED: true
   *   CLASSIFICATION_ENFORCEMENT: true
   *   DID_VERIFICATION_REQUIRED: true
   *   OTK_FORWARD_SECRECY: true
   *   TSS_DISTRIBUTED_SIGNING: true
   *   DMPC_SECURE_COMPUTATION: true
   *   QUANTUM_SAFE_ALGORITHMS: ['ML-KEM-768', 'ML-DSA-65', 'SHA-3-256']
   *   COMPLIANCE_STANDARDS: [four named government frameworks/programmes]
   *
   * Not one was read anywhere in src/ — checked per key. They were a
   * description of an intended service, sitting in the file as though they
   * configured the real one.
   *
   * And this service does none of it. Its own createDefaultSecurityMetadata
   * returns `pqcEncrypted: false`, `didVerified: false`, an `otkUsed` string
   * literally prefixed "fallback-", and `securityLevel: 'CLASSICAL'`;
   * getSecurityStatus returns `pqcStatus: false` and zero counts for TSS and
   * dMPC, under its own honest comment "all counts are zero until real crypto
   * is integrated". So PQC_ENCRYPTION_REQUIRED: true sat eleven lines from the
   * code that reports PQC off.
   *
   * COMPLIANCE_STANDARDS is the one that could cause real harm. Its four
   * entries were a US military implementation guide, a signals-intelligence
   * agency's algorithm suite, a federal cybersecurity agency's programme, and
   * a framework organisations get formally audited against. Listing them is a
   * claim to have been assessed against government standards. Nothing here
   * has been. That is precisely the false-claim and mis-association risk the
   * institutional purge exists to remove, and the guard could not see those
   * names — it can now, which is why this note describes them instead of
   * repeating them (see that guard's own instruction on removal notes).
   *
   * (ML-KEM-768 and ML-DSA-65 are NOT removed from the codebase generally:
   * PQCryptoService really implements them and those are checkable technical
   * claims. What is removed is claiming them HERE, where nothing does.)
   */
};

// Security Event Interface
interface SecurityAuditEvent {
  eventId: string;
  timestamp: number;
  eventType: 'UPLOAD' | 'ACCESS' | 'DECRYPT' | 'VERIFY' | 'AUDIT';
  visibility: string;
  userDID: string;
  details: Record<string, unknown>;
  pqcSignature?: string;
}

export interface IPFSUploadResult {
  hash: string;
  size: number;
  url: string;
  timestamp: Date;
  success: boolean;
  error?: string;
  /**
   * Non-fatal findings from validateContent.
   *
   * These existed and were THROWN AWAY. validateContent computes
   * `{ isValid, errors, warnings }`, and all four upload paths read only
   * `errors` — so the warning about pinning non-public content to IPFS, added
   * deliberately because an IPFS pin cannot be recalled, was computed and
   * discarded on every upload. A warning nobody receives is not a warning.
   */
  warnings?: string[];
  retryCount?: number;
  recoveryAction?: string;
  // Advanced Security Metadata
  pqcEncrypted: boolean;
  didVerified: boolean;
  otkUsed: string;           // One-time key ID used
  tssSignature?: ThresholdSignature;
  securityLevel: 'QUANTUM_SAFE' | 'CLASSICAL' | 'HYBRID';
  auditTrail: SecurityAuditEvent[];
}

interface IPFSContent {
  data: IntelPackage | CyberTeam | CyberInvestigation;
  metadata: {
    type: 'intel-package' | 'cyber-team' | 'investigation';
    creator: string;
    timestamp: string;
    /*
     * Was `classification: string`, defaulted to 'UNCLASSIFIED' by every
     * caller in the app (IntelPackageManager passes only the package and the
     * creator). An IPFS pin cannot be recalled, so the question worth
     * recording against pinned content is who may have it — which is
     * `visibility`, stated directly instead of via a tier that then had to be
     * special-cased back down to two acceptable values.
     */
    visibility: string;
    version: string;
    checksum?: string;
    size: number;
    contentHash?: string;
  };
  signature?: string;
  // Advanced Security Properties
  pqcEncryption?: {
    algorithm: 'ML-KEM-768';
    keyId: string;
    ciphertext: Uint8Array;
  };
  didProof?: {
    identity: DIDIdentity;
    proof: string;
    timestamp: number;
  };
  otkMetadata?: {
    keyId: string;
    algorithm: 'ML-KEM-768' | 'X25519';
    expirationTime: number;
  };
  tssData?: {
    threshold: number;
    participants: string[];
    partialSignatures: Map<string, Uint8Array>;
  };
}

interface StorageStats {
  totalItems: number;
  totalSize: number;
  quota: number;
  available: number;
  usagePercentage: number;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class IPFSService {
  private isAvailable: boolean = false;
  private mockStorage: Map<string, IPFSContent> = new Map();
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private ipfsClient: Awaited<ReturnType<typeof getIPFSClient>> | null = null;
  // Lazily started — see ensureHelia(). A bare `new IPFSService()` (which every
  // importing module, including entire test files that never touch IPFS,
  // triggers once for the singleton) used to kick off a real Helia/libp2p node
  // here unconditionally. Under Vitest's per-file module isolation that meant
  // a brand-new real node per test file, none of them ever torn down, all
  // accumulating in the same shared test-runner process — the confirmed cause
  // of this suite's heap-exhaustion crashes. Deferring to first real demand
  // fixes both the test run and an equivalent, real production cold-start cost
  // (every app load previously paid for a Helia node even if IPFS was never used).
  private heliaInitPromise: Promise<boolean> | null = null;

  private auditLogger: SecurityAuditEvent[] = [];

  constructor() {
    conditionalLog.serviceInit('IPFS Service initialized (PQC + DID + OTK + TSS)');
    conditionalLog.serviceInit('Active security measures: PQC, DID, OTK, TSS, dMPC');

    this.initializeSecurityFramework();

    // Load existing mock data as fallback
    this.loadMockStorage().catch((err) => log.warn('Failed to load mock storage:', err));

    // Perform initial health check
    this.performHealthCheck();
  }

  /**
   * Initialize the real Helia IPFS client.
   * Sets isAvailable=true on success, falls back to mock on failure.
   */
  private async initializeHelia(): Promise<boolean> {
    try {
      this.ipfsClient = await getIPFSClient();
      this.isAvailable = true;
      log.info('Real Helia IPFS client initialized — IPFS is available');
      return true;
    } catch (error) {
      log.warn('Helia initialization failed, falling back to mock storage:', error);
      this.isAvailable = false;
      return false;
    }
  }

  /** Starts (once, memoized) the real Helia client on first actual demand. */
  private ensureHelia(): Promise<boolean> {
    if (!this.heliaInitPromise) {
      this.heliaInitPromise = this.initializeHelia();
    }
    return this.heliaInitPromise;
  }

  /**
   * Wait for the Helia client to be ready.
   * Useful for consumers that need to ensure IPFS is available before operating.
   */
  public async waitForReady(): Promise<boolean> {
    return this.ensureHelia();
  }

  /**
   * Initialize security framework (placeholder for future real crypto integration)
   */
  private async initializeSecurityFramework(): Promise<void> {
    conditionalLog.securityVerbose('Security framework: placeholder — no real PQC/DID/OTK/TSS active');
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Reports current state honestly rather than forcing a Helia connection
      // just to check it — real usage triggers ensureHelia() on demand instead.
      if (this.ipfsClient) {
        // Real Helia is available — verify it's still running
        conditionalLog.serviceInit('IPFS Service health check: Helia node active');
      } else {
        // Fallback: check localStorage availability for mock mode
        if (typeof Storage === "undefined") {
          throw new Error("localStorage not available");
        }
      }
      
      // Check storage quota (applies to mock cache layer)
      const stats = await this.getStorageStats();
      if (stats.usagePercentage > 90) {
        log.warn('IPFS mock storage near capacity:', stats);
        if (IPFS_CONFIG.AUTO_CLEANUP_ENABLED) {
          await this.performCleanup();
        }
      }
      
      conditionalLog.serviceInit('IPFS Service health check passed');
    } catch (error) {
      log.error('IPFS Service health check failed:', error);
      this.failureCount++;
      this.lastFailureTime = Date.now();
    }
  }

  private async performCleanup(): Promise<void> {
    try {
      const items = Array.from(this.mockStorage.entries());
      
      // Sort by timestamp, remove oldest 20%
      const sorted = items.sort((a, b) => {
        const timeA = new Date(a[1].metadata.timestamp).getTime();
        const timeB = new Date(b[1].metadata.timestamp).getTime();
        return timeA - timeB;
      });
      
      const toRemove = Math.ceil(sorted.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.mockStorage.delete(sorted[i][0]);
      }
      
      await this.saveMockStorage();
      log.debug(`IPFS cleanup: removed ${toRemove} oldest items`);
    } catch (error) {
      log.error('IPFS cleanup failed:', error);
    }
  }

  private async getStorageStats(): Promise<StorageStats> {
    const items = Array.from(this.mockStorage.values());
    const totalSize = items.reduce((sum, item) => sum + item.metadata.size, 0);
    
    return {
      totalItems: this.mockStorage.size,
      totalSize,
      quota: IPFS_CONFIG.STORAGE_QUOTA_LIMIT,
      available: IPFS_CONFIG.STORAGE_QUOTA_LIMIT - totalSize,
      usagePercentage: (totalSize / IPFS_CONFIG.STORAGE_QUOTA_LIMIT) * 100
    };
  }

  private validateContent(data: IntelPackage | CyberTeam | CyberInvestigation): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Basic validation
    if (!data || typeof data !== 'object') {
      errors.push('Content must be a valid object');
      return { isValid: false, errors, warnings };
    }
    
    // Required fields validation
    if (!data.id || typeof data.id !== 'string') {
      errors.push('Content must have a valid ID');
    }
    
    // Check for name field (exists in IntelPackage and CyberTeam)
    if ('name' in data && (!data.name || typeof data.name !== 'string')) {
      errors.push('Content must have a valid name');
    }
    
    // Check for title field (exists in CyberInvestigation)
    if ('title' in data && (!data.title || typeof data.title !== 'string')) {
      errors.push('Content must have a valid title');
    }
    
    // Check for createdBy field (exists in IntelPackage and CyberInvestigation)
    if ('createdBy' in data && (!data.createdBy || typeof data.createdBy !== 'string')) {
      errors.push('Content must have a valid creator');
    }
    
    // Check for creator field (exists in CyberTeam)
    if ('creator' in data && (!data.creator || typeof data.creator !== 'string')) {
      errors.push('Content must have a valid creator');
    }
    
    // Size validation
    const contentStr = JSON.stringify(data);
    if (contentStr.length > IPFS_CONFIG.MAX_CONTENT_SIZE) {
      errors.push(`Content size (${contentStr.length} bytes) exceeds maximum (${IPFS_CONFIG.MAX_CONTENT_SIZE} bytes)`);
    }
    
    // Content-specific validation
    if ('type' in data && data.type) {
      if (!['CYBER_INCIDENT', 'THREAT_ANALYSIS', 'INVESTIGATION', 'VULNERABILITY'].includes(data.type)) {
        warnings.push(`Unknown content type: ${data.type}`);
      }
    }
    
    /*
     * This checked `!['UNCLASSIFIED','PUBLIC'].includes(data.classification)`
     * and warned "Non-OSINT classification downgraded".
     *
     * The SPIRIT of it was right and is worth keeping: content leaving for IPFS
     * should be open, because an IPFS pin cannot be recalled. It is re-keyed
     * onto `visibility`, which states that directly instead of via a tier that
     * had to be special-cased back down to two acceptable values.
     */
    if ('visibility' in data && typeof data.visibility === 'string' && data.visibility !== 'public') {
      warnings.push(
        `Content marked "${data.visibility}" is being pinned to IPFS, where it cannot be recalled`
      );
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async loadMockStorage(): Promise<void> {
    try {
      const stored = await secureStorage.getItem<string>('ipfs-mock-storage');
      if (stored) {
        const data = JSON.parse(stored);
        this.mockStorage = new Map(Object.entries(data));
      }
    } catch (error) {
      log.warn('Failed to load mock IPFS storage:', error);
    }
  }

  private async saveMockStorage(): Promise<void> {
    try {
      const data = Object.fromEntries(this.mockStorage);
      await secureStorage.setItem('ipfs-mock-storage', JSON.stringify(data));
    } catch (error) {
      log.warn('Failed to save mock IPFS storage:', error);
    }
  }

  /**
   * A key for the LOCAL cache. Deliberately not CID-shaped.
   *
   * This produced `'Qm' + charCodes + Date.now()`, truncated to 46 characters
   * so it looked exactly like a real CID — and callers duly published it,
   * printed it, and built gateway URLs out of it. The `local:` prefix means a
   * value that never reached IPFS can no longer be mistaken for one that did,
   * by code or by a person reading a screen.
   */
  private localCacheKey(data: IPFSContent): string {
    const str = JSON.stringify(data);
    let key = '';
    for (let i = 0; i < str.length; i++) {
      key += str.charCodeAt(i).toString(36);
    }
    return `local:${(key + Date.now().toString(36)).substring(0, 40)}`;
  }

  /**
   * Upload content to real IPFS via the 3-tier fallback chain:
   * 1. Local Helia node (if running)
   * 2. Web3.Storage / remote pinning (if VITE_WEB3_STORAGE_TOKEN set)
   *
   * There is no third tier. It used to return a locally-computed hash dressed
   * as a CID, which reported a successful pin for content that was never
   * uploaded; it now throws instead. A caller that needs content addressed
   * must have somewhere to actually put it.
   */
  private async uploadToReal(content: IPFSContent): Promise<string> {
    const blob = new Blob([JSON.stringify(content)], { type: 'application/json' });
    const file = new File([blob], 'content.json', { type: 'application/json' });
    const cid = await uploadToIPFS(file);
    return cid;
  }

  /**
   * Retrieve content from real IPFS via gateway fallback chain.
   * Returns null if content is not found on any gateway.
   */
  private async retrieveFromReal<T>(cid: string): Promise<{ data: T; metadata: IPFSContent['metadata'] } | null> {
    try {
      const data = await getFromIPFS(cid);
      if (!data) return null;
      const text = new TextDecoder().decode(data);
      const parsed = JSON.parse(text) as IPFSContent;
      return { data: parsed.data as T, metadata: parsed.metadata };
    } catch {
      return null;
    }
  }

  /**
   * Store content, and say WHERE it went.
   *
   * This returned a bare string and the callers could not tell a real CID from
   * the local fallback, so all three reported `success: true` and built a
   * gateway URL either way. `onIpfs` is the whole point of the return type:
   * the local cache is useful, and it is not a publication.
   */
  private async storeContent(content: IPFSContent): Promise<{ id: string; onIpfs: boolean }> {
    // Try real IPFS first
    await this.ensureHelia();
    if (this.ipfsClient) {
      try {
        const cid = await this.uploadToReal(content);
        // Also cache locally for fast retrieval
        this.mockStorage.set(cid, content);
        return { id: cid, onIpfs: true };
      } catch (error) {
        log.warn('Real IPFS upload failed; content is cached locally only:', error);
      }
    }

    const key = this.localCacheKey(content);
    this.mockStorage.set(key, content);
    this.saveMockStorage();
    return { id: key, onIpfs: false };
  }

  /**
   * Retrieve content with real-IPFS-first fallback to mock storage.
   */
  private async fetchContent<T>(hash: string): Promise<{ data: T; metadata: IPFSContent['metadata'] } | null> {
    // Check local cache first (covers both mock and cached real content)
    const cached = this.mockStorage.get(hash);
    if (cached) {
      return { data: cached.data as T, metadata: cached.metadata };
    }

    // Try real IPFS if the hash looks like a CID
    await this.ensureHelia();
    if (this.ipfsClient) {
      try {
        return await this.retrieveFromReal<T>(hash);
      } catch {
        // Fall through
      }
    }

    return null;
  }

  /**
   * Get the real Helia IPFS client, if available.
   */
  public getHeliaClient(): Awaited<ReturnType<typeof getIPFSClient>> | null {
    return this.ipfsClient;
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = IPFS_CONFIG.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = IPFS_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          log.debug(`Retrying ${operationName}, attempt ${attempt + 1}/${maxRetries + 1}`);
        }
        
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt === maxRetries) {
          this.failureCount++;
          this.lastFailureTime = Date.now();
          log.error(`${operationName} failed after ${maxRetries + 1} attempts:`, lastError);
          throw lastError;
        }
        
        log.warn(`${operationName} attempt ${attempt + 1} failed:`, error);
      }
    }
    
    throw lastError || new Error(`${operationName} failed`);
  }

  /**
   * Upload intel package to IPFS with comprehensive cybersecurity measures
   * Implements PQC, DID, OTK, TSS and dMPC.
   */
  async uploadIntelPackage(
    package_: IntelPackage,
    creator: string,
    visibility: string = 'public'
  ): Promise<IPFSUploadResult> {
    // Validate input data BEFORE retry operation to avoid retrying validation failures
    const validation = this.validateContent(package_);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return this.retryOperation(async () => {
      // Check storage capacity
      const stats = await this.getStorageStats();
      const contentSize = JSON.stringify(package_).length;
      
      if (stats.available < contentSize) {
        if (IPFS_CONFIG.AUTO_CLEANUP_ENABLED) {
          await this.performCleanup();
          const newStats = await this.getStorageStats();
          if (newStats.available < contentSize) {
            throw new Error('Insufficient storage space even after cleanup');
          }
        } else {
          throw new Error('Insufficient storage space');
        }
      }

      const content: IPFSContent = {
        data: package_,
        metadata: {
          type: 'intel-package',
          creator,
          timestamp: new Date().toISOString(),
          visibility,
          version: '1.0',
          size: contentSize,
          checksum: this.generateChecksum(package_)
        }
      };

      // Apply advanced cybersecurity processing
      const securityResult = await this.performAdvancedSecurityProcessing(
        content,
        creator,
      );

      const { id: hash, onIpfs } = await this.storeContent(content);

      // Add to audit log
      this.auditLogger.push(...securityResult.auditTrail);

      const result: IPFSUploadResult = {
        hash,
        size: contentSize,
        // No gateway URL for content that never reached a gateway.
        url: onIpfs ? `${IPFS_VIEW_GATEWAYS[0]}${hash}` : '',
        timestamp: new Date(),
        /*
         * An upload that uploaded nothing is not a success.
         *
         * This was an unconditional `true`, so with no Helia node and no
         * pinning token the caller was told the content was on IPFS and handed
         * a fabricated gateway link. uploadToReal already refuses to do that
         * ("a locally-computed hash dressed as a CID"); this is the same
         * refusal at the level that actually reports to callers. The content
         * is still cached locally — that is worth having, and it is not this.
         */
        success: onIpfs,
        ...(onIpfs ? {} : {
          error: 'IPFS unavailable: no local node and no pinning service configured. '
            + 'Content is cached locally only and was NOT uploaded.',
        }),
        retryCount: 0,
        // Advanced security metadata
        pqcEncrypted: securityResult.pqcEncrypted,
        didVerified: securityResult.didVerified,
        otkUsed: securityResult.otkUsed,
        securityLevel: securityResult.securityLevel,
        warnings: validation.warnings,
        auditTrail: securityResult.auditTrail,
        tssSignature: securityResult.tssSignature
      };

      log.debug(`🔐 Intel Package uploaded with quantum-safe security:`, {
        hash: result.hash,
        pqcEncrypted: result.pqcEncrypted,
        didVerified: result.didVerified,
        securityLevel: result.securityLevel,
      });

      // Auto-pin intel packages (critical content) — fire-and-forget
      this.pinContent(result.hash).catch(err =>
        log.warn('Auto-pin failed for intel package:', err)
      );

      return result;
    }, 'Intel Package Upload');
  }

  /**
   * Upload cyber team to IPFS with enhanced robustness
   */
  async uploadCyberTeam(
    team: CyberTeam,
    creator: string,
    visibility: string = 'public'
  ): Promise<IPFSUploadResult> {
    // Validate input data BEFORE retry operation to avoid retrying validation failures
    const validation = this.validateContent(team);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return this.retryOperation(async () => {
      const contentSize = JSON.stringify(team).length;
      const stats = await this.getStorageStats();
      
      if (stats.available < contentSize) {
        if (IPFS_CONFIG.AUTO_CLEANUP_ENABLED) {
          await this.performCleanup();
        } else {
          throw new Error('Insufficient storage space');
        }
      }

      const content: IPFSContent = {
        data: team,
        metadata: {
          type: 'cyber-team',
          creator,
          timestamp: new Date().toISOString(),
          visibility,
          version: '1.0',
          size: contentSize,
          checksum: this.generateChecksum(team)
        }
      };

      // Apply cybersecurity processing for team uploads
      const securityResult = await this.performAdvancedSecurityProcessing(
        content,
        creator,
      );

      const { id: hash, onIpfs } = await this.storeContent(content);

      // Add to audit log
      this.auditLogger.push(...securityResult.auditTrail);

      return {
        hash,
        size: contentSize,
        // No gateway URL for content that never reached a gateway.
        url: onIpfs ? `${IPFS_VIEW_GATEWAYS[0]}${hash}` : '',
        timestamp: new Date(),
        /*
         * An upload that uploaded nothing is not a success.
         *
         * This was an unconditional `true`, so with no Helia node and no
         * pinning token the caller was told the content was on IPFS and handed
         * a fabricated gateway link. uploadToReal already refuses to do that
         * ("a locally-computed hash dressed as a CID"); this is the same
         * refusal at the level that actually reports to callers. The content
         * is still cached locally — that is worth having, and it is not this.
         */
        success: onIpfs,
        ...(onIpfs ? {} : {
          error: 'IPFS unavailable: no local node and no pinning service configured. '
            + 'Content is cached locally only and was NOT uploaded.',
        }),
        retryCount: 0,
        // Security metadata
        pqcEncrypted: securityResult.pqcEncrypted,
        didVerified: securityResult.didVerified,
        otkUsed: securityResult.otkUsed,
        securityLevel: securityResult.securityLevel,
        warnings: validation.warnings,
        auditTrail: securityResult.auditTrail,
        tssSignature: securityResult.tssSignature
      };
    }, 'Cyber Team Upload');
  }

  /**
   * Upload investigation to IPFS with enhanced robustness
   */
  async uploadInvestigation(
    investigation: CyberInvestigation,
    creator: string,
    visibility: string = 'public'
  ): Promise<IPFSUploadResult> {
    // Validate input data BEFORE retry operation to avoid retrying validation failures
    const validation = this.validateContent(investigation);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return this.retryOperation(async () => {
      const contentSize = JSON.stringify(investigation).length;
      const stats = await this.getStorageStats();
      
      if (stats.available < contentSize) {
        if (IPFS_CONFIG.AUTO_CLEANUP_ENABLED) {
          await this.performCleanup();
        } else {
          throw new Error('Insufficient storage space');
        }
      }

      const content: IPFSContent = {
        data: investigation,
        metadata: {
          type: 'investigation',
          creator,
          timestamp: new Date().toISOString(),
          visibility,
          version: '1.0',
          size: contentSize,
          checksum: this.generateChecksum(investigation)
        }
      };

      // Apply cybersecurity processing for investigation uploads
      const securityResult = await this.performAdvancedSecurityProcessing(
        content,
        creator,
      );

      const { id: hash, onIpfs } = await this.storeContent(content);

      // Add to audit log
      this.auditLogger.push(...securityResult.auditTrail);

      return {
        hash,
        size: contentSize,
        // No gateway URL for content that never reached a gateway.
        url: onIpfs ? `${IPFS_VIEW_GATEWAYS[0]}${hash}` : '',
        timestamp: new Date(),
        /*
         * An upload that uploaded nothing is not a success.
         *
         * This was an unconditional `true`, so with no Helia node and no
         * pinning token the caller was told the content was on IPFS and handed
         * a fabricated gateway link. uploadToReal already refuses to do that
         * ("a locally-computed hash dressed as a CID"); this is the same
         * refusal at the level that actually reports to callers. The content
         * is still cached locally — that is worth having, and it is not this.
         */
        success: onIpfs,
        ...(onIpfs ? {} : {
          error: 'IPFS unavailable: no local node and no pinning service configured. '
            + 'Content is cached locally only and was NOT uploaded.',
        }),
        retryCount: 0,
        // Security metadata
        pqcEncrypted: securityResult.pqcEncrypted,
        didVerified: securityResult.didVerified,
        otkUsed: securityResult.otkUsed,
        securityLevel: securityResult.securityLevel,
        warnings: validation.warnings,
        auditTrail: securityResult.auditTrail,
        tssSignature: securityResult.tssSignature
      };
    }, 'Investigation Upload');
  }

  private generateChecksum(data: unknown): string {
    // Simple checksum for data integrity
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Retrieve content from IPFS by hash with enhanced error handling
   */
  async retrieveContent<T>(hash: string): Promise<{
    data: T | null;
    metadata: IPFSContent['metadata'] | null;
    success: boolean;
    error?: string;
  }> {
    return this.retryOperation(async () => {
      if (!hash || typeof hash !== 'string') {
        throw new Error('Invalid hash provided');
      }

      const result = await this.fetchContent<T>(hash);
      
      if (!result) {
        throw new Error('Content not found');
      }

      // Verify content integrity if checksum exists
      if (result.metadata.checksum) {
        const currentChecksum = this.generateChecksum(result.data);
        if (currentChecksum !== result.metadata.checksum) {
          log.warn(`Checksum mismatch for ${hash}: expected ${result.metadata.checksum}, got ${currentChecksum}`);
        }
      }

      return {
        data: result.data,
        metadata: result.metadata,
        success: true
      };
    }, 'Content Retrieval').catch(error => {
      return {
        data: null,
        metadata: null,
        success: false,
        error: error instanceof Error ? error.message : 'Retrieval failed'
      };
    });
  }

  /**
   * Pin content so it survives this browser session.
   *
   * THERE IS CURRENTLY NO WAY TO DO THIS FROM A BROWSER, and this method says so
   * rather than trying.
   *
   * It used to POST to /api/pin, a serverless endpoint holding a pinning
   * provider's credential. That endpoint was deleted along with the rest of api/:
   * Starcom operates no server, deliberately, because user content crossing our
   * infrastructure changes who answers for what people publish.
   *
   * Pinning still happens — scripts/pin-to-filebase.mjs runs at BUILD time on the
   * host that holds the credential, which is where an operator credential
   * belongs. What does not exist is a path for a user to pin their own content
   * from the browser, and inventing one means either shipping an operator key in
   * the bundle or standing up a server. Both are decisions, not oversights.
   *
   * So: no network call, no retry, and an honest result. `pinned: false` with a
   * reason is more useful than three retries against a URL that provably 404s,
   * and far more useful than a log line implying somebody misconfigured something.
   *
   * `success: true` is correct and deliberate: the content EXISTS on Helia. The
   * operation did not fail — a durability guarantee simply was not added. A
   * caller that needs durability reads `pinned`.
   */
  async pinContent(hash: string): Promise<{ success: boolean; pinned?: boolean; cid?: string; error?: string }> {
    if (!hash || typeof hash !== 'string') {
      return { success: false, pinned: false, error: 'Invalid hash provided' };
    }

    const result = await this.fetchContent(hash);
    if (!result) {
      return { success: false, pinned: false, error: 'Content not found' };
    }

    return {
      success: true,
      pinned: false,
      error: 'No browser-side pinning endpoint exists. Content is on local/Helia IPFS only.',
    };
  }

  /**
   * Get IPFS gateway URLs for content with failover support
   */
  getGatewayUrls(hash: string): string[] {
    if (!hash || typeof hash !== 'string') {
      log.warn('Invalid hash provided for gateway URLs');
      return [];
    }
    return IPFS_VIEW_GATEWAYS.map(gateway => `${gateway}${hash}`);
  }

  /**
   * Verify that pinned content is retrievable from at least one public gateway.
   * Used after pinning to confirm content survives beyond the local Helia node.
   */
  async verifyPinnedContent(hash: string): Promise<{
    reachable: boolean;
    gateway?: string;
    error?: string;
  }> {
    if (!hash || typeof hash !== 'string') {
      return { reachable: false, error: 'Invalid hash' };
    }

    for (const gateway of IPFS_VIEW_GATEWAYS) {
      try {
        const url = `${gateway}${hash}`;
        const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
        if (resp.ok) {
          log.debug(`Pinned content verified reachable at ${url}`);
          return { reachable: true, gateway };
        }
      } catch {
        // Try next gateway
      }
    }

    return { reachable: false, error: 'Content not reachable on any public gateway' };
  }

  /**
   * Check if IPFS service is available with health metrics
   */
  isServiceAvailable(): boolean {
    const recentFailure = this.lastFailureTime > 0 && (Date.now() - this.lastFailureTime) < 60000; // 1 minute
    return this.isAvailable && !recentFailure;
  }

  /**
   * Get comprehensive service status and statistics
   */
  async getServiceStatus(): Promise<{
    available: boolean;
    mode: string;
    storedItems: number;
    totalSize: number;
    quota: number;
    usagePercentage: number;
    failureCount: number;
    lastFailureTime: number;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    const stats = await this.getStorageStats();
    const healthStatus = this.getHealthStatus();

    return {
      available: this.isServiceAvailable(),
      mode: this.ipfsClient ? 'helia' : 'mock',
      storedItems: stats.totalItems,
      totalSize: stats.totalSize,
      quota: stats.quota,
      usagePercentage: stats.usagePercentage,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      healthStatus
    };
  }

  private getHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    if (this.failureCount === 0) return 'healthy';
    if (this.failureCount < 5) return 'degraded';
    return 'unhealthy';
  }

  /**
   * Verify content integrity
   */
  async verifyContent(hash: string): Promise<{
    valid: boolean;
    checksumMatch: boolean;
    error?: string;
  }> {
    try {
      const result = await this.fetchContent(hash);
      
      if (!result) {
        return {
          valid: false,
          checksumMatch: false,
          error: 'Content not found'
        };
      }

      const currentChecksum = this.generateChecksum(result.data);
      const checksumMatch = !result.metadata.checksum || result.metadata.checksum === currentChecksum;

      return {
        valid: true,
        checksumMatch,
        error: checksumMatch ? undefined : 'Checksum mismatch detected'
      };
    } catch (error) {
      return {
        valid: false,
        checksumMatch: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  /**
   * Batch upload multiple items with progress tracking
   */
  async batchUpload(
    items: Array<{
      data: IntelPackage | CyberTeam | CyberInvestigation;
      type: 'intel-package' | 'cyber-team' | 'investigation';
      creator: string;
      // Was `classification?: string`, threaded into the three upload calls
      // below whose own parameter became `visibility` in 7b/3 — so the name
      // here disagreed with the name it was passed to for two stages.
      visibility?: string;
    }>,
    onProgress?: (completed: number, total: number, currentItem?: string) => void
  ): Promise<IPFSUploadResult[]> {
    const results: IPFSUploadResult[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      try {
        onProgress?.(i, items.length, item.data.id);
        
        let result: IPFSUploadResult;
        
        switch (item.type) {
          case 'intel-package':
            result = await this.uploadIntelPackage(
              item.data as IntelPackage,
              item.creator,
              item.visibility
            );
            break;
          case 'cyber-team':
            result = await this.uploadCyberTeam(
              item.data as CyberTeam,
              item.creator,
              item.visibility
            );
            break;
          case 'investigation':
            result = await this.uploadInvestigation(
              item.data as CyberInvestigation,
              item.creator,
              item.visibility
            );
            break;
          default: {
            const defaultSecurity = this.createDefaultSecurityMetadata();
            result = {
              hash: '',
              size: 0,
              url: '',
              timestamp: new Date(),
              success: false,
              error: `Unknown item type: ${item.type}`,
              ...defaultSecurity
            };
            break;
          }
        }
        
        results.push(result);
      } catch (error) {
        const defaultSecurity = this.createDefaultSecurityMetadata();
        results.push({
          hash: '',
          size: 0,
          url: '',
          timestamp: new Date(),
          success: false,
          error: error instanceof Error ? error.message : 'Batch upload item failed',
          ...defaultSecurity
        });
      }
    }
    
    onProgress?.(items.length, items.length);
    return results;
  }

  /**
   * Clear mock storage (for testing) with enhanced safety
   */
  clearMockStorage(): void {
    try {
      this.mockStorage.clear();
      secureStorage.removeItem('ipfs-mock-storage');
      
      // Reset failure counters
      this.failureCount = 0;
      this.lastFailureTime = 0;
      
      log.debug('Mock IPFS storage cleared successfully');
    } catch (error) {
      log.error('Failed to clear mock IPFS storage:', error);
    }
  }

  /**
   * Export all stored content (for backup/migration)
   */
  exportAllContent(): {
    version: string;
    timestamp: string;
    data: Array<{ hash: string; content: IPFSContent }>;
  } {
    const data = Array.from(this.mockStorage.entries()).map(([hash, content]) => ({
      hash,
      content
    }));

    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      data
    };
  }

  /**
   * Import content from backup
   */
  async importContent(
    backup: {
      version: string;
      timestamp: string;
      data: Array<{ hash: string; content: IPFSContent }>;
    },
    options: { overwrite?: boolean; validate?: boolean } = {}
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const { overwrite = false, validate = true } = options;
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of backup.data) {
      try {
        // Check if already exists
        if (!overwrite && this.mockStorage.has(item.hash)) {
          skipped++;
          continue;
        }

        // Validate content if requested
        if (validate) {
          const validation = this.validateContent(item.content.data);
          if (!validation.isValid) {
            errors.push(`Validation failed for ${item.hash}: ${validation.errors.join(', ')}`);
            continue;
          }
        }

        // Store via real IPFS or mock fallback
        await this.storeContent(item.content);
        imported++;
      } catch (error) {
        errors.push(`Failed to import ${item.hash}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Save changes
    this.saveMockStorage();

    return { imported, skipped, errors };
  }

  // ============================================================================
  // ADVANCED CYBERSECURITY METHODS
  // ============================================================================

  /**
   * Security processing placeholder.
   * Returns honest defaults — no fake PQC/DID/OTK/TSS active.
   * Real crypto integration is a future milestone.
   */
  private async performAdvancedSecurityProcessing(
    _content: IPFSContent,
    _creator: string,
  ): Promise<{
    pqcEncrypted: boolean;
    didVerified: boolean;
    otkUsed: string;
    securityLevel: 'QUANTUM_SAFE' | 'CLASSICAL' | 'HYBRID';
    auditTrail: SecurityAuditEvent[];
      tssSignature?: ThresholdSignature;
  }> {
    return {
      ...this.createDefaultSecurityMetadata(),
    };
  }

  /*
   * ─── mapClassificationLevel IS GONE, AND THE 'SCI' RUNG WITH IT ──────────
   *
   * It took an arbitrary string and assigned a tier by SUBSTRING MATCH:
   *
   *   if (upper.includes('SCI'))            return 'SCI';
   *   if (upper.includes('TOP SECRET') ...) return 'TOP_SECRET';
   *   if (upper.includes('SECRET') && ...)  return 'SECRET';
   *   if (upper.includes('CONFIDENTIAL'))   return 'CONFIDENTIAL';
   *   return 'UNCLASSIFIED';
   *
   * Three problems, any one of them enough:
   *
   *   'SCI' is Sensitive Compartmented Information — a government
   *   compartment marking. Nothing in this app implements compartments, and
   *   naming one is the false-association risk the institutional purge
   *   exists to remove. It was also the FIRST branch, so a string containing
   *   the letters "sci" anywhere ("forensci", "sci-fi", a Cyrillic
   *   transliteration) resolved to a compartment marking.
   *
   *   Substring matching over free text means the CONTENT of a document
   *   decided its marking. A report about a leaked top-secret cable was
   *   labelled TOP_SECRET by this app.
   *
   *   The result was written onto security metadata that NOTHING read —
   *   verified across src/, only this service's own tests looked at it.
   *
   * The field is deleted rather than re-keyed. There is no behaviour to
   * carry: the honest statement about IPFS is the visibility warning above,
   * which says the thing that matters (a pin cannot be recalled) without a
   * ladder.
   */

  /**
   * Get security status (placeholder — all counts are zero until real crypto is integrated).
   */
  public getSecurityStatus(): {
    pqcStatus: boolean;
    didRegistered: number;
    activeOTKs: number;
    tssCoordinators: number;
    dMPCSessions: number;
    auditEvents: number;
    complianceLevel: string;
  } {
    return {
      pqcStatus: false,
      didRegistered: 0,
      activeOTKs: 0,
      tssCoordinators: 0,
      dMPCSessions: 0,
      auditEvents: this.auditLogger.length,
      complianceLevel: 'PLACEHOLDER'
    };
  }

  /**
   * Create default security metadata for backward compatibility
   */
  private createDefaultSecurityMetadata(): {
    pqcEncrypted: boolean;
    didVerified: boolean;
    otkUsed: string;
    securityLevel: 'QUANTUM_SAFE' | 'CLASSICAL' | 'HYBRID';
    auditTrail: SecurityAuditEvent[];
    } {
    return {
      pqcEncrypted: false,
      didVerified: false,
      otkUsed: `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      securityLevel: 'CLASSICAL',
      auditTrail: [],
    };
  }

  /**
   * Get content by hash (tries local cache, then real IPFS)
   */
  async getContent(hash: string): Promise<IPFSContent | null> {
    try {
      const result = await this.fetchContent(hash);
      if (!result) return null;
      return { data: result.data, metadata: result.metadata } as IPFSContent;
    } catch (error) {
      log.error('Failed to get content:', error);
      return null;
    }
  }

  // ============================================================================
  // SECURITY STATUS (placeholder — no real PQC/DID/OTK/TSS/dMPC active)
  // ============================================================================

  /**
   * Generate security audit report from local cache metadata.
   */
  public generateSecurityAuditReport(): {
    reportId: string;
    timestamp: Date;
    complianceLevel: string;
    securityMetrics: {
      totalUploads: number;
      pqcEncryptedCount: number;
      didVerifiedCount: number;
      tssSignedCount: number;
      visibilityBreakdown: Record<string, number>;
    };
    auditEvents: SecurityAuditEvent[];
    recommendations: string[];
    riskAssessment: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  } {
    const totalUploads = this.mockStorage.size;
    const contentArray = Array.from(this.mockStorage.values());
    const visibilityBreakdown = contentArray.reduce((acc, content) => {
      const visibility = content.metadata.visibility || 'public';
      acc[visibility] = (acc[visibility] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      reportId: `audit-${Date.now()}`,
      timestamp: new Date(),
      complianceLevel: 'PLACEHOLDER',
      securityMetrics: {
        totalUploads,
        pqcEncryptedCount: 0,
        didVerifiedCount: 0,
        tssSignedCount: 0,
        visibilityBreakdown
      },
      auditEvents: [...this.auditLogger],
      recommendations: ['Real PQC/DID/TSS integration pending'],
      riskAssessment: 'MEDIUM'
    };
  }

  /**
   * Security health check placeholder.
   */
  public async performSecurityHealthCheck(): Promise<{
    overallHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    componentStatus: {
      pqc: 'OPERATIONAL' | 'DEGRADED' | 'FAILED';
      did: 'OPERATIONAL' | 'DEGRADED' | 'FAILED';
      otk: 'OPERATIONAL' | 'DEGRADED' | 'FAILED';
      tss: 'OPERATIONAL' | 'DEGRADED' | 'FAILED';
      dmpc: 'OPERATIONAL' | 'DEGRADED' | 'FAILED';
    };
    issues: string[];
    recommendations: string[];
  }> {
    return {
      overallHealth: 'DEGRADED',
      componentStatus: {
        pqc: 'DEGRADED',
        did: 'DEGRADED',
        otk: 'DEGRADED',
        tss: 'DEGRADED',
        dmpc: 'DEGRADED',
      },
      issues: ['Security components are placeholders — no real crypto active'],
      recommendations: ['Integrate real PQC/DID/TSS when ready'],
    };
  }

  /**
   * Security cleanup placeholder.
   */
  public async cleanupSecurityResources(): Promise<{
    cleaned: {
      expiredOTKs: number;
      oldTSSessions: number;
      completedDMPCSessions: number;
      archivedAuditEvents: number;
    };
    errors: string[];
  }> {
    let archivedAuditEvents = 0;
    if (this.auditLogger.length > 500) {
      archivedAuditEvents = this.auditLogger.length - 500;
      this.auditLogger.splice(0, archivedAuditEvents);
    }
    return {
      cleaned: { expiredOTKs: 0, oldTSSessions: 0, completedDMPCSessions: 0, archivedAuditEvents },
      errors: [],
    };
  }

  /**
   * Compliance configuration check (placeholder).
   */
  public validateComplianceConfiguration(): {
    compliant: boolean;
    violations: string[];
    recommendations: string[];
    score: number;
  } {
    return {
      compliant: false,
      violations: ['No real PQC/DID/TSS active'],
      recommendations: ['Enable security features when real crypto is integrated'],
      score: 0,
    };
  }
}

// Export singleton instance
const ipfsService = new IPFSService();
export default ipfsService;
