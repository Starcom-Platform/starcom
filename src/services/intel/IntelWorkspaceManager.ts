import { IntelReportData } from '../../types/IntelWorkspace';
import { recordNumber } from './recordNumbers';
import { deriveSummary } from './adapters/reportMappers';
import {
  IntelItemUI,
  CreateIntelItemInput,
  requiresProtection,
  sensitivityOf,
  isInformationVisibility,
  isContentSensitivity,
  type HandlingMarked
} from '../../types/intel/IntelItemUI';
import { IntelRelationshipUI, CreateIntelRelationshipInput } from '../../types/intel/IntelRelationship';
import { IntelCaseUI, CreateIntelCaseInput, CaseStatus, CasePriority, CaseActivityAction } from '../../types/intel/IntelCaseUI';
import { MissionUI, CreateMissionInput, MissionStatus, MissionActivityAction } from '../../types/intel/MissionUI';
import { pqCryptoService, type ProtectedData } from './../crypto/PQCryptoService';
import { classifiedDataKeyStore } from './../crypto/ClassifiedDataKeyStore';
import { UNDO_WINDOW_MS } from './deletionHolding';
import { computeReportConfidence } from './confidence/computeReportConfidence';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { changesSince, mergeWorkspaces } from './workspaceMerge';

/**
 * Encryption-at-rest for CONFIDENTIAL+ Reports/Cases (Cycle 7). Wraps
 * encryptClassifiedData/decryptClassifiedData — real, tested, previously
 * with zero call sites near intel storage — around the one field that
 * actually carries the sensitive payload (report content / case
 * description), not the whole record: title/tags/status stay in plaintext
 * so the workspace can still list and search without decrypting everything
 * just to render a list. Scope is deliberately the write path plus
 * explicit on-demand decryption (decryptReportContent/decryptCaseDescription)
 * rather than retrofitting the existing synchronous bulk-read path
 * (getReports()/getCases(), 20+ call sites across the app) into an async
 * transparently-decrypting one — that's a much larger, separate refactor.
 */
/*
 * The gate on this was `classification in {CONFIDENTIAL, SECRET, TOP_SECRET}`.
 * It is now `requiresProtection(sensitivityOf(record))` — see the handling axes
 * in src/types/intel/IntelItemUI.ts. That set maps to 'protected' through the
 * migration bridge, so records already stored are unaffected: the same ones get
 * encrypted, and already-encrypted ones stay readable.
 *
 * The gain is that 'careful' now exists. A record whose content needs redacting
 * before it leaves the app, but which does not need protecting on this device,
 * could not say so under the ladder — asking for redaction meant CONFIDENTIAL,
 * which also meant encryption at rest.
 */

/**
 * Read the handling axes out of a loose metadata bag.
 *
 * IntelReportData.metadata is `Record<string, unknown>`, so every value here is
 * unverified. Narrowed rather than cast: a bag carrying `sensitivity: 42` must
 * fall through to the bridge, not be handed to a predicate as a
 * ContentSensitivity it is not.
 */
function handlingFromMetadata(metadata: Record<string, unknown> | undefined): HandlingMarked {
  // No `classification` any more: the one-time backfill below has written the
  // axes onto every stored record that carried a tier, so there is nothing
  // left for a bridge to interpret.
  return {
    visibility: isInformationVisibility(metadata?.visibility) ? metadata.visibility : undefined,
    sensitivity: isContentSensitivity(metadata?.sensitivity) ? metadata.sensitivity : undefined,
  };
}

interface StoredEncryptedContent {
  __classifiedEncrypted: true;
  ciphertext: number[];
  iv: number[];
  metadata: ProtectedData['metadata'];
}

function isStoredEncryptedContent(value: unknown): value is StoredEncryptedContent {
  return !!value && typeof value === 'object' && (value as { __classifiedEncrypted?: unknown }).__classifiedEncrypted === true;
}

/**
 * Whether a stored string field is ciphertext rather than readable text.
 *
 * Exported because UI code has to ask this before displaying, searching, or —
 * above all — putting a stored field into an editable input. The edit dialog on
 * the Cases screen seeded its description straight from the stored record: an
 * untouched blob round-tripped safely through encryptFieldIfProtected's
 * idempotency guard, but editing one character made it non-JSON, so it was
 * treated as fresh plaintext, encrypted again, and the original key overwritten
 * — silently and unrecoverably (see that guard's comment).
 *
 * Same shape as the internal guard above, which parses first; this takes the
 * raw stored string.
 */
export function isEncryptedAtRest(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    return isStoredEncryptedContent(JSON.parse(value));
  } catch {
    return false;
  }
}

async function encryptFieldIfProtected(
  id: string,
  plaintext: string,
  handling: HandlingMarked | undefined
): Promise<string> {
  if (!requiresProtection(sensitivityOf(handling))) return plaintext;
  // Idempotency guard: callers that do a read-modify-write starting from the
  // STORED record (e.g. IntelReportService/IntelCaseService/MissionService's
  // updateStatus — read the current record, change only status/closedDate/
  // dispatchedDate, spread the rest through unchanged) pass the field
  // through as whatever it already is. For a CONFIDENTIAL+ record that's
  // already-encrypted ciphertext, not plaintext — without this check it
  // would get encrypted a second time, corrupting the data (the original
  // decryption key is overwritten in classifiedDataKeyStore.put below,
  // making the first layer permanently unrecoverable even though the
  // "encryption" appears to succeed with no error).
  let alreadyEncrypted = false;
  try {
    alreadyEncrypted = isStoredEncryptedContent(JSON.parse(plaintext));
  } catch {
    // Not JSON at all — definitely real plaintext, proceed to encrypt.
  }
  if (alreadyEncrypted) return plaintext;

  const { data, key } = await pqCryptoService.encryptProtectedData(plaintext);
  await classifiedDataKeyStore.put(id, key);
  const stored: StoredEncryptedContent = {
    __classifiedEncrypted: true,
    ciphertext: Array.from(data.ciphertext),
    iv: Array.from(data.iv),
    metadata: data.metadata
  };
  return JSON.stringify(stored);
}

async function decryptFieldIfEncrypted(id: string, storedValue: string): Promise<string | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storedValue);
  } catch {
    return storedValue; // not JSON at all — never encrypted, return as-is
  }
  if (!isStoredEncryptedContent(parsed)) return storedValue;

  const key = await classifiedDataKeyStore.get(id);
  if (!key) return null; // key genuinely missing — cannot decrypt, not a plaintext fallback

  const protectedData: ProtectedData = {
    ciphertext: new Uint8Array(parsed.ciphertext),
    iv: new Uint8Array(parsed.iv),
    metadata: parsed.metadata
  };
  /*
   * A paragraph of workaround stood here, explaining that the decrypt path had
   * to be handed the level recorded in the stored ciphertext's own metadata
   * rather than the record's CURRENT one — because reclassifying a record
   * (SECRET to TOP_SECRET, an ordinary workflow action) does not re-encrypt
   * already-stored ciphertext, so the old exact-match check rejected every
   * subsequent read with "Access denied" against data this app owned and held
   * the key for. It closed by conceding that "this app doesn't enforce real
   * hierarchical clearance anywhere, a documented limitation".
   *
   * The check is gone, so the workaround is unnecessary: decryption needs the
   * key and nothing else. Records encrypted before the purge still carry a tier
   * in `metadata.classification`; ProtectedData accepts it on read and no code
   * reads it.
   */
  return pqCryptoService.decryptProtectedData(protectedData, key);
}

/*
 * ─── ONE-TIME MIGRATION: STORED TIERS BECOME STORED AXES ───────────────────
 *
 * Stage 6a's bridge (sensitivityOf/visibilityOf) let a record stored with only
 * a `classification` behave correctly without being rewritten. Stage 7c
 * deletes that bridge, and deleting it without this migration would lose those
 * records' markings — quietly, and in the dangerous direction.
 *
 * The failure it prevents, concretely: a case stored with
 * `classification: 'CONFIDENTIAL'` has its description as ciphertext at rest
 * right now. Reads keep working after the bridge goes, because decryption is
 * driven by the envelope marker rather than any label. But with no
 * `sensitivity` on the record, the next EDIT would store the retyped
 * description as plaintext — a protected case silently becoming unprotected,
 * which is exactly the class of defect this whole migration exists to remove.
 *
 * The mapping is the bridge's for what is kept at rest: the rungs that fired
 * encryption become 'protected', everything else 'open'. Where a record may
 * go is another matter. A protected rung becomes 'private'; anything else is
 * left undecided, because undecided goes nowhere (plan items 0.4, 0.5). This
 * used to fill it with 'public', and what it filled before that was fixed is
 * listed once for review (plan item 9.6, decision G3).
 *
 * `classification` is deliberately NOT deleted from the stored records. This
 * migration is additive, so it can run twice without harm and a downgrade to
 * an older build still finds what it expects. The version flag stops it
 * repeating.
 */
const WORKSPACE_STATE_VERSION = 2;

const LEGACY_RUNGS_REQUIRING_PROTECTION = new Set(['CONFIDENTIAL', 'SECRET', 'TOP_SECRET']);

/** Fills in the axes from a legacy tier. Returns true if it changed anything. */
function backfillHandlingAxes(record: {
  classification?: unknown;
  visibility?: unknown;
  sensitivity?: unknown;
}): boolean {
  // An explicit axis always wins; this only fills absence.
  if (record.visibility !== undefined && record.sensitivity !== undefined) return false;
  const tier = typeof record.classification === 'string' ? record.classification : '';
  const protectedTier = LEGACY_RUNGS_REQUIRING_PROTECTION.has(tier);
  let changed = false;
  if (record.visibility === undefined && protectedTier) {
    record.visibility = 'private';
    changed = true;
  }
  if (record.sensitivity === undefined) {
    record.sensitivity = protectedTier ? 'protected' : 'open';
    changed = true;
  }
  return changed;
}

// Storage Keys (legacy + new)
const LEGACY_KEY = 'intel-reports'; // very first dashboard key
const INTERMEDIATE_REPORTS_KEY = 'intelWorkspace.reports'; // Phase 1 refactor key
const MIGRATION_FLAG = 'intelWorkspace.migrated';
const WORKSPACE_KEY_V1 = 'intelWorkspace.v1';

// IndexedDB constants (Step 2.4.1)
const IDB_NAME = 'intel-workspace';
const IDB_VERSION = 1;
const IDB_STORE = 'state'; // single object store keyed by 'workspace'

interface WorkspaceStateV1 {
  version: 1;
  reports: IntelReportData[];
  intel: IntelItemInternal[];
  packages: any[];
  // Added when relationships/cases were folded into this same substrate —
  // absent on state persisted before that point, so every load path
  // normalizes them in via normalizeState() rather than assuming presence.
  relationships?: IntelRelationshipUI[];
  cases?: IntelCaseUI[];
  // Added when Missions (Cycle 3) were folded into this same substrate —
  // same "absent on old state, normalized in via getState()" convention as
  // relationships/cases above.
  missions?: MissionUI[];
  /** Every delete, with what was deleted (plan item 0.6). Absent on older state. */
  deletions?: DeletionEntry[];
  metadata?: {
    createdAt: string;
    upgradedFrom?: 'legacy' | 'intermediate';
    /**
     * When this copy was written, in ms. There are two copies, IndexedDB's and
     * the quick localStorage one, and loading takes the newer (see loadState_).
     */
    savedAt?: number;
  };
}

export type DeletedKind = 'report' | 'case' | 'mission' | 'item';

/**
 * One delete, logged with the record as it was (plan item 0.6). A case's or
 * mission's own activity log is stored on the record and went with it, so
 * without this a delete left no trace at all.
 */
export interface DeletionEntry {
  kind: DeletedKind;
  id: string;
  title: string;
  deletedAt: string;
  /** Where it was, so a restore puts it back in the same place. */
  index: number;
  /** The record as it was deleted; for a protected record, still ciphertext. */
  snapshot: IntelReportData | IntelCaseUI | MissionUI | IntelItemInternal;
  restoredAt?: string;
  /** When a protected record's key went, once the deletion was final. */
  finalizedAt?: string;
}


interface IntelItemInternal {
  id: string;
  frontmatter: {
    title: string;
    type: string;
    source: string;
    reliability: string;
    confidence: number;
    timestamp: number;
    collectedAt: string;
    tags: string[];
    categories: string[];
    latitude?: number;
    longitude?: number;
    verified: boolean;
    version?: number;
    history?: { timestamp: string; action: string; user?: string; changes?: string[] }[];
    // Provenance/quality fields ported from core/intel's IntelEntity (see
    // IntelItemUI). Optional, not set by addIntelItem() (CreateIntelItemInput
    // doesn't accept them) — only ever populated via updateIntelItem().
    processingLineage?: IntelItemUI['processingLineage'];
    confidenceMetrics?: IntelItemUI['confidenceMetrics'];
    osintMetadata?: IntelItemUI['osintMetadata'];
    // Event-dating fields ported from core/intel's TimelineEvent — see
    // timelineAdapter.ts, the first real consumer of these.
    eventDate?: string;
    eventEndDate?: string;
    isEstimated?: boolean;
    importance?: number;
    relatedIds?: string[];
    // Named entities this item concerns — author-tagged, settable at
    // creation (unlike relatedIds above). See IntelItemUI.entityRefs.
    entityRefs?: string[];
    // Handling axes (see IntelItemUI). Carried here so addIntelItem cannot
    // accept a `sensitivity` on its input and then silently drop it on the
    // floor — a stripped field is invisible to the compiler and to the caller.
    // Stage 9 handles the .intel FILE frontmatter, which is a separate
    // read-tolerance question; this is the in-memory/localStorage shape.
    visibility?: IntelItemUI['visibility'];
    sensitivity?: IntelItemUI['sensitivity'];
  };
  content: string;
  createdAt: string;
  modifiedAt: string;
  /** Kept beside the frontmatter by a bundle's import (importBundle.ts). */
  receivedFrom?: IntelItemUI['receivedFrom'];
}

interface WorkspacePersistenceStats {
  saveRequests: number;
  flushCount: number;
  immediateFlushCount: number;
  pendingReschedules: number;
  lastFlushAt: number | null;
  lastSerializedBytes: number;
  pendingTimerActive: boolean;
  pendingDirty: boolean;
  /**
   * The localStorage copy could not be written — almost always quota.
   *
   * Recorded rather than thrown or ignored. IndexedDB is the primary store and
   * has already succeeded by this point, so the workspace IS persisted; what is
   * stale is the backward-compatibility copy. Throwing would break a save that
   * actually worked, and silence would leave an old copy that a future read
   * could prefer, with nothing anywhere saying it was old.
   */
  fallbackWriteFailed: boolean;
}


/**
 * localStorage, or nothing.
 *
 * `doInitialize` runs asynchronously and can outlive the environment that
 * provided storage. When it does — a test file finishing before its deferred
 * tick runs, for instance — `localStorage` is simply not defined by then, and a
 * raw access throws `ReferenceError: localStorage is not defined` into an
 * unhandled rejection: no test fails, and the whole run exits non-zero with the
 * cause reported against whichever file happened to be last.
 *
 * Returning null rather than throwing makes an absent store behave like an
 * empty one. A read finds nothing, which is true; a write is dropped, which is
 * the correct direction to fail — the alternative is a workspace that believes
 * it persisted something it did not.
 */
function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    // Private mode, or storage disabled by policy.
    return null;
  }
}

export class IntelWorkspaceManager {
  private state: WorkspaceStateV1 | null = null;
  private listeners = new Set<() => void>();
  /**
   * The in-flight initialization promise, not just a boolean. A concurrent
   * second caller must await this SAME promise — the previous `initializing`
   * boolean guard let a second call return immediately while `this.state`
   * was still unset, so a caller could read state before it existed (see
   * getState()'s "Workspace not initialized" throw, hit under real
   * concurrent access from IntelReportService's 20+ call sites).
   */
  private initializingPromise: Promise<void> | null = null;
  private pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSaveDirty = false;
  private readonly saveDebounceMs = 300;
  private idbAvailable = false;
  /**
   * The workspace as this copy last read or wrote it: what its own changes are measured from.
   *
   * A tab and Uplink's side panel are two copies of the app, each with the workspace in memory
   * (decision D-EX, E2, W6). Saving whole, the copy open longer erased what the other had saved since.
   * Now a copy lays only its changes since this over what is stored (workspaceMerge.ts), and hears the
   * other's saves on a channel. One gap stays: two copies saving in the same instant, or a workspace
   * too large for the quick localStorage copy, can still let the later save of the moment stand alone.
   */
  private base: WorkspaceStateV1 | null = null;
  private channel: BroadcastChannel | null = null;
  private readonly copyId = Math.random().toString(36).slice(2);
  private persistenceStats: WorkspacePersistenceStats = {
    saveRequests: 0,
    flushCount: 0,
    immediateFlushCount: 0,
    pendingReschedules: 0,
    lastFlushAt: null,
    lastSerializedBytes: 0,
    fallbackWriteFailed: false,
    pendingTimerActive: false,
    pendingDirty: false
  };

  private notify() { this.listeners.forEach(l => l()); }

  /**
   * The real identity, rather than the hardcoded 'operative' placeholder every write
   * path here used before.
   *
   * ENSURED, not read. This comment used to say the identity was "effectively always"
   * there because the keypair was self-generated at module load — true only because
   * merely opening the app minted a key nobody asked for. Keys are now created when
   * work needs one, and authoring a case or mission is that work: it is recorded under
   * this identity and published under it later. A plain read would have put every
   * first case back under 'operative', undoing the fix this method exists for.
   *
   * The SIGNER's key (plan item 2.2): with an extension installed, the extension's.
   * This used to make a local key whatever was installed, so a person whose
   * extension signs everything they publish had their cases and missions recorded
   * under a second key they had never seen.
   */
  private currentAuthor(reason: string): Promise<string> {
    return nostrIdentityService.ensureSigner(reason);
  }

  /**
   * The same for the one synchronous path, relationships. An extension that has
   * not answered yet names nobody, rather than a key it will never sign with.
   */
  private currentActorId(): string {
    const signer = nostrIdentityService.signerPubkey();
    if (signer) return signer;
    if (nostrIdentityService.hasExtension()) return '';
    return nostrIdentityService.ensureLocalIdentity('linking two records');
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  private loadState(): WorkspaceStateV1 | null {
    if (typeof window === 'undefined') return null;
    const raw = storage()?.getItem(WORKSPACE_KEY_V1);
    if (!raw) return null;
    try { return JSON.parse(raw) as WorkspaceStateV1; } catch { return null; }
  }

  // IndexedDB helpers (Step 2.4.1)
  private openIDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async loadStateFromIDB(): Promise<WorkspaceStateV1 | null> {
    try {
      const db = await this.openIDB();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get('workspace');
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
      });
    } catch {
      return null;
    }
  }

  private async saveStateToIDB(): Promise<boolean> {
    if (!this.state) return false;
    try {
      const db = await this.openIDB();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(this.state, 'workspace');
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); resolve(false); };
      });
    } catch {
      return false;
    }
  }

  private flushStateToStorage() {
    if (typeof window === 'undefined' || !this.state || !this.pendingSaveDirty) return;
    // Another copy of the app saved since this one read: lay this copy's changes over that, not over it.
    const mergedOthers = this.mergeOtherCopiesSaves();
    // Both copies carry when they were written, so loading can take the newer.
    const savedAt = Math.max(Date.now(), (this.base?.metadata?.savedAt ?? 0) + 1);
    this.state.metadata = { ...(this.state.metadata ?? { createdAt: new Date().toISOString() }), savedAt };

    // Primary: write to IndexedDB
    if (this.idbAvailable) {
      this.saveStateToIDB().catch(() => {/* logged internally */});
    }
    /*
     * Fallback: the localStorage copy, for readers that predate IndexedDB.
     *
     * The whole workspace is one key, so this grows with the records in it and
     * meets the ~5MB origin limit long before IndexedDB is troubled. setItem
     * was unguarded: past that point every flush threw QuotaExceededError —
     * AFTER the primary write above had succeeded — and the line below never
     * ran, so the workspace also stayed permanently dirty.
     *
     * `storage()` already treats an absent store as an empty one, for the
     * stated reason that a dropped write fails in the right direction. A full
     * store is the same case, so it drops the same way and says so in the stats
     * rather than pretending.
     */
    const payload = JSON.stringify(this.state);
    try {
      storage()?.setItem(WORKSPACE_KEY_V1, payload);
      this.persistenceStats.fallbackWriteFailed = false;
    } catch {
      this.persistenceStats.fallbackWriteFailed = true;
    }
    this.pendingSaveDirty = false;

    this.persistenceStats.flushCount += 1;
    this.persistenceStats.lastFlushAt = Date.now();
    this.persistenceStats.lastSerializedBytes = payload.length;
    this.persistenceStats.pendingDirty = false;

    this.base = JSON.parse(payload) as WorkspaceStateV1;
    this.channel?.postMessage({ from: this.copyId, savedAt });
    if (mergedOthers) this.notify();
  }

  /**
   * Lays this copy's changes since `base` over a newer save by another copy, read from the quick
   * localStorage copy, which every copy writes on each save. True when there was one.
   */
  private mergeOtherCopiesSaves(): boolean {
    if (!this.state || !this.base) return false;
    const latest = this.loadState();
    if (!latest || (latest.metadata?.savedAt ?? 0) <= (this.base.metadata?.savedAt ?? 0)) return false;
    this.state = mergeWorkspaces(latest, changesSince(this.base, this.state), this.state.version);
    return true;
  }

  /** Hears every other copy's saves in this browser, and takes them in without a reload. */
  private listenToOtherCopies(): void {
    if (this.channel || typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel('starcom-workspace');
    // Never what keeps a process (a test run) alive.
    (this.channel as BroadcastChannel & { unref?: () => void }).unref?.();
    this.channel.onmessage = (event: MessageEvent) => {
      if ((event.data as { from?: string } | null)?.from !== this.copyId) void this.takeInOtherCopiesSave();
    };
  }

  /** Another copy saved: read what is stored, keep this copy's unsaved changes on top, and say so. */
  private async takeInOtherCopiesSave(): Promise<void> {
    if (!this.state) return;
    let latest = this.loadState();
    if (this.idbAvailable) {
      const stored = await this.loadStateFromIDB();
      if (stored && (stored.metadata?.savedAt ?? 0) > (latest?.metadata?.savedAt ?? 0)) latest = stored;
    }
    if (!this.state || !latest || (latest.metadata?.savedAt ?? 0) <= (this.base?.metadata?.savedAt ?? 0)) return;
    this.state = this.pendingSaveDirty && this.base
      ? mergeWorkspaces(latest, changesSince(this.base, this.state), this.state.version)
      : latest;
    this.base = JSON.parse(JSON.stringify(latest)) as WorkspaceStateV1;
    this.notify();
  }

  private saveState(options?: { immediate?: boolean }) {
    if (typeof window === 'undefined' || !this.state) return;

    this.persistenceStats.saveRequests += 1;
    this.pendingSaveDirty = true;
    this.persistenceStats.pendingDirty = true;

    if (options?.immediate) {
      if (this.pendingSaveTimer) {
        clearTimeout(this.pendingSaveTimer);
        this.pendingSaveTimer = null;
        this.persistenceStats.pendingTimerActive = false;
      }
      this.persistenceStats.immediateFlushCount += 1;
      this.flushStateToStorage();
      return;
    }

    if (this.pendingSaveTimer) {
      this.persistenceStats.pendingReschedules += 1;
      return;
    }

    this.pendingSaveTimer = setTimeout(() => {
      this.pendingSaveTimer = null;
      this.persistenceStats.pendingTimerActive = false;
      this.flushStateToStorage();
    }, this.saveDebounceMs);
    this.persistenceStats.pendingTimerActive = true;
  }

  /**
   * Cancel any write this manager still has scheduled.
   *
   * Writes are debounced by 300ms. That is right for the app — it collapses a
   * burst of edits into one serialisation — but it means a write can land up
   * to 300ms after the code that requested it has finished.
   *
   * Across a test-file boundary that is a real defect and it was measured:
   * file A creates two reports and returns without waiting; file B clears
   * localStorage in `beforeEach`; A's timer then fires and writes A's
   * workspace into the storage B just cleaned. B initialises, loads two
   * reports it never created, and a test asserting "2" finds 3.
   *
   * That is the whole of D6. It looked like state leaking between files, but
   * module isolation was working correctly the entire time — a probe confirmed
   * a fresh file sees an empty manager. What crosses the boundary is not
   * memory, it is a PENDING TIMER, and it only reproduces under a long
   * sequential run because that is where files finish close enough together
   * for the window to still be open.
   *
   * Cancel rather than flush: at the end of a test file there is nothing worth
   * persisting, and flushing would write the very data the next file is about
   * to clear.
   */
  /**
   * Test seam: forget the cached workspace entirely.
   *
   * Cancelling the pending write was not enough. This manager caches the whole
   * workspace in `state`, and the suite runs `pool: forks` with
   * `singleFork: true`, so that cache outlives the storage teardown and
   * carries one FILE's records into the next. A test asserting "removed, so
   * zero remain" then finds three it never created.
   *
   * Called at the file boundary, not between tests: tests within a file
   * routinely share setup deliberately, and wiping a singleton between every
   * test breaks that and hangs anything holding an in-flight initialisation.
   * I established that cadence the expensive way.
   */
  resetForTests(): void {
    this.cancelPendingSave();
    this.channel?.close();
    this.channel = null;
    this.base = null;
    this.state = null;
    this.initializingPromise = null;
    this.listeners.clear();
  }

  /**
   * Write now a change still waiting out the 300 ms debounce.
   *
   * Called when the page is hidden or left. A mission created and the page
   * reloaded at once was lost, three times in three on a build: the write was
   * still waiting when the page went, and the next load read the copy from
   * before it (found while building plan item 1.8). The debounce is kept for
   * bursts of edits; leaving the page ends it.
   */
  flushPendingSave(): void {
    if (!this.pendingSaveTimer) return;
    clearTimeout(this.pendingSaveTimer);
    this.pendingSaveTimer = null;
    this.persistenceStats.pendingTimerActive = false;
    this.flushStateToStorage();
  }

  /** Registered once, when the workspace first loads. */
  private flushOnLeaveRegistered = false;
  private flushOnLeave(): void {
    if (this.flushOnLeaveRegistered || typeof window === 'undefined' || typeof document === 'undefined') return;
    this.flushOnLeaveRegistered = true;
    // pagehide covers a reload, a close and a navigation away; a hidden page may
    // never see another event, which is the rule on phones.
    window.addEventListener('pagehide', () => this.flushPendingSave());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushPendingSave();
    });
  }

  cancelPendingSave(): void {
    if (this.pendingSaveTimer) {
      clearTimeout(this.pendingSaveTimer);
      this.pendingSaveTimer = null;
      this.persistenceStats.pendingTimerActive = false;
    }
    this.pendingSaveDirty = false;
    this.persistenceStats.pendingDirty = false;
  }

  getPersistenceStats(): WorkspacePersistenceStats {
    return {
      ...this.persistenceStats,
      pendingTimerActive: this.pendingSaveTimer !== null,
      pendingDirty: this.pendingSaveDirty
    };
  }

  async ensureInitialized(): Promise<void> {
    if (this.state) return;
    if (!this.initializingPromise) {
      this.initializingPromise = this.doInitialize();
    }
    return this.initializingPromise;
  }

  private async doInitialize(): Promise<void> {
    this.flushOnLeave();
    await this.loadState_();
    if (this.state) this.base = JSON.parse(JSON.stringify(this.state)) as WorkspaceStateV1;
    this.listenToOtherCopies();
    // A page closed inside a deletion's Undo window never made it final, so a
    // protected record's key would have stayed forever (plan item 0.6).
    await this.finalizeOverdueDeletions();
    // Runs after whichever branch above produced the state — IndexedDB,
    // localStorage, the intermediate key, the legacy structure, or an empty
    // workspace. Putting it in one branch would migrate one storage path and
    // silently skip the rest, which is how half-migrated state happens.
    this.backfillHandlingAxesOnce();
  }

  /**
   * Fill in visibility/sensitivity on records that only carry a legacy tier.
   *
   * Version-flagged so it runs once. Additive: the tier is left in place, so
   * running it twice is harmless and an older build still finds its field.
   */
  private backfillHandlingAxesOnce(): void {
    const s = this.getState();
    if ((s.version as number) >= WORKSPACE_STATE_VERSION) return;

    for (const report of s.reports) {
      const meta = (report.metadata ?? (report.metadata = {})) as Record<string, unknown>;
      backfillHandlingAxes(meta);
    }
    for (const item of s.intel) {
      backfillHandlingAxes(item.frontmatter as unknown as Record<string, unknown>);
    }
    for (const record of s.cases ?? []) {
      backfillHandlingAxes(record as unknown as Record<string, unknown>);
    }
    for (const record of s.missions ?? []) {
      backfillHandlingAxes(record as unknown as Record<string, unknown>);
    }

    (s as { version: number }).version = WORKSPACE_STATE_VERSION;
    this.saveState({ immediate: true });
  }

  private async loadState_(): Promise<void> {
    try {
      // Probe IndexedDB availability
      try {
        const db = await this.openIDB();
        db.close();
        this.idbAvailable = true;
      } catch { this.idbAvailable = false; }

      // 0. Try IndexedDB first (fresh installs + already-migrated)
      if (this.idbAvailable) {
        const idbState = await this.loadStateFromIDB();
        if (idbState) {
          // A write begun as the page was left may not have reached IndexedDB,
          // while the localStorage copy, written at once, did. Taking
          // IndexedDB's regardless lost a mission created just before a reload,
          // for good: the next write wrote the older state back to both.
          const quick = this.loadState();
          const newer = quick && (quick.metadata?.savedAt ?? 0) > (idbState.metadata?.savedAt ?? 0);
          this.state = newer ? quick : idbState;
          if (newer) this.saveState({ immediate: true });
          return;
        }
      }

      // 1. Existing localStorage workspace → migrate to IndexedDB
      const existing = this.loadState();
      if (existing) {
        this.state = existing;
        if (this.idbAvailable) await this.saveStateToIDB();
        return;
      }

      // 2. Intermediate reports key from Phase 1?
      const intermediateRaw = storage()?.getItem(INTERMEDIATE_REPORTS_KEY);
      if (intermediateRaw) {
        try {
          const reports = JSON.parse(intermediateRaw) as IntelReportData[];
          this.state = {
            version: 1,
            reports,
            intel: [],
            packages: [],
            metadata: { createdAt: new Date().toISOString(), upgradedFrom: 'intermediate' }
          };
          this.saveState({ immediate: true });
          return;
        } catch {/* fallthrough */}
      }

      // 3. Legacy migration (original localStorage structure)
      const migrated = storage()?.getItem(MIGRATION_FLAG);
      if (!migrated) {
        const legacyRaw = storage()?.getItem(LEGACY_KEY);
        if (legacyRaw) {
          try {
            const legacy = JSON.parse(legacyRaw) as any[];
            const nowISO = new Date().toISOString();
            const reports: IntelReportData[] = legacy.map(item => {
              const id: string = item.id || `intel-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
              const createdAt = new Date(item.createdAt || nowISO).toISOString();
              const updatedAt = new Date(item.updatedAt || createdAt).toISOString();
              const summary = deriveSummary(item.content || '');
              return {
                id,
                title: item.title || 'Untitled',
                type: 'INTEL_REPORT',
                summary,
                content: item.content || '',
                conclusions: [],
                recommendations: [],
                analysisType: 'GENERAL',
                methodology: [],
                confidence: 0.5,
                sourceIntel: [],
                author: item.author || 'unknown',
                contributors: [],
                createdAt,
                modifiedAt: updatedAt,
                targetAudience: [],
                distributionRestrictions: [],
                relatedReports: [],
                metadata: {
                  status: item.status || 'DRAFT',
                  categories: item.category ? [item.category] : [],
                  tags: item.tags || [],
                  geo: (item.latitude && item.longitude) ? { lat: item.latitude, lon: item.longitude } : undefined
                }
              } as IntelReportData;
            });
            this.state = {
              version: 1,
              reports,
              intel: [],
              packages: [],
              metadata: { createdAt: nowISO, upgradedFrom: 'legacy' }
            };
            this.saveState({ immediate: true });
            storage()?.setItem(MIGRATION_FLAG, 'true');
            return;
          } catch {/* ignore */}
        }
      }

      // 4. Empty new workspace
      this.state = {
        version: 1,
        reports: [],
        intel: [],
        packages: [],
        metadata: { createdAt: new Date().toISOString() }
      };
      this.saveState({ immediate: true });
    } finally {
      // this.state is set by every path above (success or fallback-to-empty),
      // so ensureInitialized()'s `if (this.state) return` guard now correctly
      // short-circuits any future call — the promise itself doesn't need to
      // be cleared for that. It IS cleared so a failed initialize() (all
      // paths above are best-effort try/catch internally, but if something
      // upstream — e.g. a thrown error escaping a future edit to this method —
      // ever leaves this.state unset, the next call gets a fresh attempt
      // instead of being permanently stuck awaiting a promise that already
      // resolved without setting state).
      if (!this.state) {
        this.initializingPromise = null;
      }
    }
  }

  private getState(): WorkspaceStateV1 {
    if (!this.state) throw new Error('Workspace not initialized');
    // State persisted before relationships/cases existed won't have these
    // keys — backfill once, lazily, rather than touching every load path.
    if (!this.state.relationships) this.state.relationships = [];
    if (!this.state.cases) this.state.cases = [];
    if (!this.state.missions) this.state.missions = [];
    if (!this.state.deletions) this.state.deletions = [];
    return this.state;
  }

  // DELETIONS (plan item 0.6) -----------------------------------------------

  /** Every delete, oldest first, with what was deleted. */
  deletions(): DeletionEntry[] { return this.getState().deletions!.slice(); }

  private listFor(kind: DeletedKind): Array<{ id: string }> {
    const s = this.getState();
    return kind === 'report' ? s.reports : kind === 'case' ? s.cases! : kind === 'item' ? s.intel : s.missions!;
  }

  /**
   * Takes a record out and logs it with a snapshot. A protected record's key
   * is left alone: it goes when the deletion is final, so an Undo inside the
   * window brings back something readable.
   */
  private removeAndLog(kind: DeletedKind, id: string, title: (record: never) => string): DeletionEntry | null {
    const list = this.listFor(kind);
    const index = list.findIndex((r) => r.id === id);
    if (index === -1) return null;
    const [record] = list.splice(index, 1);
    const entry: DeletionEntry = {
      kind, id, index,
      title: title(record as never),
      deletedAt: new Date().toISOString(),
      snapshot: record as DeletionEntry['snapshot'],
    };
    this.getState().deletions!.push(entry);
    this.saveState();
    this.notify();
    return entry;
  }

  private openDeletion(kind: DeletedKind, id: string): DeletionEntry | undefined {
    return [...this.getState().deletions!].reverse()
      .find((d) => d.kind === kind && d.id === id && !d.restoredAt && !d.finalizedAt);
  }

  /**
   * Puts a deleted record back: the same record, in the same place. Null when
   * it cannot be: never deleted, already back, or already final.
   */
  restoreDeleted(kind: DeletedKind, id: string): DeletionEntry['snapshot'] | null {
    const entry = this.openDeletion(kind, id);
    const list = this.listFor(kind);
    if (!entry || list.some((r) => r.id === id)) return null;
    list.splice(Math.min(entry.index, list.length), 0, entry.snapshot);
    entry.restoredAt = new Date().toISOString();
    this.saveState();
    this.notify();
    return entry.snapshot;
  }

  /** Makes a deletion final: a protected record's key is deleted now, not before. */
  async finalizeDeletion(kind: DeletedKind, id: string): Promise<void> {
    const entry = this.openDeletion(kind, id);
    if (!entry || this.listFor(kind).some((r) => r.id === id)) return;
    await classifiedDataKeyStore.delete(id).catch(() => { /* best-effort cleanup */ });
    entry.finalizedAt = new Date().toISOString();
    this.saveState();
  }

  /** Finishes every deletion whose window has passed without an Undo. */
  async finalizeOverdueDeletions(now: number = Date.now()): Promise<void> {
    const overdue = this.getState().deletions!.filter(
      (d) => !d.restoredAt && !d.finalizedAt && Date.parse(d.deletedAt) + UNDO_WINDOW_MS <= now,
    );
    for (const d of overdue) await this.finalizeDeletion(d.kind, d.id);
  }

  // REPORT OPERATIONS -------------------------------------------------------
  getReports(): IntelReportData[] { return this.getState().reports.slice(); }

  /**
   * Overwrites `report.confidence` with a value derived from the reliability
   * grades of whatever Intel it cites (sourceIntel), whenever it cites
   * anything — confidence and provenance previously had zero relationship
   * to each other; this is the wiring that connects them. Deliberately not
   * an opt-in: there's no way today to distinguish "the analyst explicitly
   * chose this number" from "the form's 0.5 default was never touched," so
   * treating any linked source as authoritative signal is the honest
   * default until the edit UI grows a real override affordance. A report
   * with no linked sources at all is untouched — the author's own number,
   * or the existing 0.5 default, stands exactly as before.
   */
  private applyDerivedConfidence(report: IntelReportData): IntelReportData {
    const derived = computeReportConfidence(
      report.sourceIntel,
      (id) => this.getIntelItem(id)?.reliability
    );
    if (!derived) return report;
    return {
      ...report,
      confidence: derived.value,
      metadata: {
        ...report.metadata,
        confidenceBasis: {
          source: derived.basis,
          algorithmVersion: derived.algorithmVersion,
          sourceCount: derived.sourceCount
        }
      }
    };
  }

  async addReport(report: IntelReportData) {
    const handling = handlingFromMetadata(report.metadata);
    const withConfidence = this.applyDerivedConfidence(report);
    const stored: IntelReportData = {
      ...withConfidence,
      content: await encryptFieldIfProtected(report.id, report.content, handling)
    };
    const s = this.getState();
    s.reports.push(stored);
    this.saveState();
    this.notify();
  }

  async updateReport(report: IntelReportData) {
    const handling = handlingFromMetadata(report.metadata);
    const withConfidence = this.applyDerivedConfidence(report);
    const stored: IntelReportData = {
      ...withConfidence,
      content: await encryptFieldIfProtected(report.id, report.content, handling)
    };
    const s = this.getState();
    const idx = s.reports.findIndex(r => r.id === stored.id);
    if (idx !== -1) {
      s.reports[idx] = stored;
      this.saveState();
      this.notify();
    }
  }

  /** Removes and logs a report; its key stays until finalizeDeletion (plan item 0.6). */
  removeReport(id: string): DeletionEntry | null {
    return this.removeAndLog('report', id, (r: IntelReportData) => r.title);
  }

  /**
   * Decrypt a CONFIDENTIAL+ report's content on demand. Returns the
   * plaintext unchanged for a report that was never encrypted, and null
   * if the record is encrypted but its key is genuinely missing (never a
   * silent plaintext fallback for that case).
   */
  async decryptReportContent(id: string): Promise<string | null> {
    const report = this.getState().reports.find(r => r.id === id);
    if (!report) return null;
    return decryptFieldIfEncrypted(id, report.content);
  }

  // INTEL ITEM OPERATIONS ---------------------------------------------------
  getIntelItems(): IntelItemUI[] {
    return this.getState().intel.map(i => this.internalIntelToUI(i));
  }
  getIntelItem(id: string): IntelItemUI | null {
    const found = this.getState().intel.find(i => i.id === id);
    return found ? this.internalIntelToUI(found) : null;
  }

  addIntelItem(input: CreateIntelItemInput): IntelItemUI {
    const now = new Date();
    const id = `intelitem-${now.getTime()}-${Math.random().toString(36).slice(2,6)}`;
    const internal: IntelItemInternal = {
      id,
      frontmatter: {
        title: input.title,
        type: input.type,
        visibility: input.visibility,
        sensitivity: input.sensitivity,
        source: input.source,
        reliability: input.reliability,
        confidence: input.confidence,
        timestamp: now.getTime(),
        collectedAt: input.collectedAt ?? now.toISOString(),
        tags: input.tags,
        categories: input.categories,
        latitude: input.latitude,
        longitude: input.longitude,
        verified: input.verified ?? false,
        version: 1,
        history: [{ timestamp: now.toISOString(), action: 'CREATED' as const }],
        entityRefs: input.entityRefs
      },
      content: input.content,
      createdAt: now.toISOString(),
      modifiedAt: now.toISOString()
    };
    const s = this.getState();
    s.intel.push(internal);
    this.saveState();
    this.notify();
    return this.internalIntelToUI(internal);
  }

  /** Removes and logs an intel item, held for Undo like a report (plan item 0.6): a discarded capture (D-EX, E2). */
  removeIntelItem(id: string): DeletionEntry | null {
    return this.removeAndLog('item', id, (r: IntelItemInternal) => r.frontmatter.title);
  }

  updateIntelItem(item: IntelItemUI) {
    const s = this.getState();
    const idx = s.intel.findIndex(i => i.id === item.id);
    if (idx === -1) return;
    const now = new Date();
    const prev = s.intel[idx];
    const prevFront = prev.frontmatter;
    const changes: string[] = [];
    const track = <T extends keyof IntelItemUI>(field: T, before: any, after: any) => {
      if (Array.isArray(before) && Array.isArray(after)) {
        if (before.join('\u0001') !== after.join('\u0001')) changes.push(String(field));
      } else if (before !== after) changes.push(String(field));
    };
    track('title', prevFront.title, item.title);
    track('type', prevFront.type, item.type);
    track('visibility', prevFront.visibility, item.visibility);
    track('sensitivity', prevFront.sensitivity, item.sensitivity);
    track('reliability', prevFront.reliability, item.reliability);
    track('confidence', prevFront.confidence, item.confidence);
    track('tags', prevFront.tags, item.tags);
    track('categories', prevFront.categories, item.categories);
    track('latitude', prevFront.latitude, item.latitude);
    track('longitude', prevFront.longitude, item.longitude);
    track('verified', prevFront.verified, item.verified);
    track('content', prev.content, item.content);

    s.intel[idx] = {
      ...s.intel[idx],
      frontmatter: {
        ...s.intel[idx].frontmatter,
        title: item.title,
        type: item.type,
        visibility: item.visibility,
        sensitivity: item.sensitivity,
        reliability: item.reliability,
        confidence: item.confidence,
        tags: item.tags,
        categories: item.categories,
        latitude: item.latitude,
        longitude: item.longitude,
        verified: item.verified,
        version: (s.intel[idx].frontmatter.version || 1) + (changes.length ? 1 : 0),
        history: [ ...(s.intel[idx].frontmatter.history || []), { timestamp: now.toISOString(), action: 'UPDATED' as const, changes: changes.length? changes: undefined }],
        // Provenance/quality + event-dating fields — additive, not part of
        // the change-tracking above since they're new/optional rather than
        // part of the original field set every item always had.
        processingLineage: item.processingLineage,
        confidenceMetrics: item.confidenceMetrics,
        osintMetadata: item.osintMetadata,
        eventDate: item.eventDate,
        eventEndDate: item.eventEndDate,
        isEstimated: item.isEstimated,
        importance: item.importance,
        relatedIds: item.relatedIds,
        entityRefs: item.entityRefs
      },
      content: item.content,
      modifiedAt: now.toISOString()
    };
    this.saveState();
    this.notify();
  }

  // RELATIONSHIP OPERATIONS -------------------------------------------------
  getRelationships(): IntelRelationshipUI[] { return this.getState().relationships!.slice(); }

  getRelationship(id: string): IntelRelationshipUI | null {
    return this.getState().relationships!.find(r => r.id === id) ?? null;
  }

  addRelationship(input: CreateIntelRelationshipInput): IntelRelationshipUI {
    const now = new Date().toISOString();
    /*
     * The same rule as addCase: a caller that knows the author says so, and then no
     * identity is touched. Dev sample data seeds a scenario's relationships on load, and
     * without this every fresh dev profile got a signing key and a notice about it.
     */
    const author = input.createdBy ?? this.currentActorId();
    const relationship: IntelRelationshipUI = {
      id: `intelrel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: input.type,
      sourceId: input.sourceId,
      targetId: input.targetId,
      confidence: input.confidence ?? 50,
      strength: input.strength,
      direction: input.direction,
      timeframe: input.timeframe,
      createdAt: now,
      updatedAt: now,
      createdBy: author,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {}
    };
    const s = this.getState();
    s.relationships!.push(relationship);
    this.saveState();
    this.notify();
    return relationship;
  }

  updateRelationship(relationship: IntelRelationshipUI): void {
    const s = this.getState();
    const idx = s.relationships!.findIndex(r => r.id === relationship.id);
    if (idx === -1) return;
    s.relationships![idx] = { ...relationship, updatedAt: new Date().toISOString() };
    this.saveState();
    this.notify();
  }

  removeRelationship(id: string): void {
    const s = this.getState();
    const idx = s.relationships!.findIndex(r => r.id === id);
    if (idx === -1) return;
    s.relationships!.splice(idx, 1);
    this.saveState();
    this.notify();
  }

  /** Relationships where this entity is either the source or the target. */
  getRelationshipsForEntity(entityId: string): IntelRelationshipUI[] {
    return this.getState().relationships!.filter(r => r.sourceId === entityId || r.targetId === entityId);
  }

  // CASE OPERATIONS -----------------------------------------------------------
  getCases(): IntelCaseUI[] { return this.getState().cases!.slice(); }

  getCase(id: string): IntelCaseUI | null {
    return this.getState().cases!.find(c => c.id === id) ?? null;
  }

  async addCase(input: CreateIntelCaseInput): Promise<IntelCaseUI> {
    const now = new Date().toISOString();
    /*
     * An import that knows its author says so, and then no identity is touched. Only a
     * case with no stated author is taken to be the current person's own work, which
     * ensures their signer (currentAuthor). The Cases screen
     * migrates legacy investigations on every mount; without this, opening that screen
     * created a key for anyone who had old investigations and had never signed a thing.
     */
    const author = input.createdBy ?? await this.currentAuthor('creating a case');
    const id = `intelcase-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record: IntelCaseUI = {
      id,
      ...(input.sample ? { sample: true } : {}),
      caseNumber: input.caseNumber || recordNumber('CASE', id, new Date(now)),
      title: input.title,
      description: input.description,
      status: input.status ?? CaseStatus.NEW,
      priority: input.priority ?? CasePriority.MEDIUM,
      visibility: input.visibility,
      ...(input.limitedTo?.length ? { limitedTo: input.limitedTo } : {}),
      sensitivity: input.sensitivity,
      assignedTo: input.assignedTo ?? [],
      startDate: input.startDate ?? now,
      relatedEntities: input.relatedEntities ?? [],
      relatedCases: [],
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      createdBy: author,
      collaborators: [],
      comments: [],
      activityLog: [{
        id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        action: CaseActivityAction.CREATED,
        timestamp: now,
        userId: author,
        details: {}
      }],
      permissions: { isPublic: false }
    };
    if (input.dueDate) record.dueDate = input.dueDate;
    if (input.closedDate) record.closedDate = input.closedDate;
    const stored: IntelCaseUI = {
      ...record,
      description: await encryptFieldIfProtected(record.id, record.description, record)
    };
    const s = this.getState();
    s.cases!.push(stored);
    this.saveState();
    this.notify();
    return record; // plaintext — the caller just authored this description themselves
  }

  /** Full-record replace — callers (the case adapter) read-modify-write via getCase()/updateCase() for finer-grained mutations like adding a comment. */
  async updateCase(record: IntelCaseUI): Promise<void> {
    const s = this.getState();
    const idx = s.cases!.findIndex(c => c.id === record.id);
    if (idx === -1) return;
    const stored: IntelCaseUI = {
      ...record,
      description: await encryptFieldIfProtected(record.id, record.description, record),
      updatedAt: new Date().toISOString()
    };
    s.cases![idx] = stored;
    this.saveState();
    this.notify();
  }

  /** Removes and logs a case; its key stays until finalizeDeletion (plan item 0.6). */
  removeCase(id: string): DeletionEntry | null {
    return this.removeAndLog('case', id, (c: IntelCaseUI) => c.title);
  }

  /**
   * Decrypt a CONFIDENTIAL+ case's description on demand — same
   * decrypted-on-demand contract as decryptReportContent.
   */
  async decryptCaseDescription(id: string): Promise<string | null> {
    const record = this.getState().cases!.find(c => c.id === id);
    if (!record) return null;
    return decryptFieldIfEncrypted(id, record.description);
  }

  // BUNDLES (plan item 2.4) ----------------------------------------------------

  /** An intel item as stored, for a bundle to carry whole. */
  getStoredIntelItem(id: string): Record<string, unknown> | null {
    const item = this.getState().intel.find((i) => i.id === id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  /**
   * A record as a bundle carried it: added, or put in place of the copy held.
   *
   * Its id and timestamps are kept. Links between records hold only if ids
   * do, and "newer" is judged by what the sender's copy said, so a record
   * imported and then edited here is newer than the copy it came from. The
   * calls that make or save a record cannot do this: they mint an id, or
   * stamp the time. Protected fields are encrypted at rest here, as saving
   * does, since a bundle carries them readable.
   */
  async putFromBundle(type: 'case' | 'mission' | 'report' | 'item', record: Record<string, unknown>): Promise<void> {
    const s = this.getState();
    const put = <T extends { id: string }>(list: T[], stored: T) => {
      const idx = list.findIndex((r) => r.id === stored.id);
      if (idx === -1) list.push(stored);
      else list[idx] = stored;
    };
    if (type === 'case') {
      const c = record as unknown as IntelCaseUI;
      put(s.cases!, { ...c, description: await encryptFieldIfProtected(c.id, c.description, c) });
    } else if (type === 'mission') {
      const m = record as unknown as MissionUI;
      put(s.missions!, { ...m, briefing: await encryptFieldIfProtected(m.id, m.briefing, m) });
    } else if (type === 'report') {
      const r = record as unknown as IntelReportData;
      put(s.reports, { ...r, content: await encryptFieldIfProtected(r.id, r.content, handlingFromMetadata(r.metadata)) });
    } else {
      put(s.intel, record as unknown as IntelItemInternal);
    }
    this.saveState();
    this.notify();
  }

  // MISSION OPERATIONS ---------------------------------------------------------
  getMissions(): MissionUI[] { return this.getState().missions!.slice(); }

  getMission(id: string): MissionUI | null {
    return this.getState().missions!.find(m => m.id === id) ?? null;
  }

  async addMission(input: CreateMissionInput): Promise<MissionUI> {
    const now = new Date().toISOString();
    const author = await this.currentAuthor('creating a mission');
    const id = `mission-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record: MissionUI = {
      id,
      ...(input.sample ? { sample: true } : {}),
      missionNumber: input.missionNumber || recordNumber('MSN', id, new Date(now)),
      title: input.title,
      briefing: input.briefing,
      status: MissionStatus.DRAFT,
      visibility: input.visibility,
      ...(input.limitedTo?.length ? { limitedTo: input.limitedTo } : {}),
      sensitivity: input.sensitivity,
      objectives: (input.objectives ?? []).map(description => ({
        id: `objective-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        description,
        completed: false
      })),
      assignedTo: input.assignedTo ?? [],
      startDate: input.startDate ?? now,
      relatedReports: input.relatedReports ?? [],
      relatedCases: input.relatedCases ?? [],
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      createdBy: author,
      collaborators: [],
      comments: [],
      activityLog: [{
        id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        action: MissionActivityAction.CREATED,
        timestamp: now,
        userId: author,
        details: {}
      }],
      permissions: { isPublic: false }
    };
    if (input.dueDate) record.dueDate = input.dueDate;
    // Cycle 3 hardening: a mission's briefing is just as sensitive as a
    // Report's content or a Case's description — both of those were encrypted
    // at rest (Cycle 7), but Missions were never wired in, so an equally
    // sensitive briefing sat in plaintext. Same encryptFieldIfProtected used
    // for reports/cases, keyed the same way (by record id).
    const stored: MissionUI = {
      ...record,
      briefing: await encryptFieldIfProtected(record.id, record.briefing, record)
    };
    const s = this.getState();
    s.missions!.push(stored);
    this.saveState();
    this.notify();
    return record; // plaintext — the caller just authored this briefing themselves
  }

  /** Full-record replace — same read-modify-write convention as updateCase(). */
  async updateMission(record: MissionUI): Promise<void> {
    const s = this.getState();
    const idx = s.missions!.findIndex(m => m.id === record.id);
    if (idx === -1) return;
    const stored: MissionUI = {
      ...record,
      briefing: await encryptFieldIfProtected(record.id, record.briefing, record),
      updatedAt: new Date().toISOString()
    };
    s.missions![idx] = stored;
    this.saveState();
    this.notify();
  }

  /** Removes and logs a mission; its key stays until finalizeDeletion (plan item 0.6). */
  removeMission(id: string): DeletionEntry | null {
    return this.removeAndLog('mission', id, (m: MissionUI) => m.title);
  }

  /** Decrypt a CONFIDENTIAL+ mission's briefing on demand — same contract as decryptReportContent/decryptCaseDescription. */
  async decryptMissionBriefing(id: string): Promise<string | null> {
    const record = this.getState().missions!.find(m => m.id === id);
    if (!record) return null;
    return decryptFieldIfEncrypted(id, record.briefing);
  }

  private internalIntelToUI(internal: IntelItemInternal): IntelItemUI {
    return {
      id: internal.id,
      title: internal.frontmatter.title,
      type: internal.frontmatter.type,
      source: internal.frontmatter.source,
      reliability: internal.frontmatter.reliability as any,
      confidence: internal.frontmatter.confidence,
      tags: internal.frontmatter.tags,
      categories: internal.frontmatter.categories,
      latitude: internal.frontmatter.latitude,
      longitude: internal.frontmatter.longitude,
      content: internal.content,
      createdAt: new Date(internal.createdAt),
      updatedAt: new Date(internal.modifiedAt),
      ...(typeof internal.frontmatter.collectedAt === 'string' ? { collectedAt: internal.frontmatter.collectedAt } : {}),
      verified: internal.frontmatter.verified,
      version: internal.frontmatter.version,
      history: internal.frontmatter.history as any,
      processingLineage: internal.frontmatter.processingLineage,
      confidenceMetrics: internal.frontmatter.confidenceMetrics,
      osintMetadata: internal.frontmatter.osintMetadata,
      eventDate: internal.frontmatter.eventDate,
      eventEndDate: internal.frontmatter.eventEndDate,
      isEstimated: internal.frontmatter.isEstimated,
      importance: internal.frontmatter.importance,
      relatedIds: internal.frontmatter.relatedIds,
      entityRefs: internal.frontmatter.entityRefs,
      visibility: internal.frontmatter.visibility,
      sensitivity: internal.frontmatter.sensitivity,
      // Who sent it: the store kept it and this dropped it, so a peer's item read as made here (BD19).
      ...(internal.receivedFrom ? { receivedFrom: internal.receivedFrom } : {})
    };
  }
}

export const intelWorkspaceManager = new IntelWorkspaceManager();
