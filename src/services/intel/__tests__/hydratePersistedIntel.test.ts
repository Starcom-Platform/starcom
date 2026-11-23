/**
 * The last session's intel is drawn on open (decision D-F, step 4.4).
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The globe is frequently empty. Measured across several runs on 2026-09-17:
 * the ingest asks five public relays, of which 2/5 and 3/5 were reachable at
 * different moments, relay.damus.io answered 503, and report delivery went
 * 7 → 2 → 0 between runs. A full layer audit drew ZERO Intel Reports marks in
 * all three views — so the app's flagship layer showed nothing, and could not be
 * measured at all.
 *
 * Reports were already being persisted. Nothing read them back onto the globe:
 * `listReports()` is read by six other surfaces and by no globe path.
 *
 * ─── WHAT THIS DOES NOT DECIDE ─────────────────────────────────────────────
 *
 * Placement. Decision D-E settled that a mark sits at its event time, or at its
 * written time when it has none, and says which. Receipt time is a third kind of
 * time and is only what the LABEL says — nothing here moves a mark.
 */
import { describe, it, expect, vi } from 'vitest';
import { hydratePersistedIntel } from '../hydratePersistedIntel';
// Lives beside the other report-time derivations, so reportMarker can use it
// without a cycle back through the hydration path.
import { reportReceivedAtMs } from '../recordTime';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-17T20:00:00.000Z');

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1',
  title: 'A report',
  content: 'body',
  author: 'nostr',
  category: 'GEOINT',
  tags: ['nostr', 'relay:wss://relay.damus.io'],
  latitude: 32.7,
  longitude: -117.1,
  createdAt: new Date(NOW - DAY),
  updatedAt: new Date(NOW - DAY),
  status: 'SUBMITTED',
  history: [{ action: 'IMPORTED', timestamp: new Date(NOW - DAY).toISOString(), user: 'nostr' }],
  ...over,
} as IntelReportUI);

const hydrate = (reports: IntelReportUI[], over: Partial<Parameters<typeof hydratePersistedIntel>[0]> = {}) => {
  const drawn: IntelReportUI[] = [];
  return hydratePersistedIntel({
    listReports: async () => reports,
    draw: (r) => { drawn.push(r); },
    sinceWindowMs: 30 * DAY,
    now: NOW,
    ...over,
  }).then((result) => ({ result, drawn }));
};

describe('hydratePersistedIntel', () => {
  it('draws a persisted report so the globe is not empty', async () => {
    const { result, drawn } = await hydrate([report()]);

    expect(drawn.map((r) => r.id)).toEqual(['r1']);
    expect(result.drawn).toBe(1);
  });

  /*
   * Both kinds. A report created from the globe's context menu is persisted and
   * was never redrawn, so it vanished from the globe on reload — this ends that
   * as well as filling an empty globe from the relays.
   */
  it('draws the person\'s own reports, not only the network\'s', async () => {
    const mine = report({ id: 'mine', tags: ['user-created', 'context-menu'], author: 'me' });

    const { drawn } = await hydrate([report(), mine]);

    expect(drawn.map((r) => r.id).sort()).toEqual(['mine', 'r1']);
  });

  /*
   * Bounded by the same window the live relay query asks for, on the same time
   * the query filters by — the event's own. The globe then never shows something
   * the live query would not have requested.
   */
  it('leaves out a report older than the window the live query asks for', async () => {
    const old = report({ id: 'old', createdAt: new Date(NOW - 40 * DAY) as unknown as Date });

    const { result, drawn } = await hydrate([report(), old]);

    expect(drawn.map((r) => r.id)).toEqual(['r1']);
    expect(result.skippedOutsideWindow).toBe(1);
  });

  it('keeps one exactly at the edge of the window rather than guessing', async () => {
    const edge = report({ id: 'edge', createdAt: new Date(NOW - 30 * DAY) as unknown as Date });

    const { drawn } = await hydrate([edge]);

    expect(drawn.map((r) => r.id)).toEqual(['edge']);
  });

  /*
   * A report the globe cannot place is not a report the globe can draw, and
   * reportToMarker is already the one authority on that — it returns null for a
   * missing or unusable coordinate.
   */
  it('leaves out a report it cannot place', async () => {
    const nowhere = report({ id: 'nowhere', latitude: undefined, longitude: undefined });

    const { result, drawn } = await hydrate([report(), nowhere]);

    expect(drawn.map((r) => r.id)).toEqual(['r1']);
    expect(result.skippedWithoutPlace).toBe(1);
  });

  /*
   * Oldest first, because the draw path unshifts: drawing newest first would
   * leave the oldest at the front of the cache and the newest first past the cap.
   */
  it('draws oldest first, so the newest survive the cap', async () => {
    const older = report({ id: 'older', createdAt: new Date(NOW - 10 * DAY) as unknown as Date });
    const newer = report({ id: 'newer', createdAt: new Date(NOW - 2 * DAY) as unknown as Date });

    const { drawn } = await hydrate([newer, older]);

    expect(drawn.map((r) => r.id)).toEqual(['older', 'newer']);
  });

  it('says when the newest of them was received, for the label to print', async () => {
    const receivedAt = new Date(NOW - 3 * DAY).toISOString();
    const r = report({ history: [{ action: 'IMPORTED', timestamp: receivedAt, user: 'nostr' }] as never });

    const { result } = await hydrate([r]);

    expect(result.newestReceivedAtMs).toBe(Date.parse(receivedAt));
  });

  it('draws nothing and says so when there is nothing stored', async () => {
    const { result, drawn } = await hydrate([]);

    expect(drawn).toHaveLength(0);
    expect(result.drawn).toBe(0);
    expect(result.newestReceivedAtMs).toBeNull();
  });

  /*
   * Reading storage must never take the globe down with it: the live ingest is
   * the primary path and this is a convenience on top of it.
   */
  it('survives storage refusing to answer', async () => {
    const draw = vi.fn();

    const result = await hydratePersistedIntel({
      listReports: async () => { throw new Error('IndexedDB unavailable'); },
      draw, sinceWindowMs: 30 * DAY, now: NOW,
    });

    expect(result.drawn).toBe(0);
    expect(draw).not.toHaveBeenCalled();
  });

  it('survives one report that cannot be read without losing the others', async () => {
    const broken = { id: 'broken' } as unknown as IntelReportUI;

    const { drawn } = await hydrate([broken, report()]);

    expect(drawn.map((r) => r.id)).toEqual(['r1']);
  });
});

/*
 * When we received our copy — a third kind of time, and the one the label says.
 * importReport APPENDS an IMPORTED entry on every import, including the overwrite
 * a live report performs, so the latest one is the most recent receipt and a
 * hydrated mark stops being stale the moment it arrives live.
 */
describe('reportReceivedAtMs', () => {
  it('reads the latest IMPORTED entry, not the first', async () => {
    const first = new Date(NOW - 9 * DAY).toISOString();
    const latest = new Date(NOW - 1 * DAY).toISOString();

    expect(reportReceivedAtMs(report({
      history: [
        { action: 'IMPORTED', timestamp: first, user: 'nostr' },
        { action: 'IMPORTED', timestamp: latest, user: 'import' },
      ] as never,
    }))).toBe(Date.parse(latest));
  });

  it('ignores history entries that are not a receipt', async () => {
    const received = new Date(NOW - 5 * DAY).toISOString();

    expect(reportReceivedAtMs(report({
      history: [
        { action: 'IMPORTED', timestamp: received, user: 'nostr' },
        { action: 'UPDATED', timestamp: new Date(NOW).toISOString(), user: 'me' },
      ] as never,
    }))).toBe(Date.parse(received));
  });

  /*
   * A report the person wrote here was never received, so there is no receipt
   * to be stale. Falling back to when it was made drew it faded, as from an
   * earlier session, for good (plan item 9.5): nothing live ever replaces it.
   */
  it('says nothing for a report made here, which was never received', async () => {
    const made = new Date(NOW - 6 * DAY);

    expect(reportReceivedAtMs(report({ history: [] as never, createdAt: made as unknown as Date }))).toBeNull();
    expect(reportReceivedAtMs(report({
      history: [{ action: 'CREATED', timestamp: made.toISOString(), user: 'me' }] as never,
      createdAt: made as unknown as Date,
    }))).toBeNull();
  });

  it('says nothing when it cannot tell', async () => {
    expect(reportReceivedAtMs({ id: 'x' } as unknown as IntelReportUI)).toBeNull();
    expect(reportReceivedAtMs(report({ history: [{ action: 'IMPORTED', timestamp: 'not a date', user: 'x' }] as never, createdAt: undefined as unknown as Date }))).toBeNull();
  });
});
