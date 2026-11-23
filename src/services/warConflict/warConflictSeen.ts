/**
 * Which War & Conflict items are new to this browser (D-GV GV6, W4: "a pulse on a note new since the last visit"):
 * reported after the moment this browser last left the page, or arrived while the page is open, after The Record
 * first said it had sent what it holds. A first visit has no last visit, so only what arrives during it is new; a
 * globe of pings would say nothing.
 *
 * Kept in this browser only (localStorage): when it last left. Nothing is sent anywhere.
 */
const KEY = 'starcom.warConflict.seenUntil';

let previousS: number | null | undefined;
/** The ids standing when the first full read completed: anything after them arrived while the page was open. */
let baseline: Set<string> | null = null;
/** When this page first counted each item new, in ms on the page's clock: a ping runs from there, rebuilds or not. */
const firstNewMs = new Map<string, number>();
let remembering = false;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** When this browser last left the page, in seconds since the epoch, or null when it never has. */
function lastVisitS(): number | null {
  if (previousS !== undefined) return previousS;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    const value = raw === null ? NaN : Number(raw);
    previousS = Number.isFinite(value) ? value : null;
  } catch {
    previousS = null;
  }
  return previousS;
}

/** This visit, remembered as the browser leaves the page, so the next visit knows what came after it. */
function rememberVisits(): void {
  if (remembering || typeof window === 'undefined') return;
  remembering = true;
  const save = () => {
    try { localStorage.setItem(KEY, String(Math.floor(Date.now() / 1000))); } catch { /* storage unavailable: every visit is a first */ }
  };
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
}

/** What the reader holds now, and whether The Record has said it sent everything: the first full read sets the baseline. */
export function noteWarConflictRead(items: ReadonlyArray<{ id: string }>, loaded: boolean): void {
  rememberVisits();
  if (loaded && baseline === null) baseline = new Set(items.map((it) => it.id));
}

/**
 * When an item became new on this page, in seconds on the page's clock (`pageClockS`), or -1 when it is not new:
 * reported since the last visit, or not in the first full read.
 */
export function newSinceS(item: { id: string; reportedAt: number }): number {
  const last = lastVisitS();
  const isNew = (last !== null && item.reportedAt > last) || (baseline !== null && !baseline.has(item.id));
  if (!isNew) return -1;
  let at = firstNewMs.get(item.id);
  if (at === undefined) { at = now(); firstNewMs.set(item.id, at); }
  return at / 1000;
}

/** The page's clock, in seconds: what `newSinceS` counts in. */
export function pageClockS(): number {
  return now() / 1000;
}

/** For tests. */
export function resetWarConflictSeenForTests(): void {
  previousS = undefined;
  baseline = null;
  firstNewMs.clear();
}
