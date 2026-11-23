/**
 * Tasks together (decision D-RS, RS15; the owner's RS55–RS57, 2026-10-18). When a team works a mission together,
 * each step is taken, released, done and checked by a NIP-32 label in `starcom.step`, signed and posted to the
 * team's own relay only, so only its members see who took what (RS55). Alone, or from a public mission, steps stay
 * one's own checklist and nothing is posted.
 *
 * A take holds for 24 hours at most, or until its taker releases it (RS57, as NavCom's claims expire: walking away
 * costs nothing); while one member holds a step no other takes it; the first done stands; and a check counts only
 * from someone other than the one who did it, naming that done (RS56).
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { PROTOCOL_KINDS } from '../nostr/kindRegistry';
import { createRelayPool } from '../nostr/relayPool';

export const STEP_LABEL_KIND = PROTOCOL_KINDS.NIP32_LABEL;
export const STEP_NAMESPACE = 'starcom.step';
/** How long a take holds: 24 hours (RS57). */
export const STEP_HOLD_S = 24 * 60 * 60;
/** The longest note a check carries. */
const NOTE_MAX = 500;

const VALUES = ['taken', 'released', 'done', 'checked'] as const;
export type StepLabelValue = (typeof VALUES)[number];

export interface StepLabel {
  id: string;
  pubkey: string;
  value: StepLabelValue;
  /** The mission package, `30079:<signer>:<d>`. */
  coordinate: string;
  /** The step's id, as the package names it. */
  step: string;
  createdAt: number;
  /** A take's NIP-40 expiry, unix seconds. */
  expiresAt?: number;
  /** Whose done a check checks. */
  doer?: string;
  /** What a check says it checked. */
  note?: string;
}

const HEX_KEY = /^[0-9a-f]{64}$/;
const PACKAGE = /^30079:[0-9a-f]{64}:\S{1,200}$/;
const STEP_ID = /^\S{1,100}$/;

/** The unsigned label: a take expires in 24 hours; a check names whose done it checks, its note the content. */
export function stepLabelTemplate(input: {
  value: StepLabelValue;
  coordinate: string;
  step: string;
  doer?: string;
  note?: string;
  nowS: number;
}): { kind: number; tags: string[][]; content: string } {
  const tags = [['L', STEP_NAMESPACE], ['l', input.value, STEP_NAMESPACE], ['a', input.coordinate], ['step', input.step]];
  if (input.value === 'taken') tags.push(['expiration', String(input.nowS + STEP_HOLD_S)]);
  if (input.value === 'checked' && input.doer) tags.push(['p', input.doer]);
  return { kind: STEP_LABEL_KIND, tags, content: input.value === 'checked' ? (input.note ?? '').slice(0, NOTE_MAX) : '' };
}

const first = (event: Pick<Event, 'tags'>, name: string) => event.tags.find((t) => t[0] === name)?.[1];

/** A label in `starcom.step`, read; null for anything else, and for a take already expired. */
export function readStepLabel(event: Pick<Event, 'id' | 'pubkey' | 'kind' | 'created_at' | 'tags' | 'content'>, nowS: number): StepLabel | null {
  if (event.kind !== STEP_LABEL_KIND || !HEX_KEY.test(event.pubkey)) return null;
  if (!event.tags.some((t) => t[0] === 'L' && t[1] === STEP_NAMESPACE)) return null;
  const values = event.tags.filter((t) => t[0] === 'l' && t[2] === STEP_NAMESPACE).map((t) => t[1]);
  // One label each: two would say two things at once.
  if (values.length !== 1 || !(VALUES as readonly string[]).includes(values[0])) return null;
  const value = values[0] as StepLabelValue;
  const coordinate = first(event, 'a') ?? '';
  const step = first(event, 'step') ?? '';
  if (!PACKAGE.test(coordinate) || !STEP_ID.test(step)) return null;
  const expiration = Number(first(event, 'expiration'));
  const expiresAt = Number.isFinite(expiration) && expiration > 0 ? expiration : undefined;
  if (expiresAt !== undefined && expiresAt <= nowS) return null;
  const doer = first(event, 'p');
  if (value === 'checked' && !(doer && HEX_KEY.test(doer))) return null;
  const note = value === 'checked' && event.content.trim() ? event.content.trim().slice(0, NOTE_MAX) : undefined;
  return {
    id: event.id, pubkey: event.pubkey, value, coordinate, step, createdAt: event.created_at,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(value === 'checked' ? { doer } : {}),
    ...(note ? { note } : {}),
  };
}

export type StepState =
  | { state: 'open' }
  | { state: 'taken'; by: string; until: number }
  | { state: 'done'; by: string; at: number }
  | { state: 'checked'; by: string; at: number; checkedBy: string; note?: string };

/** Until when a take holds: its stated expiry, never past 24 hours. */
const holdOf = (l: StepLabel) => Math.min(l.expiresAt ?? l.createdAt + STEP_HOLD_S, l.createdAt + STEP_HOLD_S);

/** Where each step stands, from its labels, read in the order they were signed. */
export function stepBoard(labels: readonly StepLabel[], steps: readonly string[], nowS: number): Record<string, StepState> {
  const ordered = [...labels].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const board: Record<string, StepState> = {};
  for (const step of steps) {
    let at: StepState = { state: 'open' };
    for (const l of ordered) {
      if (l.step !== step) continue;
      // A take whose hold has run out by the time of this label has freed the step.
      if (at.state === 'taken' && at.until <= l.createdAt) at = { state: 'open' };
      if (l.value === 'taken') {
        if (at.state === 'open' || (at.state === 'taken' && at.by === l.pubkey)) at = { state: 'taken', by: l.pubkey, until: holdOf(l) };
      } else if (l.value === 'released') {
        if (at.state === 'taken' && at.by === l.pubkey) at = { state: 'open' };
      } else if (l.value === 'done') {
        if (at.state === 'open' || (at.state === 'taken' && at.by === l.pubkey)) at = { state: 'done', by: l.pubkey, at: l.createdAt };
      } else if (at.state === 'done' && l.doer === at.by && l.pubkey !== at.by) {
        at = { state: 'checked', by: at.by, at: at.at, checkedBy: l.pubkey, ...(l.note ? { note: l.note } : {}) };
      }
    }
    if (at.state === 'taken' && at.until <= nowS) at = { state: 'open' };
    board[step] = at;
  }
  return board;
}

/** A mission a team is working on, from its members' step labels: how many of them, and when the last was signed. */
export interface TeamMission {
  coordinate: string;
  members: number;
  lastAt: number;
}

/** The missions a team's step labels name, the most recently worked first. */
export function teamMissionsOf(labels: readonly StepLabel[]): TeamMission[] {
  const by = new Map<string, { members: Set<string>; lastAt: number }>();
  for (const l of labels) {
    const at = by.get(l.coordinate) ?? { members: new Set<string>(), lastAt: 0 };
    at.members.add(l.pubkey);
    at.lastAt = Math.max(at.lastAt, l.createdAt);
    by.set(l.coordinate, at);
  }
  return [...by].map(([coordinate, at]) => ({ coordinate, members: at.members.size, lastAt: at.lastAt }))
    .sort((a, b) => b.lastAt - a.lastAt || a.coordinate.localeCompare(b.coordinate));
}

/**
 * Reads a mission's step labels from a team's relay until the returned function is called, or every mission's when
 * `coordinate` is null, telling `onLabels` the whole list each time it grows, and `onRead` once the relay has sent
 * what it holds; it stays open for what comes after. The pool signs in to a relay the person has joined (NIP-42).
 */
export function watchStepLabels(
  relay: string,
  coordinate: string | null,
  handlers: { onLabels: (labels: StepLabel[]) => void; onRead?: () => void },
  pool: Pick<SimplePool, 'subscribeMany'> = createRelayPool(),
  now: () => number = () => Math.floor(Date.now() / 1000),
): () => void {
  const seen = new Map<string, StepLabel>();
  const filter: Filter = { kinds: [STEP_LABEL_KIND], '#L': [STEP_NAMESPACE], ...(coordinate ? { '#a': [coordinate] } : {}) };
  const sub = pool.subscribeMany([relay], filter, {
    onevent: (event: Event) => {
      const read = readStepLabel(event, now());
      if (!read || (coordinate !== null && read.coordinate !== coordinate) || seen.has(read.id)) return;
      seen.set(read.id, read);
      handlers.onLabels([...seen.values()]);
    },
    oneose: () => handlers.onRead?.(),
  });
  return () => sub.close();
}
