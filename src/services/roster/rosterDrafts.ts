/**
 * The roster on the device first (decision D-RS, RS13): every item a person makes is kept in this browser until
 * they post it, privately to invitees, to a team, or publicly (RS14), and keeps where it went once posted.
 * Nothing leaves the device by itself.
 *
 * Saved only as the spec would read it (rosterItem.ts): a draft is checked by writing it as its event and reading
 * that back, so one that saved can always be posted.
 */
import { readRosterEvent, rosterTemplate, ROSTER_KINDS, type RosterItem, type RosterKind } from './rosterItem';

const KEY = 'starcom.roster.drafts.v1';

export interface RosterPost {
  visibility: 'public' | 'sealed' | 'team';
  at: string;
  /** How many relays took it. */
  relays: number;
  /** For a sealed post, how many people it was sealed to. */
  to?: number;
}

export interface RosterDraft extends RosterItem {
  updatedAt: string;
  posts: RosterPost[];
}

type Listener = () => void;
const listeners = new Set<Listener>();
let drafts: RosterDraft[] = load();
// One sorted list, replaced when it changes: a React store handing out a new array a read re-renders forever.
let snapshot: RosterDraft[] = [];

/** Anything in storage not as the spec would read it is left out, never shown half-read. */
function load(): RosterDraft[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((d): d is RosterDraft => typeof d === 'object' && d !== null
      && typeof (d as RosterDraft).updatedAt === 'string' && Array.isArray((d as RosterDraft).posts)
      && checked(d as RosterItem) === null);
  } catch {
    return [];
  }
}

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(drafts)); } catch { /* storage full or refused: kept for this visit */ }
  snapshot = sorted(drafts);
  for (const listener of listeners) listener();
}

/** Why the spec would refuse this item, or null. */
function checked(item: RosterItem): string | null {
  try {
    const read = readRosterEvent({ ...rosterTemplate(item), pubkey: '0'.repeat(64), created_at: 0 });
    return 'reason' in read ? read.reason : null;
  } catch {
    return 'not a roster item';
  }
}

function sorted(list: RosterDraft[]): RosterDraft[] {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
snapshot = sorted(drafts);

/** Newest first. The same list until it changes. */
export function listDrafts(): RosterDraft[] {
  return snapshot;
}

export function getDraft(d: string): RosterDraft | null {
  return drafts.find((x) => x.d === d) ?? null;
}

/** Keep an item, new or edited in place, saying why not when the spec would refuse it. */
export function saveDraft(item: RosterItem, now: number = Date.now()): { ok: true } | { ok: false; reason: string } {
  const why = checked({ ...item, title: item.title.trim() });
  if (why) return { ok: false, reason: why };
  const prior = getDraft(item.d);
  const next: RosterDraft = { ...item, title: item.title.trim(), updatedAt: new Date(now).toISOString(), posts: prior?.posts ?? [] };
  drafts = [...drafts.filter((x) => x.d !== item.d), next];
  persist();
  return { ok: true };
}

/** Where an item went, kept with it. */
export function recordPost(d: string, post: RosterPost): void {
  const prior = getDraft(d);
  if (!prior) return;
  drafts = drafts.map((x) => (x.d === d ? { ...x, posts: [...x.posts, post] } : x));
  persist();
}

export function removeDraft(d: string): void {
  if (!getDraft(d)) return;
  drafts = drafts.filter((x) => x.d !== d);
  persist();
}

export function subscribeDrafts(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** A new item's address: its kind and twelve random hex digits, unique among its author's. */
export function newRosterId(kind: RosterKind): string {
  if (!(ROSTER_KINDS as readonly string[]).includes(kind)) throw new Error(`Not a roster kind: ${kind}`);
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `${kind}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
