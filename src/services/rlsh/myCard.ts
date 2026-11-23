/**
 * The person's own RLSH card on this device (D-RF): the draft they are writing, and what became of it, published
 * (when, to how many relays, how it can be found) or withdrawn. Kept in this browser only; the card itself is on the
 * relays, signed by the contact key (contactKey.ts).
 */
import { DOES_MAX, FINDINGS, type Finding, type RlshCardDraft } from './rlshCard';

export interface MyCardState {
  draft: RlshCardDraft;
  /** The card as last published, and where it went. */
  published: { at: string; relays: number; finding: Finding; eventId: string } | null;
  /** When it was last withdrawn, while not published again since. */
  withdrawnAt: string | null;
}

const KEY = 'starcom:rlsh-my-card';
const listeners = new Set<() => void>();

export const EMPTY_DRAFT: RlshCardDraft = { callsign: '', doing: '', zone: null, does: [], finding: 'starcom' };

const isDraft = (d: unknown): d is RlshCardDraft => {
  const x = d as RlshCardDraft;
  return !!x && typeof x.callsign === 'string' && typeof x.doing === 'string'
    && (x.zone === null || (typeof x.zone?.id === 'string' && typeof x.zone?.name === 'string'))
    && Array.isArray(x.does) && x.does.every((t) => typeof t === 'string') && FINDINGS.includes(x.finding);
};

function load(): MyCardState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as MyCardState | null;
    if (raw && isDraft(raw.draft)) {
      return { draft: { ...raw.draft, does: raw.draft.does.slice(0, DOES_MAX) }, published: raw.published ?? null, withdrawnAt: raw.withdrawnAt ?? null };
    }
  } catch { /* none */ }
  return { draft: EMPTY_DRAFT, published: null, withdrawnAt: null };
}

let state: MyCardState = typeof localStorage !== 'undefined' ? load() : { draft: EMPTY_DRAFT, published: null, withdrawnAt: null };

function persist(next: MyCardState): void {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kept for this visit */ }
  listeners.forEach((l) => l());
}

/** The same object until it changes. */
export const myCard = (): MyCardState => state;

export const setDraft = (draft: RlshCardDraft): void => persist({ ...state, draft });

export const recordPublished = (at: number, relays: number, finding: Finding, eventId: string): void =>
  persist({ ...state, published: { at: new Date(at).toISOString(), relays, finding, eventId }, withdrawnAt: null });

export const recordWithdrawn = (at: number): void =>
  persist({ ...state, published: null, withdrawnAt: new Date(at).toISOString() });

export function subscribeMyCard(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test seam: read the device again. */
export function reloadMyCard(): void {
  state = load();
  listeners.forEach((l) => l());
}
