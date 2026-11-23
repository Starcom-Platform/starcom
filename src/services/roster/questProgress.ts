/**
 * Quest lines and quests (decision D-RS, RS8, RS9, RS29–RS31). A quest line's `counts` links are its missions in
 * order: each finished one unlocks the next, here, in the line (RS30); the same missions stay open in Missions,
 * since a public mission cannot be hidden from anyone. A quest's are in no order.
 *
 * What is finished is the device's own record (takenMissions.finishedAt, RS29), and so is which quest lines a
 * person has started. Neither is posted (RS31): a Story is how one tells how it went.
 */
import type { RosterItem } from './rosterItem';

export type QuestStepState = 'finished' | 'next' | 'after' | 'open';

export interface QuestStep {
  coordinate: string;
  state: QuestStepState;
  finishedAt?: string;
  /** In a quest line, the one it waits on. */
  after?: string;
}

export const isQuestKind = (kind: RosterItem['kind']): boolean => kind === 'quest_line' || kind === 'quest';

/** Each of its missions, as it stands on this device; a mission linked twice counts once, where it first stands. */
export function questSteps(item: Pick<RosterItem, 'kind' | 'counts'>, finishedAt: (coordinate: string) => string | undefined): QuestStep[] {
  const links = [...new Set(item.counts.map((l) => l.coordinate))];
  const ordered = item.kind === 'quest_line';
  let next: string | null = null;
  return links.map((coordinate, i) => {
    const at = finishedAt(coordinate);
    if (at) return { coordinate, state: 'finished', finishedAt: at };
    if (!ordered) return { coordinate, state: 'open' };
    if (next === null) { next = coordinate; return { coordinate, state: 'next' }; }
    return { coordinate, state: 'after', after: links[i - 1] };
  });
}

/** How many are finished of how many, and which is next. */
export function questTally(steps: readonly QuestStep[]): { finished: number; total: number; next?: string } {
  const next = steps.find((s) => s.state === 'next')?.coordinate;
  return { finished: steps.filter((s) => s.state === 'finished').length, total: steps.length, ...(next ? { next } : {}) };
}

/* ── The quest lines a person has started, kept on this device ─────────── */

const KEY = 'starcom.quests.v1';
const ADDRESS = /^30084:[0-9a-f]{64}:\S{1,200}$/;

export interface StartedQuestLine {
  address: string;
  since: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let list: StartedQuestLine[] = load();
// One list, replaced when it changes, for a React store.
let snapshot: StartedQuestLine[] = [...list];

function load(): StartedQuestLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is StartedQuestLine => typeof s === 'object' && s !== null
      && ADDRESS.test((s as StartedQuestLine).address) && typeof (s as StartedQuestLine).since === 'string');
  } catch {
    return [];
  }
}

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* kept for this visit */ }
  snapshot = [...list];
  for (const listener of listeners) listener();
}

/** In the order started. The same list until it changes. */
export function startedQuestLines(): StartedQuestLine[] {
  return snapshot;
}

export function isStarted(address: string): boolean {
  return list.some((s) => s.address === address);
}

/** Start a quest line; false when the address is not a roster item's. */
export function startQuestLine(address: string, now: number = Date.now()): boolean {
  if (!ADDRESS.test(address)) return false;
  if (isStarted(address)) return true;
  list = [...list, { address, since: new Date(now).toISOString() }];
  persist();
  return true;
}

export function leaveQuestLine(address: string): void {
  if (!isStarted(address)) return;
  list = list.filter((s) => s.address !== address);
  persist();
}

export function subscribeQuests(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
