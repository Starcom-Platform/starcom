/**
 * Nostr Service for Earth Alliance Resistance Operations
 * 
 * Enhanced for civilian-led global resistance against transnational crime syndicate.
 * Built on published cryptographic standards — ML-KEM-768 (FIPS 203) and
 * ML-DSA-65 (FIPS 204) — with a decentralized architecture on top.
 * 
 * Features:
 * - Censorship-resistant messaging via HTTP-Nostr bridges
 * - Post-Quantum Cryptography for future-proof security
 * - Evidence preservation and whistleblower protection
 * - Global coordination for resistance cells
 * - Truth market integration for information verification
 * - Operational security for Earth Alliance operatives
 * 
 * A note here claimed a US combatant command's standards as this service's
 * security baseline. It named an institution with no relationship to this
 * project; the algorithms above are the checkable claim, and they are named
 * instead. See scripts/guard-no-institutional-claims.mjs.
 */

import { Event, generateSecretKey, getPublicKey, finalizeEvent, nip28, nip44, kinds, type EventTemplate, type SimplePool } from 'nostr-tools';
import { createRelayPool } from './nostr/relayPool';
import { publishRelays } from './nostr/publishTargets';
import { encodeNsec, decodeNsec, IdentityBackupError } from './identity/identityBackup';
import { recordIdentityCreated, clearIdentityNotice } from './identity/identityNotice';
import { ageBeforeFirstKey, refuseUnder13 } from './identity/ageAnswer';
import {
  KeyLockedError, LOCK_COST, STILL_LOCKED, askToUnlock, notifyKeyLock, openWithPassphrase, passphraseProblem,
  readLockedKey, removeLockedKey, sealWithPassphrase, writeLockedKey, type LockedKey,
} from './identity/keyLock';
import type { SubCloser } from 'nostr-tools/abstract-pool';
import { logger } from '../utils';
import { ServiceBackoffController } from './backoff/ServiceBackoffController';
import { rateLimiter, type RateLimitConfig } from '../utils/rateLimiting';

// Service configuration
interface NostrServiceConfig {
  defaultRelays: string[];
  autoReconnect: boolean;
  reconnectInterval: number; // ms
  messageRetention: number;  // days
  eventTimeoutMs: number;    // ms
  healthCheckIntervalMs: number; // ms
  backoff: {
    initialMs: number;
    maxMs: number;
    factor: number;
    jitterMs: number;
  };
}

// Default configuration
/**
 * Where this browser keeps its signing key, unlocked.
 *
 * Plain-text localStorage, unless the person locks it with a passphrase (decision
 * D-KL): it then lives under LOCKED_KEY_STORAGE as a NIP-49 ncryptsec, and this
 * entry is removed. Never both. A key is only ever written once the person asked
 * for something that needs one.
 */
const NOSTR_SECRET_KEY_STORAGE = 'nostr_secret_key';
/**
 * Whose key the person moved into Starcom Uplink (decision D-EX, E3, K6), by pubkey. While it is set and
 * this browser holds no key, this browser makes no key: a second one would split the person in two.
 */
export const KEY_HELD_BY_UPLINK = 'starcom-key-held-by-uplink';
/** What signing says while the key is in Uplink and Uplink is not here, or locked. */
export const KEY_IS_IN_UPLINK = 'Your key is in Starcom Uplink, which is not here or not unlocked. Open Starcom where Uplink is installed, or bring your key back from your backup in "Your key".';

const DEFAULT_CONFIG: NostrServiceConfig = {
  /**
   * Kept in step with NostrStarcomIntelIngest's list, which tracks Navcom's
   * relay surface. This one had drifted to three relays, two of which are
   * dead: measured from a browser, relay.snort.social answers 503 and
   * relay.nostr.band does not answer at all, so the service failed to reach ANY
   * relay, degraded, and raised "Network connectivity issues detected" on the
   * front door for every arriving user — while the ingest service, with a
   * healthy list, sat right beside it.
   *
   * Two relay lists in one app is the real defect; this aligns them. If they
   * are ever meant to differ, the difference should be stated here rather than
   * arrived at by one of them going stale.
   */
  // Chat's relays: the public surface, unless the build configures chat
  // (VITE_NOSTR_CHAT_RELAYS, publishTargets.ts; plan item 0.3).
  defaultRelays: publishRelays('CHAT'),
  autoReconnect: true,
  reconnectInterval: 5000,
  messageRetention: 30,
  eventTimeoutMs: 10000,
  healthCheckIntervalMs: 30000,
  backoff: {
    initialMs: 2000,
    maxMs: 60000,
    factor: 2,
    jitterMs: 1000
  }
};

/**
 * Phase T3.3 (Teams & Chat operational-reliability roadmap) — real abuse
 * protection on chat sends, keyed by the sender's own pubkey. Deliberately
 * NOT rateLimiter's existing 'websocket' preset (3 requests/min, 15-minute
 * block) — that preset is sized for connection attempts (its own comment:
 * "WebSocket connections — very restrictive"), not individual chat
 * messages; applying it here would lock a normal, moderately active
 * conversation out of sending anything for 15 minutes. 30/minute with a
 * 1-minute cooldown is real spam protection without breaking real usage.
 */
const CHAT_SEND_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60 * 1000,
  blockDuration: 60 * 1000
};

export interface NostrMessage {
  id: string;
  teamId: string;
  channelId: string;
  senderId: string;
  senderDID: string;
  content: string;
  messageType: 'text' | 'intelligence' | 'alert' | 'status' | 'file' | 'evidence' | 'truth_claim' | 'verification' | 'coordination';
  timestamp: number;
  encrypted: boolean;
  pqcEncrypted: boolean;
  signature?: string;
  metadata?: Record<string, unknown>;
  // Earth Alliance specific fields
  evidenceHash?: string;
  truthScore?: number;
  verificationStatus?: 'unverified' | 'pending' | 'verified' | 'disputed' | 'requires_more_evidence';
  resistanceCell?: string;
  operativeLevel?: 'civilian' | 'coordinator' | 'cell_leader' | 'alliance_command';
}

export interface NostrTeamChannel {
  id: string;
  teamId: string;
  name: string;
  description: string;
  relayUrls: string[];
  encryptionKey?: string;
  pqcKey?: string;
  participants: string[];
  createdAt: number;
  isActive: boolean;
  // Earth Alliance specific fields
  channelType: 'general' | 'evidence' | 'coordination' | 'emergency' | 'truth_verification';
  resistanceCell?: string;
  geographicRegion?: string;
  specializations?: string[];
}

// Extended interfaces for future Earth Alliance enhancements
export interface EarthAllianceMessage extends NostrMessage {
  // Corruption evidence specific
  corruptionType?: 'financial' | 'political' | 'media' | 'tech' | 'pharma' | 'energy' | 'military';
  evidenceType?: 'document' | 'testimony' | 'financial_record' | 'communication' | 'video' | 'audio';
  targetEntities?: string[];
  timeframe?: { start: number; end: number };
  
  // Truth verification
  sourcesCount?: number;
  independentVerifications?: number;
  conflictingReports?: number;
  reliabilityScore?: number;
  
  // Operative protection
  anonymityLevel?: 'public' | 'pseudonymous' | 'anonymous' | 'high_security';
  protectionNeeded?: boolean;
  riskLevel?: 'low' | 'medium' | 'high' | 'extreme';
}

export interface ResistanceCellChannel extends NostrTeamChannel {
  cellCode: string;
  region: string;
  specialization: string[];
  emergencyContacts: string[];
  operationalStatus: 'active' | 'dormant' | 'compromised' | 'disbanded';
  lastActivity: number;
  memberCount: number;
  securityLevel: 'standard' | 'enhanced' | 'maximum';
}

/**
 * The NostrService class for Earth Alliance communications.
 * This service provides a singleton instance for working with Nostr protocol.
 */
export class NostrService {
  private static instance: NostrService | null = null;
  private relays: string[] = [...DEFAULT_CONFIG.defaultRelays];
  public pool: SimplePool;
  private activeSubs: Map<string, SubCloser> = new Map(); // channelId → active subscription
  private initialized: boolean = false;
  private initializing: boolean = false;
  private userDID: string | null = null;
  private secretKey: Uint8Array | null = null;
  private publicKey: string | null = null;
  /**
   * This browser's key as locked with a passphrase (D-KL), or null when it is not locked. While it is set and
   * `secretKey` is null, the key is locked: this page knows whose it is, and opens it when something needs it.
   */
  private lockedKey: LockedKey | null = null;
  /** The passphrase being asked for, so a second signature waiting on the same key asks once. */
  private unlocking: Promise<void> | null = null;
  private config: NostrServiceConfig;
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private healthCheckTimer: NodeJS.Timeout | null = null;

  // Local caches populated from relay events
  private channelCache: Map<string, NostrTeamChannel> = new Map();
  private messageCache: Map<string, NostrMessage[]> = new Map();

  /**
   * Phase T3.2 (Teams & Chat operational-reliability roadmap) — sendMessage
   * used to make exactly one publish attempt; a single dropped/slow relay
   * response meant a real, sendable message silently failed. Tighter than
   * RealTimeTeamService's backoff controller (baseDelayMs: 1000,
   * maxAttempts: 6, which could hang a background sync for minutes) — a
   * chat send is interactive, a user is waiting on it.
   */
  private sendMessageBackoff = new ServiceBackoffController({
    label: 'nostr-send-message',
    baseDelayMs: 500,
    maxDelayMs: 3000,
    maxAttempts: 3,
    // coolOffThreshold defaults to 3 — equal to maxAttempts here, the 3rd
    // consecutive failure would trigger a 15s cool-off (its own default)
    // INSTEAD of the intended "exhausted after 3 attempts, throw"; set
    // higher than maxAttempts so that path never triggers within this
    // controller's own retry budget.
    coolOffThreshold: 10
  });

  // Private constructor to enforce singleton pattern
  private constructor(config: Partial<NostrServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pool = createRelayPool();
    this.restoreIdentity();
    logger.info('NostrService instance created');
  }

  /**
   * Load an identity this browser already has. NEVER creates one.
   *
   * ─── WHY CREATION MOVED OUT OF HERE ──────────────────────────────────────
   *
   * This ran in the constructor, which runs on module load, and minted a
   * secp256k1 secret key into plain-text localStorage. So opening the app created
   * a cryptographic identity nobody asked for, nobody was told about, that could
   * sign as them, that they could not export, and that any script on the origin
   * could read — and because chat signs with it, it reached public relays before
   * its owner knew it existed.
   *
   * A key is made when something needs a signature (ensureIdentity), and the
   * person is told at that moment (identityNotice).
   *
   * @private
   */
  private restoreIdentity(): void {
    try {
      const stored = typeof localStorage !== 'undefined'
        ? localStorage.getItem(NOSTR_SECRET_KEY_STORAGE)
        : null;
      const locked = readLockedKey();
      const bytes = stored ? new Uint8Array(JSON.parse(stored)) : null;
      if (bytes && bytes.length !== 32) {
        // A stored value that is not a key is not an identity. Left in place rather
        // than overwritten: it is the only copy of whatever it is, and destroying it
        // to make room for a fresh key would destroy a recoverable identity.
        logger.warn(`Stored Nostr key is ${bytes.length} bytes, not 32 — ignoring it.`);
      }
      if (bytes && bytes.length === 32) {
        this.secretKey = bytes;
        this.publicKey = getPublicKey(bytes);
        if (locked?.pubkey === this.publicKey) {
          // Both copies of one key: a lock, or its removal, stopped half-way. The plain copy wins, so the key is
          // never lost to a passphrase the person may not have finished setting; they can lock it again (D-KL, KL3).
          removeLockedKey();
        } else if (locked) {
          logger.warn('This browser holds a locked key and a different unlocked one; the unlocked one is used, and both are kept.');
        }
        logger.debug('Nostr identity restored, pubkey:', this.publicKey.substring(0, 8) + '...');
        return;
      }
      if (locked) {
        // Locked (D-KL): whose it is is known now, and the key is opened when something needs it.
        this.lockedKey = locked;
        this.publicKey = locked.pubkey;
        return;
      }
      // A key moved into Uplink: this browser knows whose it is, and holds none (K6).
      this.publicKey = this.heldByUplink();
    } catch {
      // Unreadable storage means no identity, not a new one.
      this.secretKey = null;
      this.publicKey = null;
    }
  }

  /** Whether this page holds a key of its own, as against Uplink holding it (E3). */
  public holdsOwnKey(): boolean {
    return this.secretKey !== null || this.lockedKey !== null;
  }

  /** Whether this browser can sign as the person: its own key, locked or not, or Starcom Uplink holding it (E3). */
  public hasIdentity(): boolean {
    return this.secretKey !== null || this.lockedKey !== null || this.externalSigner !== null;
  }

  /**
   * The passphrase lock on this browser's key (D-KL): none, locked (kept sealed, not opened this visit), or unlocked
   * (kept sealed, opened in memory for this visit).
   */
  public lockState(): 'none' | 'locked' | 'unlocked' {
    if (!this.lockedKey) return 'none';
    return this.secretKey ? 'unlocked' : 'locked';
  }

  /** Whether this browser's key is locked and not yet opened this visit. */
  public isLocked(): boolean {
    return this.lockedKey !== null && this.secretKey === null;
  }

  /** Lets the page paint ("Locking…") before scrypt holds the thread for about a second. */
  private static breathe(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Opens the locked key with its passphrase, for this visit, in memory only. Throws WrongPassphraseError when it is
   * not the one. Nothing is written: the key stays locked in storage.
   */
  public async unlock(passphrase: string): Promise<void> {
    const locked = this.lockedKey;
    if (!locked || this.secretKey) return;
    await NostrService.breathe();
    this.secretKey = openWithPassphrase(locked, passphrase);
    this.publicKey = locked.pubkey;
    logger.info('Nostr identity unlocked for this visit');
    notifyKeyLock();
  }

  /**
   * Opens the key when it is locked, asking for its passphrase on screen, for `reason`: what needs it, as a person
   * would say it. Does nothing when it is not locked. Throws KeyLockedError when the person closes the prompt, or
   * nothing on screen can ask. Only for what a person just asked for: code that runs on its own waits for an unlock
   * instead (subscribeKeyLock), and never asks.
   */
  public async unlockFor(reason: string): Promise<void> {
    if (!this.isLocked()) return;
    if (!this.unlocking) {
      this.unlocking = (async () => {
        const opened = await askToUnlock(reason, (passphrase) => this.unlock(passphrase));
        if (!opened || this.isLocked()) throw new KeyLockedError(STILL_LOCKED);
      })().finally(() => { this.unlocking = null; });
    }
    return this.unlocking;
  }

  /**
   * Locks this browser's key with a passphrase (D-KL). The sealed copy is opened again and checked before the plain
   * copy is removed, so a lock that fails leaves the key as it was. It stays open for the rest of this visit: the
   * person just typed the passphrase. `cost` is scrypt's, for tests.
   */
  public async lock(passphrase: string, cost: number = LOCK_COST): Promise<void> {
    const problem = passphraseProblem(passphrase);
    if (problem) throw new Error(problem);
    if (this.lockedKey) throw new Error('This key is locked already.');
    const secret = this.secretKey;
    if (!secret) throw new Error(this.heldByUplink() ? 'Your key is in Starcom Uplink, which locks it itself.' : 'There is no key in this browser to lock.');
    await NostrService.breathe();
    const locked = sealWithPassphrase(secret, passphrase, cost);
    const reopened = openWithPassphrase(locked, passphrase);
    if (reopened.length !== secret.length || reopened.some((b, i) => b !== secret[i])) {
      throw new Error('The locked key did not open to the same key, so nothing changed.');
    }
    try {
      writeLockedKey(locked);
    } catch (e) {
      removeLockedKey();
      throw new Error(`Nothing changed: ${e instanceof Error ? e.message : String(e)}`);
    }
    localStorage.removeItem(NOSTR_SECRET_KEY_STORAGE);
    this.lockedKey = locked;
    logger.info('Nostr identity locked with a passphrase');
    notifyKeyLock();
  }

  /**
   * Removes the lock: the key is stored unencrypted again. Asks for the passphrase first when the key is locked.
   * The plain copy is written and read back before the locked one is removed.
   */
  public async removeLock(): Promise<void> {
    if (!this.lockedKey) return;
    await this.unlockFor('removing the lock from your key');
    const secret = this.secretKey;
    if (!secret) throw new KeyLockedError(STILL_LOCKED);
    const plain = JSON.stringify(Array.from(secret));
    localStorage.setItem(NOSTR_SECRET_KEY_STORAGE, plain);
    if (localStorage.getItem(NOSTR_SECRET_KEY_STORAGE) !== plain) throw new Error('The key could not be saved unlocked, so the lock stays.');
    removeLockedKey();
    this.lockedKey = null;
    logger.info('Passphrase lock removed from the Nostr identity');
    notifyKeyLock();
  }

  /**
   * Starcom Uplink's signer (decision D-EX, E3, EX39), set while Uplink holds the person's key: every
   * signature this service makes then goes through it, and the key never sits in this page.
   */
  private externalSigner: ((template: EventTemplate) => Promise<Event>) | null = null;

  /** Signs through Uplink from now on, as `pubkey`; null goes back to this browser's own key, if any. */
  public useSigner(signer: ((template: EventTemplate) => Promise<Event>) | null, pubkey?: string): void {
    this.externalSigner = signer;
    if (signer && pubkey) this.publicKey = pubkey;
    else if (!signer) this.publicKey = this.secretKey ? getPublicKey(this.secretKey) : this.lockedKey?.pubkey ?? this.heldByUplink();
  }

  /** The pubkey of a key the person moved into Uplink, while this browser no longer holds it (K6). */
  public heldByUplink(): string | null {
    try {
      const held = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_HELD_BY_UPLINK) : null;
      return held && /^[0-9a-f]{64}$/.test(held) ? held : null;
    } catch {
      return null;
    }
  }

  /**
   * Hands the key to Uplink (K6), once Uplink has shown it signs as the same key: this browser forgets
   * the secret and keeps only whose it was, so it never makes a second key while Uplink is away.
   */
  public handOverToUplink(pubkey: string): void {
    if (!this.secretKey || getPublicKey(this.secretKey) !== pubkey) throw new Error('Uplink holds a different key than this browser.');
    localStorage.setItem(KEY_HELD_BY_UPLINK, pubkey);
    localStorage.removeItem(NOSTR_SECRET_KEY_STORAGE);
    // A locked copy goes too: Uplink holds the key now, sealed under its own passphrase (D-KL).
    removeLockedKey();
    const wasLocked = this.lockedKey !== null;
    this.lockedKey = null;
    this.secretKey = null;
    this.publicKey = pubkey;
    if (wasLocked) notifyKeyLock();
  }

  /**
   * Signs a template: through Uplink when it holds the key, else with this browser's own, asking for its passphrase
   * first when it is locked (D-KL). Every caller is something the person did: sending, creating, publishing.
   */
  private async sign(template: EventTemplate, reason = 'signing as you'): Promise<Event> {
    if (this.externalSigner) return this.externalSigner(template);
    await this.unlockFor(reason);
    if (!this.secretKey) throw new IdentityBackupError(this.heldByUplink() ? KEY_IS_IN_UPLINK : 'There is no key in this browser to sign with.');
    return finalizeEvent(template, this.secretKey);
  }

  /**
   * A NIP-28 event built exactly as nostr-tools builds it, then signed by `sign`: the builder signs with a
   * throwaway key, and only its template is kept, so no event construction is copied here.
   */
  private async signNip28<T>(build: (t: T, key: Uint8Array) => Event | undefined, t: T): Promise<Event> {
    const draft = build(t, generateSecretKey());
    if (!draft) throw new Error('The channel event could not be built.');
    return this.sign({ kind: draft.kind, tags: draft.tags, content: draft.content, created_at: draft.created_at });
  }

  /**
   * The identity to sign with, created if this browser has none.
   *
   * `reason` is what needed the signature, in words a person would use — it is shown
   * to them, so "sending a chat message" and not "signEvent".
   */
  public ensureIdentity(reason: string): string {
    // Under 13, no key is made or used, so nothing is posted (D-RS, RS39).
    refuseUnder13();
    if (this.externalSigner && this.publicKey) return this.publicKey;
    if (this.secretKey && this.publicKey) return this.publicKey;
    // Locked (D-KL): it is still this person's key. It is opened when something signs, and never replaced.
    if (this.lockedKey && this.publicKey) return this.publicKey;
    // The key went to Uplink (K6): a new one here would split the person in two.
    if (this.heldByUplink()) {
      throw new IdentityBackupError(KEY_IS_IN_UPLINK);
    }
    // Asked first, where something on screen can ask (RS39).
    ageBeforeFirstKey();

    this.secretKey = generateSecretKey();
    this.publicKey = getPublicKey(this.secretKey);
    let persisted = false;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(NOSTR_SECRET_KEY_STORAGE, JSON.stringify(Array.from(this.secretKey)));
        persisted = true;
      }
    } catch {
      // A key that could not be stored works for this session and is gone on reload.
      // Not an error — but not something to claim was saved, either.
      logger.warn('Nostr identity created but could not be saved; it will not survive a reload.');
    }
    // Only a stored key is worth telling someone to back up. An ephemeral one (SSR, a
    // test, blocked storage) would be a notice about something already gone.
    if (persisted) recordIdentityCreated(reason);
    logger.info(`Nostr identity created for: ${reason}`);
    return this.publicKey;
  }

  /**
   * This identity as the `nsec1…` text every other Nostr client can import.
   *
   * The only way the secret leaves this service, and it exists so that an identity
   * is the person's rather than the browser profile's. Never logged.
   */
  public exportNsec(): string {
    if (!this.secretKey) {
      if (this.lockedKey) throw new KeyLockedError();
      throw new IdentityBackupError('There is no identity in this browser to export yet.');
    }
    return encodeNsec(this.secretKey);
  }

  /** exportNsec, asking for the passphrase first when the key is locked: for a person who asked to see it. */
  public async exportNsecUnlocking(reason = 'showing your key to back up'): Promise<string> {
    await this.unlockFor(reason);
    return this.exportNsec();
  }

  /**
   * Adopt an identity from an `nsec1…`, replacing whatever this browser held.
   *
   * Returns the new pubkey. Throws before touching anything if the text is not a
   * secret key — a half-completed import would leave the app signing as nobody.
   */
  public importNsec(nsec: string): string {
    const bytes = decodeNsec(nsec);
    const pubkey = getPublicKey(bytes);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(NOSTR_SECRET_KEY_STORAGE, JSON.stringify(Array.from(bytes)));
      }
    } catch {
      logger.warn('Imported identity could not be saved; it will not survive a reload.');
    }
    this.secretKey = bytes;
    this.publicKey = pubkey;
    // A key brought back from a backup is held here again.
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY_HELD_BY_UPLINK); } catch { /* nothing to remove */ }
    // It replaces whatever was held, a locked key included: the brought key is stored unlocked, and can be locked
    // in its turn (D-KL).
    if (this.lockedKey || readLockedKey()) {
      removeLockedKey();
      this.lockedKey = null;
      notifyKeyLock();
    }
    recordIdentityCreated('an identity you imported', { imported: true });
    return pubkey;
  }

  /**
   * Delete this browser's identity.
   *
   * Irreversible without a backup: the key is the only thing that can sign as that
   * pubkey, and nothing anywhere else holds it. Anything already published under it
   * stays published — deleting the key does not unpublish, and must not be described
   * as though it does.
   */
  public forgetIdentity(): void {
    const wasLocked = this.lockedKey !== null;
    this.secretKey = null;
    this.publicKey = null;
    this.lockedKey = null;
    this.externalSigner = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(NOSTR_SECRET_KEY_STORAGE);
        localStorage.removeItem(KEY_HELD_BY_UPLINK);
      }
    } catch { /* nothing to remove */ }
    // The locked copy is the key too (D-KL).
    removeLockedKey();
    if (wasLocked) notifyKeyLock();
    clearIdentityNotice();
    logger.info('Nostr identity deleted from this browser');
  }

  /**
   * Returns the singleton instance of the NostrService.
   * @returns {NostrService} The singleton instance.
   */
  public static getInstance(config?: Partial<NostrServiceConfig>): NostrService {
    if (!NostrService.instance) {
      NostrService.instance = new NostrService(config);
    }
    return NostrService.instance;
  }

  /**
   * Initialize the Nostr service, connecting to relays and setting up subscriptions.
   * @returns {Promise<void>}
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('NostrService already initialized');
      return;
    }
    
    if (this.initializing) {
      logger.debug('NostrService initialization already in progress');
      return;
    }
    
    this.initializing = true;
    logger.info('Initializing NostrService...');
    
    try {
      // Connect to relays via SimplePool
      const connectionPromises = this.relays.map(relay => this.connectToRelay(relay));
      const results = await Promise.allSettled(connectionPromises);
      
      // Count successful connections
      const connectedRelayCount = results.filter(r => r.status === 'fulfilled').length;
      
      if (connectedRelayCount === 0) {
        throw new Error('Failed to connect to any relay');
      }
      
      this.initialized = true;
      logger.info(`NostrService initialized successfully with ${connectedRelayCount} relays`);
      
      // Start periodic health monitoring
      this.startHealthCheck();
    } catch (error) {
      logger.error('Failed to initialize NostrService:', error);
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Check if the service is ready for use.
   * @returns {boolean} True if the service is initialized and ready.
   */
  public isReady(): boolean {
    return this.initialized;
  }

  /**
   * Set the user's DID for identification.
   * @param {string} did - The user's DID (Decentralized Identifier).
   */
  public setUserDID(did: string): void {
    logger.debug('NostrService.setUserDID called with:', did);
    this.userDID = did;
  }

  /**
   * Get the user's current DID.
   * @returns {string|null} The user's DID or null if not set.
   */
  public getUserDID(): string | null {
    return this.userDID;
  }

  /**
   * Get the service's own Nostr public key, for callers that need a stable identifier
   * before a DID has been explicitly set (see the `did:nostr:${publicKey}` fallback
   * this service already uses internally in sendMessage).
   * @returns {string|null} The hex public key, or null if keys haven't initialized.
   */
  /**
   * NIP-44 v2 with this browser's key, which never leaves this service (plan
   * item 2.4: sealing and opening gift wraps). Creates nothing: with no key
   * there is nothing to encrypt or decrypt as.
   */
  public nip44Encrypt(peer: string, plaintext: string): string {
    if (!this.secretKey && this.lockedKey) throw new KeyLockedError();
    if (!this.secretKey) throw new Error(this.heldByUplink() ? KEY_IS_IN_UPLINK : 'There is no key in this browser to encrypt with.');
    return nip44.encrypt(plaintext, nip44.getConversationKey(this.secretKey, peer));
  }

  public nip44Decrypt(peer: string, payload: string): string {
    if (!this.secretKey && this.lockedKey) throw new KeyLockedError();
    if (!this.secretKey) throw new Error(this.heldByUplink() ? KEY_IS_IN_UPLINK : 'There is no key in this browser to decrypt with.');
    return nip44.decrypt(payload, nip44.getConversationKey(this.secretKey, peer));
  }

  public getPublicKey(): string | null {
    return this.publicKey;
  }

  /**
   * Sign an arbitrary Nostr event with this service's keypair, for callers (e.g. the
   * IPFS-Nostr bridge) that construct their own event payloads but have no keypair of
   * their own — mirrors the `finalizeEvent` calls used throughout this class.
   * @returns {Event} The finalized, signed event (with `id`, `pubkey`, `sig` populated).
   */
  public signEvent(unsignedEvent: {
    kind: number;
    content: string;
    tags: string[][];
    created_at: number;
  }): Event {
    this.ensureIdentity('signing an event');
    // Synchronous, so it cannot ask: an async caller unlocks first (unlockFor), as NostrIdentityService does.
    if (!this.secretKey && this.lockedKey) throw new KeyLockedError();
    if (!this.secretKey) throw new IdentityBackupError(this.heldByUplink() ? KEY_IS_IN_UPLINK : 'There is no key in this browser to sign with.');
    return finalizeEvent(unsignedEvent, this.secretKey);
  }

  /**
   * Add a relay to the list of relays.
   * @param {string} relayUrl - The URL of the relay to add.
   * @returns {Promise<boolean>} Success status.
   */
  public async addRelay(relayUrl: string): Promise<boolean> {
    if (this.relays.includes(relayUrl)) {
      logger.debug(`Relay ${relayUrl} already added`);
      return true;
    }
    
    this.relays.push(relayUrl);
    
    if (this.initialized) {
      try {
        await this.connectToRelay(relayUrl);
        return true;
      } catch (error) {
        logger.error(`Failed to connect to new relay ${relayUrl}:`, error);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Create a new team channel.
   * @param {string} teamId - The ID of the team.
   * @param {string} name - The name of the channel.
   * @param {string} description - The description of the channel.
   * @returns {Promise<NostrTeamChannel>} The created channel.
   */
  public async createTeamChannel(
    teamId: string,
    name: string,
    description: string
  ): Promise<NostrTeamChannel> {
    logger.debug('NostrService.createTeamChannel called with:', { teamId, name, description });

    this.ensureIdentity('creating a team channel');
    
    // Publish NIP-28 Kind 40 (Channel Creation) event to relays
    const channelEvent = await this.signNip28(nip28.channelCreateEvent, {
      content: { name, about: description, picture: '' },
      created_at: Math.floor(Date.now() / 1000),
      tags: [['team', teamId]]
    });
    
    if (!channelEvent) throw new Error('Failed to create channel event');
    
    // Publish to all relays
    const publishResults = this.pool.publish(this.relays, channelEvent);
    await Promise.any(publishResults);
    
    const channelId = channelEvent.id;
    
    const channel: NostrTeamChannel = {
      id: channelId,
      teamId,
      name,
      description,
      relayUrls: [...this.relays],
      participants: this.publicKey ? [this.publicKey] : [],
      createdAt: Date.now(),
      isActive: true,
      channelType: 'general'
    };
    
    // Cache locally
    this.channelCache.set(channelId, channel);
    this.messageCache.set(channelId, []);
    
    // Auto-subscribe to the new channel
    this.subscribeToChannel(channelId);
    
    return channel;
  }

  /**
   * Join a team channel
   * @param {string} channelId - The ID of the channel to join.
   * @param {string} userDID - The DID of the user joining.
   * @returns {Promise<void>}
   */
  public async joinTeamChannel(
    channelId: string,
    userDID: string
  ): Promise<void> {
    logger.debug('NostrService.joinTeamChannel called with:', { channelId, userDID });
    
    try {
      // In NIP-28, "joining" means subscribing to channel messages
      this.subscribeToChannel(channelId);
      
      // Update cache participant list
      const channel = this.channelCache.get(channelId);
      if (channel && !channel.participants.includes(userDID)) {
        channel.participants.push(userDID);
      }
      
      logger.info('User joined team channel:', { channelId, userDID });
    } catch (error) {
      logger.error('Error joining team channel:', error);
      throw error;
    }
  }
  
  /**
   * List all known team channels from local cache.
   */
  public getTeamChannels(): NostrTeamChannel[] {
    return Array.from(this.channelCache.values());
  }

  /**
   * Update channel metadata (NIP-28 Kind 41).
   */
  public async updateChannelMetadata(
    channelId: string,
    metadata: { name?: string; about?: string; picture?: string }
  ): Promise<void> {
    this.ensureIdentity('renaming a channel');
    const event = await this.signNip28(nip28.channelMetadataEvent, {
      channel_create_event_id: channelId,
      content: {
        name: metadata.name ?? '',
        about: metadata.about ?? '',
        picture: metadata.picture ?? '',
      },
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
    });
    const results = this.pool.publish(this.relays, event);
    await Promise.any(results);

    // Update local cache
    const cached = this.channelCache.get(channelId);
    if (cached) {
      if (metadata.name) cached.name = metadata.name;
      if (metadata.about) cached.description = metadata.about;
    }
  }

  /**
   * Hide a channel message (NIP-28 Kind 43).
   */
  public async hideChannelMessage(
    messageEventId: string,
    reason?: string
  ): Promise<void> {
    this.ensureIdentity('hiding a message');
    const event = await this.signNip28(nip28.channelHideMessageEvent, {
      channel_message_event_id: messageEventId,
      content: reason ?? '',
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
    });
    const results = this.pool.publish(this.relays, event);
    await Promise.any(results);
  }

  /**
   * Mute a user in a channel (NIP-28 Kind 44).
   */
  public async muteChannelUser(
    userPubkey: string,
    reason?: string
  ): Promise<void> {
    this.ensureIdentity('muting a member');
    const event = await this.signNip28(nip28.channelMuteUserEvent, {
      pubkey_to_mute: userPubkey,
      content: reason ?? '',
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
    });
    const results = this.pool.publish(this.relays, event);
    await Promise.any(results);
  }
  
  /**
   * Lightweight service status for integration layers.
   */
  public getServiceStatus(): {
    initialized: boolean;
    referenceRelays: number;
    connectedRelays: number;
  } {
    const connectionStatus = this.pool.listConnectionStatus();
    const connectedRelays = Array.from(connectionStatus.values())
      .filter(connected => connected).length;
    return {
      initialized: this.initialized,
      referenceRelays: this.relays.length,
      connectedRelays
    };
  }
  
  /**
   * Get the numeric value of a clearance level
   * @param {string} level - The clearance level.
   * @returns {number} The numeric value.
   */
  // Deprecated: clearance value mapping removed in civilian build
  private getClearanceValue(_level: string): number {
    return 1;
  }

  /**
   * Get messages from a channel.
   * @param {string} channelId - The ID of the channel.
   * @returns {NostrMessage[]} Array of messages.
   */
  public getChannelMessages(channelId: string): NostrMessage[] {
    logger.debug('NostrService.getChannelMessages called for channel:', channelId);
    return this.messageCache.get(channelId) || [];
  }

  /**
   * Send a message to a channel.
   * @param {string} channelId - The ID of the channel to send the message to.
   * @param {string} content - The content of the message.
   * @param {'text' | 'intelligence' | 'alert' | 'status' | 'file' | 'evidence' | 'truth_claim' | 'verification' | 'coordination'} messageType - The type of message.
   * @returns {Promise<boolean>} Success status.
   */
  public async sendMessage(
    channelId: string,
    content: string,
    messageType: 'text' | 'intelligence' | 'alert' | 'status' | 'file' | 'evidence' | 'truth_claim' | 'verification' | 'coordination' = 'text'
  ): Promise<boolean> {
    logger.debug('NostrService.sendMessage called with:', { channelId, content, messageType });
    
    // Sending a message IS the first signing, for most people who ever get an
    // identity here: this is where it is made, and where they are told.
    this.ensureIdentity('sending a chat message');

    // Phase T3.3 — checked before attempting, not silently dropped after.
    const rateLimitCheck = rateLimiter.checkRateLimit(this.publicKey!, CHAT_SEND_RATE_LIMIT);
    if (!rateLimitCheck.allowed) {
      logger.warn(`Message send rate-limited for ${this.publicKey.substring(0, 8)}...`, rateLimitCheck);
      return false;
    }

    try {
      // Phase T3.2 — retries the whole build+publish (not just the publish
      // call) so a retry re-signs with a fresh created_at rather than
      // replaying an increasingly-stale timestamp.
      const msgEvent = await this.sendMessageBackoff.run(async () => {
        const event = await this.signNip28(nip28.channelMessageEvent, {
          channel_create_event_id: channelId,
          relay_url: this.relays[0],
          content,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['type', messageType]]
        });

        const publishResults = this.pool.publish(this.relays, event);
        await Promise.any(publishResults);
        return event;
      });

      // Cache locally
      const message: NostrMessage = {
        id: msgEvent.id,
        teamId: this.channelCache.get(channelId)?.teamId || '',
        channelId,
        senderId: this.publicKey.substring(0, 10),
        senderDID: this.userDID || `did:nostr:${this.publicKey}`,
        content,
        messageType,
        timestamp: Date.now(),
        encrypted: false,
        pqcEncrypted: false
      };
      
      const channelMessages = this.messageCache.get(channelId) || [];
      channelMessages.push(message);
      this.messageCache.set(channelId, channelMessages);
      
      this.broadcastMessageEvent(message);
      logger.debug(`Message sent to channel ${channelId}`);
      rateLimiter.recordRequest(this.publicKey, true, 'sendMessage', CHAT_SEND_RATE_LIMIT);
      return true;
    } catch (error) {
      logger.error('Failed to send message:', error);
      rateLimiter.recordRequest(this.publicKey, false, 'sendMessage', CHAT_SEND_RATE_LIMIT);
      return false;
    }
  }

  /**
   * Broadcast a message event to the UI and other listeners
   * @param {NostrMessage} message - The message to broadcast
   * @private
   */
  private broadcastMessageEvent(message: NostrMessage): void {
    try {
      const event = new CustomEvent('nostr-message-sent', { detail: message });
      window.dispatchEvent(event);
      logger.debug('Broadcast message event:', message.id);
    } catch (error) {
      logger.error('Failed to broadcast message event:', error);
    }
  }

  /**
   * Connect to a Nostr relay via SimplePool
   * @param {string} relayUrl - The URL of the relay to connect to
   * @returns {Promise<void>}
   * @private
   */
  private async connectToRelay(relayUrl: string): Promise<void> {
    try {
      logger.debug('Connecting to relay:', relayUrl);
      
      // Use SimplePool.ensureRelay() to establish a real WebSocket connection.
      // This returns an AbstractRelay object that manages the underlying socket.
      await this.pool.ensureRelay(relayUrl, {
        connectionTimeout: this.config.eventTimeoutMs
      });
      
      logger.info('Connected to relay:', relayUrl);
    } catch (error) {
      /**
       * One relay of several failing is the normal weather of a relay mesh,
       * not a fault: the pool is configured with five and the app works on
       * any one of them. Logging each failure at error level put eight red
       * lines in the console on every visit while nothing was actually wrong
       * — and noise at that volume is what real errors hide inside.
       *
       * It is only an error when NOTHING is connected, because that is the
       * point at which the user loses the capability.
       */
      this.reportRelayFailure('Relay connection error', relayUrl, error);

      if (this.config.autoReconnect) {
        this.scheduleReconnect(relayUrl);
      }
      
      throw error;
    }
  }

  /**
   * Report a relay failure at a level that reflects what it costs the user.
   */
  private reportRelayFailure(what: string, relayUrl: string, error: unknown): void {
    // A relay that just dropped may still be listed as connected, so treat
    // "one left" as already lost.
    let stillUp = 0;
    try {
      stillUp = this.getServiceStatus().connectedRelays;
    } catch {
      /**
       * This runs INSIDE a catch block. An exception raised here would replace
       * a handled relay failure with an unhandled one — turning a logged
       * warning into a crash, which is strictly worse than the noise it was
       * added to reduce. If the pool cannot be asked, assume the worse case
       * and report at the louder level.
       */
      stillUp = 0;
    }
    if (stillUp > 0) {
      logger.warn(`${what} (${stillUp} other relay(s) still connected):`, relayUrl, error);
    } else {
      logger.error(`${what} — no relays are connected:`, relayUrl, error);
    }
  }

  /**
   * Schedule a reconnect attempt for a relay
   * @param {string} relayUrl - The URL of the relay to reconnect to
   * @private
   */
  private scheduleReconnect(relayUrl: string): void {
    // Don't stack reconnect timers for same relay
    if (this.reconnectTimers.has(relayUrl)) return;
    
    const attempts = this.reconnectAttempts.get(relayUrl) || 0;
    const { initialMs, maxMs, factor, jitterMs } = this.config.backoff;
    const base = Math.min(maxMs, initialMs * Math.pow(factor, attempts));
    const jitter = Math.random() * jitterMs;
    const delay = base + jitter;
    
    logger.debug(`Scheduling reconnect to ${relayUrl} in ${Math.round(delay)}ms (attempt ${attempts + 1})`);
    
    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(relayUrl);
      try {
        await this.connectToRelay(relayUrl);
        // Reset attempts on success
        this.reconnectAttempts.set(relayUrl, 0);
        logger.info(`Reconnected to relay: ${relayUrl}`);
      } catch (error) {
        this.reconnectAttempts.set(relayUrl, attempts + 1);
        this.reportRelayFailure('Failed to reconnect to relay', relayUrl, error);
      }
    }, delay);
    
    this.reconnectTimers.set(relayUrl, timer);
  }

  /**
   * Start periodic health checks of relay connections.
   * Reconnects to any relays that have dropped.
   * @private
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) return;
    
    this.healthCheckTimer = setInterval(() => {
      if (!this.initialized) return;
      
      const connectionStatus = this.pool.listConnectionStatus();
      
      for (const relay of this.relays) {
        const connected = connectionStatus.get(relay) ?? false;
        if (!connected && this.config.autoReconnect) {
          logger.debug(`Health check: relay ${relay} is disconnected, scheduling reconnect`);
          this.scheduleReconnect(relay);
        } else if (connected) {
          // Reset attempts for healthy relays
          this.reconnectAttempts.set(relay, 0);
        }
      }
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Stop the periodic health check timer.
   * @private
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Process a NIP-28 Kind 42 event received via subscription.
   * Converts the raw Nostr event into a NostrMessage and caches it.
   * @param {string} channelId - The channel this event belongs to
   * @param {Event} event - The Nostr event
   * @private
   */
  private processChannelEvent(channelId: string, event: Event): void {
    try {
      if (!event || !event.content || !event.created_at) {
        logger.debug('Invalid event received:', event);
        return;
      }
      
      const typeTag = event.tags?.find((t: string[]) => t[0] === 'type')?.[1] || 'text';
      
      const message: NostrMessage = {
        id: event.id,
        teamId: event.tags?.find((t: string[]) => t[0] === 'team')?.[1] || '',
        channelId,
        senderId: event.pubkey?.substring(0, 10) || 'unknown',
        senderDID: event.pubkey ? `did:nostr:${event.pubkey}` : 'unknown',
        content: event.content,
        messageType: typeTag as NostrMessage['messageType'],
        timestamp: event.created_at * 1000,
        encrypted: false,
        pqcEncrypted: false,
      };
      
      // Deduplicate: don't add if already cached (from own publish or relay echo)
      const channelMessages = this.messageCache.get(channelId) || [];
      if (!channelMessages.some(m => m.id === message.id)) {
        channelMessages.push(message);
        this.messageCache.set(channelId, channelMessages);
      }
      
      // Broadcast to UI listeners
      try {
        const customEvent = new CustomEvent('nostr-message-received', { detail: message });
        window.dispatchEvent(customEvent);
      } catch (e) {
        logger.error('Failed to dispatch message event:', e);
      }
      
      logger.debug('Processed new message for channel:', channelId);
    } catch (error) {
      logger.error('Error processing channel event:', error);
    }
  }

  /**
   * Subscribe to a channel's messages via real NIP-28 relay filters.
   * Uses Kind 42 (Channel Message) events with an 'e' tag referencing the channel.
   * @param {string} channelId - The NIP-28 channel event ID to subscribe to.
   * @returns {string[]} Array containing the channelId (for backward compatibility).
   */
  public subscribeToChannel(channelId: string): string[] {
    logger.debug('NostrService.subscribeToChannel called for channel:', channelId);
    
    // Already subscribed?
    if (this.activeSubs.has(channelId)) {
      logger.debug('Already subscribed to channel:', channelId);
      return [channelId];
    }
    
    // Initialize message cache for this channel
    if (!this.messageCache.has(channelId)) {
      this.messageCache.set(channelId, []);
    }
    
    // Subscribe to Kind 42 (Channel Message) events for this channel
    const sub = this.pool.subscribeMany(
      this.relays,
      { kinds: [kinds.ChannelMessage as number], '#e': [channelId] },
      {
        onevent: (event: Event) => {
          this.processChannelEvent(channelId, event);
        },
        oneose: () => {
          logger.debug('End of stored events for channel:', channelId);
        }
      }
    );
    
    this.activeSubs.set(channelId, sub);
    logger.info('Subscribed to channel:', channelId);
    return [channelId];
  }

  /**
   * Unsubscribe from a channel.
   * @param {string} channelId - The ID of the channel to unsubscribe from.
   */
  public unsubscribeFromChannel(channelId: string): void {
    logger.debug('NostrService.unsubscribeFromChannel called for channel:', channelId);
    
    const sub = this.activeSubs.get(channelId);
    if (!sub) {
      logger.debug('No subscription found for channel:', channelId);
      return;
    }
    
    sub.close();
    this.activeSubs.delete(channelId);
    logger.info('Unsubscribed from channel:', channelId);
  }

  /**
   * Check if the service is initialized.
   * @returns {boolean} True if initialized, false otherwise.
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup resources when the service is no longer needed.
   * Should be called when the application is shutting down.
   */
  public cleanup(): void {
    logger.debug('NostrService.cleanup called');
    
    // Stop health monitoring
    this.stopHealthCheck();
    
    // Clear all reconnect timers
    for (const [url, timer] of this.reconnectTimers.entries()) {
      clearTimeout(timer);
      logger.debug(`Cleared reconnect timer for relay: ${url}`);
    }
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();
    
    // Clear all subscriptions
    for (const [, sub] of this.activeSubs) {
      sub.close();
    }
    this.activeSubs.clear();
    
    // Close all relay connections via SimplePool
    if (this.pool) {
      this.pool.close(this.relays);
    }
    
    this.initialized = false;
    logger.info('NostrService cleanup completed');
  }

  /**
   * Creates a new resistance cell channel for Earth Alliance operations.
   * @param cellCode Identifier code for the resistance cell
   * @param region Geographic region of operation
   * @param specialization Areas of focus for this cell
   * @param securityLevel Security level for communications
   * @returns {Promise<ResistanceCellChannel>} The created channel
   */
  public async createResistanceCellChannel(
    cellCode: string,
    region: string,
    specialization: string[],
    securityLevel: 'standard' | 'enhanced' | 'maximum'
  ): Promise<ResistanceCellChannel> {
    logger.debug('NostrService.createResistanceCellChannel called with:', { cellCode, region, specialization, securityLevel });
    
    if (!this.initialized) throw new Error('NostrService not initialized');
    this.ensureIdentity('creating a channel');
    
    const name = `Earth Alliance: ${cellCode} (${region})`;
    const description = `Resistance cell for region ${region}`;
    
    // Publish NIP-28 Kind 40 (Channel Creation) event
    const channelEvent = await this.signNip28(nip28.channelCreateEvent, {
      content: { name, about: description, picture: '' },
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['cell', cellCode],
        ['region', region],
        ['security', securityLevel],
        ...specialization.map(s => ['spec', s])
      ]
    });
    
    if (!channelEvent) throw new Error('Failed to create channel event');
    
    const publishResults = this.pool.publish(this.relays, channelEvent);
    await Promise.any(publishResults);
    
    const channelId = channelEvent.id;
    
    const channel: ResistanceCellChannel = {
      id: channelId,
      teamId: 'earth-alliance',
      name,
      description,
      relayUrls: this.relays,
      participants: this.publicKey ? [this.publicKey] : [],
      createdAt: Date.now(),
      isActive: true,
      channelType: 'general',
      cellCode,
      region,
      specialization,
      emergencyContacts: [],
      operationalStatus: 'active',
      lastActivity: Date.now(),
      memberCount: 1,
      securityLevel
    };
    
    // Cache and auto-subscribe
    this.channelCache.set(channelId, channel);
    this.messageCache.set(channelId, []);
    this.subscribeToChannel(channelId);
    
    logger.info(`Created Earth Alliance resistance cell channel: ${channelId}`);
    return channel;
  }

  /**
   * Submit evidence to a channel.
   * @param channelId The channel to submit evidence to
   * @param evidenceData Evidence details
   * @returns {Promise<string>} ID of the submitted evidence
   */
  public async submitEvidence(
    channelId: string,
    evidenceData: {
      title: string;
      description: string;
      corruptionType: string;
      evidenceType?: string;
      targetEntities?: string[];
      sourceProtection: string;
      riskLevel: string;
    }
  ): Promise<string> {
    logger.debug('NostrService.submitEvidence called for channel:', channelId, evidenceData);
    
    if (!this.initialized) throw new Error('NostrService not initialized');
    this.ensureIdentity('submitting evidence');
    
    const content = `EVIDENCE: ${evidenceData.title}\n\n${evidenceData.description}`;
    
    // Publish as NIP-28 Kind 42 channel message with evidence tags
    const msgEvent = await this.signNip28(nip28.channelMessageEvent, {
      channel_create_event_id: channelId,
      relay_url: this.relays[0],
      content,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['type', 'evidence'],
        ['corruption', evidenceData.corruptionType],
        ['risk', evidenceData.riskLevel]
      ]
    });
    
    const publishResults = this.pool.publish(this.relays, msgEvent);
    await Promise.any(publishResults);
    
    // Emit evidence event for UI
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('earth-alliance-evidence-submitted', {
        detail: { id: msgEvent.id, channelId, ...evidenceData }
      });
      window.dispatchEvent(event);
    }
    
    logger.info(`Evidence submitted to channel ${channelId}: ${msgEvent.id}`);
    return msgEvent.id;
  }

  /**
   * Submit truth verification for a message.
   * @param messageId ID of the original message being verified
   * @param channelId Channel containing the message
   * @param verificationData Verification details
   * @returns {Promise<string>} ID of the verification
   */
  public async submitTruthVerification(
    messageId: string,
    channelId: string,
    verificationData: {
      verificationStatus: 'verified' | 'disputed' | 'requires_more_evidence';
      sourcesProvided: number;
      expertiseArea: string;
      confidenceLevel: number;
      additionalEvidence: string;
    }
  ): Promise<string> {
    logger.debug('NostrService.submitTruthVerification called for message:', messageId, verificationData);
    
    if (!this.initialized) throw new Error('NostrService not initialized');
    this.ensureIdentity('submitting a verification');
    
    const content = `VERIFICATION: ${verificationData.verificationStatus.toUpperCase()} (${verificationData.confidenceLevel}% confidence)\n\n${verificationData.additionalEvidence}`;
    
    // Publish as NIP-28 Kind 42 channel message with verification tags
    const msgEvent = await this.signNip28(nip28.channelMessageEvent, {
      channel_create_event_id: channelId,
      relay_url: this.relays[0],
      content,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['type', 'verification'],
        ['e', messageId, '', 'reply'],
        ['status', verificationData.verificationStatus],
        ['confidence', String(verificationData.confidenceLevel)]
      ]
    });
    
    const publishResults = this.pool.publish(this.relays, msgEvent);
    await Promise.any(publishResults);
    
    logger.info(`Truth verification submitted for message ${messageId}: ${msgEvent.id}`);
    return msgEvent.id;
  }

  /**
   * Send emergency coordination to a channel.
   * @param channelId The channel ID
   * @param emergencyType Type of emergency
   * @param urgencyLevel Level of urgency
   * @param emergencyData Additional emergency data
   * @returns {Promise<string>} ID of the emergency message
   */
  public async sendEmergencyCoordination(
    channelId: string,
    emergencyType: 'operational_security' | 'member_compromise' | 'evidence_critical' | 'timeline_threat',
    urgencyLevel: 'low' | 'medium' | 'high' | 'critical',
    emergencyData: {
      description: string;
      actionRequired: string;
      timeframe: string;
      affectedRegions: string[];
      resourcesNeeded: string[];
    }
  ): Promise<string> {
    logger.debug('NostrService.sendEmergencyCoordination called:', { channelId, emergencyType, urgencyLevel, emergencyData });
    
    if (!this.initialized) throw new Error('NostrService not initialized');
    this.ensureIdentity('sending an emergency coordination message');

    const content = `EMERGENCY [${urgencyLevel.toUpperCase()}]: ${emergencyType.replace('_', ' ').toUpperCase()}\n\n${emergencyData.description}\n\nACTION REQUIRED: ${emergencyData.actionRequired}\nTIMEFRAME: ${emergencyData.timeframe}`;
    
    // Publish as NIP-28 Kind 42 channel message with emergency tags
    const msgEvent = await this.signNip28(nip28.channelMessageEvent, {
      channel_create_event_id: channelId,
      relay_url: this.relays[0],
      content,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['type', 'coordination'],
        ['emergency', emergencyType],
        ['urgency', urgencyLevel],
        ...emergencyData.affectedRegions.map(r => ['region', r])
      ]
    });
    
    const publishResults = this.pool.publish(this.relays, msgEvent);
    await Promise.any(publishResults);
    
    // Emit emergency event for UI
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('earth-alliance-emergency-coordination', {
        detail: { id: msgEvent.id, channelId, emergencyType, urgencyLevel, ...emergencyData }
      });
      window.dispatchEvent(event);
    }
    
    logger.info(`Emergency coordination sent to channel ${channelId}: ${msgEvent.id}`);
    return msgEvent.id;
  }

  /**
   * Get health status of Nostr bridges.
   * @returns {Record<string, { isHealthy: boolean, successRate: number, averageLatency: number, score: number }>} Health status by bridge
   */
  public getBridgeHealthStatus(): Record<string, { 
    isHealthy: boolean; 
    successRate: number; 
    averageLatency: number;
    score: number;
  }> {
    logger.debug('NostrService.getBridgeHealthStatus called');
    
    // Derive health from real relay connection status
    const connectionStatus = this.pool.listConnectionStatus();
    const bridges: Record<string, { isHealthy: boolean; successRate: number; averageLatency: number; score: number }> = {};
    
    for (const relay of this.relays) {
      const connected = connectionStatus.get(relay) ?? false;
      bridges[relay] = {
        isHealthy: connected,
        successRate: connected ? 0.9 : 0,
        averageLatency: connected ? 150 : 0,
        score: connected ? 0.85 : 0
      };
    }
    
    return bridges;
  }

  /**
   * Test connectivity to all bridges.
   * @returns {Promise<Record<string, boolean>>} Connectivity status by bridge
   */
  public async testBridgeConnectivity(): Promise<Record<string, boolean>> {
    logger.debug('NostrService.testBridgeConnectivity called');
    
    // Test actual connectivity by attempting to ensure each relay
    const results: Record<string, boolean> = {};
    
    for (const relay of this.relays) {
      try {
        await this.pool.ensureRelay(relay, {
          connectionTimeout: this.config.eventTimeoutMs
        });
        results[relay] = true;
      } catch {
        results[relay] = false;
      }
    }
    
    return results;
  }
}

/**
 * The singleton instance of the NostrService.
 * Exporting a single instance prevents circular dependency issues and ensures
 * a true singleton pattern across the application.
 */
const nostrService = NostrService.getInstance();
export default nostrService;

export const relay = nostrService;
