/**
 * When this browser mints a signing identity, the person is told.
 *
 * ─── WHAT WAS HAPPENING INSTEAD ────────────────────────────────────────────
 *
 * nostrService generated a secp256k1 secret key in its constructor — which runs on
 * module load — and wrote it to localStorage in plain text. So opening the app
 * created a cryptographic identity nobody asked for, nobody was told about, that
 * could sign as them, that they could not export, and that any XSS on the origin
 * could read. It was also the identity chat signs with, so it had already been
 * published to public relays before its owner knew it existed.
 *
 * A key is now minted only when something actually needs a signature, and that
 * moment is recorded here so a surface can say so. The record persists, because a
 * notice shown to nobody (minted in a background task, or during a reload) is not a
 * notice; it stays until the person acknowledges it.
 *
 * This holds no key material. It holds the fact that a key exists, when it was
 * made, and what asked for it.
 */

const STORAGE_KEY = 'nostr_identity_notice_v1';

export interface IdentityNotice {
  /** ISO timestamp of the moment the key was created. */
  createdAt: string;
  /** What needed a signature — "sending a chat message", "publishing a report". */
  reason: string;
  /** True once the person has seen and dismissed the notice. */
  acknowledged: boolean;
  /** True when the key came from an import rather than being minted here. */
  imported?: boolean;
  /**
   * When the person last had the secret key in front of them to keep: shown or
   * copied. The nearest this browser can come to knowing it was backed up.
   */
  backedUpAt?: string;
}

type Listener = (notice: IdentityNotice | null) => void;
const listeners = new Set<Listener>();

const read = (): IdentityNotice | null => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IdentityNotice;
    return typeof parsed?.createdAt === 'string' ? parsed : null;
  } catch {
    // Unreadable storage is not an identity notice; say nothing rather than guess.
    return null;
  }
};

const write = (notice: IdentityNotice | null): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (notice) localStorage.setItem(STORAGE_KEY, JSON.stringify(notice));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable — the in-memory notify below still fires */ }
};

const notify = (notice: IdentityNotice | null): void => {
  for (const listener of listeners) listener(notice);
};

/** Record that a key was created, and why. Called by nostrService, once per key. */
export function recordIdentityCreated(reason: string, options: { imported?: boolean; at?: Date } = {}): void {
  const notice: IdentityNotice = {
    createdAt: (options.at ?? new Date()).toISOString(),
    reason,
    acknowledged: false,
    ...(options.imported ? { imported: true } : {}),
  };
  write(notice);
  notify(notice);
}

/** The notice a surface should show, or null when there is nothing to say. */
export function pendingIdentityNotice(): IdentityNotice | null {
  const notice = read();
  return notice && !notice.acknowledged ? notice : null;
}

/** The record itself, acknowledged or not — for a settings surface. */
export function identityRecord(): IdentityNotice | null {
  return read();
}

/** Record that the secret key was shown or copied, so it could be kept. */
export function recordKeyBackedUp(at: Date = new Date()): void {
  const notice = read();
  if (!notice) return;
  write({ ...notice, backedUpAt: at.toISOString() });
}

/**
 * Whether this browser's key may exist nowhere else: minted here, and never
 * shown or copied to be kept. Imported keys came from somewhere, so they are not.
 * With no record at all, the answer is unknown, and unknown is treated as yes.
 */
export function keyMayExistOnlyHere(): boolean {
  const notice = read();
  return !notice || (!notice.imported && !notice.backedUpAt);
}

export function acknowledgeIdentityNotice(): void {
  const notice = read();
  if (!notice || notice.acknowledged) return;
  write({ ...notice, acknowledged: true });
  notify(null);
}

/** Forget the record. Only for when the identity itself is deleted. */
export function clearIdentityNotice(): void {
  write(null);
  notify(null);
}

export function subscribeIdentityNotice(listener: Listener): () => void {
  listeners.add(listener);
  listener(pendingIdentityNotice());
  return () => { listeners.delete(listener); };
}
