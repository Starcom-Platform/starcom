/**
 * Starcom taking what waits in Uplink (decision D-EX, E2, W5; EX16). Each capture is kept once, as an
 * intel item; it goes to the case open in the side panel when there is one, else it waits to be filed;
 * and Uplink is told to let go of what was read only once it is kept, so a failure loses nothing.
 *
 * A tab and the side panel are two Starcom pages that can hear the same notice at once. They take one
 * at a time (the browser's lock, shared by every Starcom page in it), and the captures already taken
 * are remembered, so a capture is never kept twice, even if a page closed between keeping it and
 * Uplink letting it go.
 */
import type { ArgsOf, Capability, Capture, UplinkAnswer } from './protocol';
import { uplinkPurpose } from './purposes';


export interface TakenMemory {
  has(id: string): boolean;
  add(id: string): void;
}

export interface CaptureTaking {
  ask<C extends Capability>(capability: C, purpose: string, args: ArgsOf[C]): Promise<UplinkAnswer<C>>;
  /** Keeps a capture; its item's id. */
  keep(capture: Capture): Promise<string>;
  /** Files items to a case; false when the case cannot take them. */
  fileTo(caseId: string, itemIds: string[]): Promise<boolean>;
  /** The case open in the side panel, if one is. */
  openCaseId(): string | null;
  taken: TakenMemory;
  /** One taking at a time, across every Starcom page in this browser. */
  oneAtATime<T>(work: () => Promise<T>): Promise<T>;
}

export interface Taken {
  kept: number;
  filedTo: string | null;
  refusal?: string;
}

export function takeCaptures(t: CaptureTaking): Promise<Taken> {
  return t.oneAtATime(async () => {
    const read = await t.ask('captures.read', uplinkPurpose('take').said, {});
    if (read.ok === false) return { kept: 0, filedTo: null, refusal: read.reason };
    const { captures } = read.result;
    if (!captures.length) return { kept: 0, filedTo: null };
    const itemIds: string[] = [];
    for (const capture of captures) {
      if (t.taken.has(capture.id)) continue;
      itemIds.push(await t.keep(capture));
      t.taken.add(capture.id);
    }
    const openCase = itemIds.length ? t.openCaseId() : null;
    const filedTo = openCase && (await t.fileTo(openCase, itemIds).catch(() => false)) ? openCase : null;
    await t.ask('captures.kept', uplinkPurpose('take').said, { ids: captures.map((c) => c.id) });
    return { kept: itemIds.length, filedTo };
  });
}

/** How many taken captures are remembered: far more than ever wait at once. */
const REMEMBERED = 1000;
const TAKEN_KEY = 'starcom-uplink-taken';

/** The captures already taken, kept in this browser's storage; in memory alone when that cannot be read. */
export function takenMemory(store: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): TakenMemory {
  let ids: string[] = [];
  try {
    const parsed: unknown = JSON.parse(store?.getItem(TAKEN_KEY) ?? '[]');
    if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === 'string');
  } catch { /* unreadable: start empty */ }
  const known = new Set(ids);
  return {
    has: (id) => known.has(id),
    add(id) {
      if (known.has(id)) return;
      known.add(id);
      ids.push(id);
      if (ids.length > REMEMBERED) known.delete(ids.shift()!);
      try { store?.setItem(TAKEN_KEY, JSON.stringify(ids)); } catch { /* full or blocked: remembered for this page */ }
    },
  };
}

let tail: Promise<unknown> = Promise.resolve();
/** The browser's lock where it has one, shared by every Starcom page; else one at a time in this page. */
export function oneTakingAtATime<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks) return locks.request('starcom-uplink-captures', work);
  const run = tail.then(work);
  tail = run.catch(() => undefined);
  return run;
}
