/**
 * One publisher across its keys (decision D-HW). Mecha Jono's key changes in early November 2026, and
 * they send the new key before anything is signed with it. Its notes are replaceable events, whose
 * address is `kind:pubkey:d`, so the same note signed under the old key and again under the new one
 * has two addresses. Read as one publisher, it is one note: each store keeps the newest version under
 * the note's identity here, and an address keeps its real key wherever it is shown or linked.
 */
import { EXPOSED_KEYS, KEY_STARTS, MECHA_JONO_KEYS } from '../../config/publicInfrastructure';

export interface RotatingPublisher {
  name: string;
  /** Its keys, newest first. */
  keys: readonly string[];
}

/** The publishers whose keys rotate, each with every key it signs with. */
export const ROTATING_PUBLISHERS: readonly RotatingPublisher[] = [{ name: 'mecha-jono', keys: MECHA_JONO_KEYS }];

/** Who signed with this key: a rotating publisher's name, or the key itself. */
export function signerIdentity(pubkey: string, publishers: readonly RotatingPublisher[] = ROTATING_PUBLISHERS): string {
  const key = pubkey.toLowerCase();
  return publishers.find((p) => p.keys.some((k) => k.toLowerCase() === key))?.name ?? key;
}

/** An address's identity across its publisher's keys: `kind:<who>:d`. Anything else is returned as it is. */
export function noteIdentity(address: string, publishers: readonly RotatingPublisher[] = ROTATING_PUBLISHERS): string {
  const m = /^(\d+):([0-9a-fA-F]{64}):(.*)$/.exec(address);
  return m ? `${m[1]}:${signerIdentity(m[2], publishers)}:${m[3]}` : address;
}

/** Whether two addresses are one note, under either of its publisher's keys. */
export const sameNote = (a: string, b: string, publishers: readonly RotatingPublisher[] = ROTATING_PUBLISHERS): boolean =>
  noteIdentity(a, publishers) === noteIdentity(b, publishers);

/** The day this key's secret went out (YYYY-MM-DD), or null for a key not known to be exposed. */
export const exposedSince = (pubkey: string, exposed: Readonly<Record<string, string>> = EXPOSED_KEYS): string | null =>
  exposed[pubkey.toLowerCase()] ?? null;

/** What is known of keys: who rotates, when each began, and which are exposed. Tests give their own. */
export interface KeyRecords {
  publishers?: readonly RotatingPublisher[];
  starts?: Readonly<Record<string, string>>;
  exposed?: Readonly<Record<string, string>>;
}

const publisherOf = (pubkey: string, publishers: readonly RotatingPublisher[]) =>
  publishers.find((p) => p.keys.some((k) => k.toLowerCase() === pubkey.toLowerCase()));

/** When a key began to speak for its publisher, in unix seconds; NaN when nobody has said. */
export function startOf(pubkey: string, starts: Readonly<Record<string, string>> = KEY_STARTS): number {
  const at = Date.parse(starts[pubkey.toLowerCase()] ?? '');
  return Number.isFinite(at) ? Math.floor(at / 1000) : NaN;
}

/**
 * Whether a key speaks for its publisher at `at` (unix seconds), as NavCom's `speaks` asks (trust.ts): never once
 * exposed; and a rotating publisher's key only from its start. Anyone else's key speaks for itself.
 */
export function speaksFor(pubkey: string, at: number, records: KeyRecords = {}): boolean {
  const { publishers = ROTATING_PUBLISHERS, starts = KEY_STARTS, exposed = EXPOSED_KEYS } = records;
  if (exposedSince(pubkey, exposed)) return false;
  if (!publisherOf(pubkey, publishers)) return true;
  return startOf(pubkey, starts) <= at;
}

/** The key to seal to, or null when nothing goes; then `exposedOn`, the day its key's secret went out, if that is why. */
export interface SealTarget { key: string | null; exposedOn: string | null }

/**
 * Where something sealed on work `poster` posted goes at `at`, as NavCom's `sealTargetOf`: its publisher's newest key
 * that speaks, which need not be the key that posted it, since the work on an old key's mission is told to the
 * publisher under its new one. With none, nothing goes.
 */
export function sealTargetOf(poster: string, at: number, records: KeyRecords = {}): SealTarget {
  const { publishers = ROTATING_PUBLISHERS, exposed = EXPOSED_KEYS } = records;
  const keys = (publisherOf(poster, publishers)?.keys ?? [poster]).map((k) => k.toLowerCase());
  const speaking = keys.find((k) => speaksFor(k, at, records));
  if (speaking) return { key: speaking, exposedOn: null };
  return { key: null, exposedOn: keys.map((k) => exposedSince(k, exposed)).find(Boolean) ?? null };
}

/**
 * Whether nothing a key signed is read any more at `at` (decision MX31): its secret is out, and a newer key of its
 * publisher speaks. From the day Mecha Jono's next key starts, nothing under its exposed key is read, since whoever
 * holds that secret could post a fake alert or mission under its name. Until then it is read: Mecha Jono signs with
 * nothing else.
 */
export function retiredKey(pubkey: string, at: number, records: KeyRecords = {}): boolean {
  const { publishers = ROTATING_PUBLISHERS, exposed = EXPOSED_KEYS } = records;
  // An exposed key never speaks itself, so any key of its publisher that speaks is a newer one.
  if (!exposedSince(pubkey, exposed)) return false;
  return publisherOf(pubkey, publishers)?.keys.some((k) => speaksFor(k, at, records)) ?? false;
}

