/**
 * The one rule for "this mark came from storage" (decision D-F, step 4.4).
 *
 * Two things read it — the sprite layer fades such a mark, the report notes say
 * how many are faded — and a note that says three while four are faded is worse
 * than no note at all.
 */
import { describe, it, expect } from 'vitest';
import { isFromEarlierSession, earlierSessionSummary } from '../earlierSession';

const SESSION = Date.parse('2026-09-17T20:00:00.000Z');
const HOUR = 60 * 60 * 1000;

describe('isFromEarlierSession', () => {
  it('is true for a copy received before this session began', () => {
    expect(isFromEarlierSession({ receivedAtMs: SESSION - HOUR }, SESSION)).toBe(true);
  });

  it('is false for one received during it', () => {
    expect(isFromEarlierSession({ receivedAtMs: SESSION + 1 }, SESSION)).toBe(false);
  });

  /*
   * Unmeasured is not the same claim as measured. Fading a mark on a staleness
   * that was never established is the same defect pointing the other way.
   */
  it('is false when nobody said when it was received', () => {
    expect(isFromEarlierSession({}, SESSION)).toBe(false);
    expect(isFromEarlierSession({ receivedAtMs: undefined }, SESSION)).toBe(false);
    expect(isFromEarlierSession({ receivedAtMs: NaN }, SESSION)).toBe(false);
  });

  it('survives being handed nothing', () => {
    expect(isFromEarlierSession(undefined as never, SESSION)).toBe(false);
  });
});

describe('earlierSessionSummary', () => {
  it('counts only the marks that predate the session', () => {
    const summary = earlierSessionSummary([
      { receivedAtMs: SESSION - 3 * HOUR },
      { receivedAtMs: SESSION + 5 },
      { receivedAtMs: SESSION - HOUR },
      {},
    ], SESSION);

    expect(summary?.count).toBe(2);
  });

  /*
   * The most recent of their receipts, because they differ and naming one time
   * for the group would be a guess.
   */
  it('reports the most recent of their receipts, not the oldest', () => {
    const summary = earlierSessionSummary([
      { receivedAtMs: SESSION - 9 * HOUR },
      { receivedAtMs: SESSION - 2 * HOUR },
      { receivedAtMs: SESSION - 5 * HOUR },
    ], SESSION);

    expect(summary?.newestReceivedAtMs).toBe(SESSION - 2 * HOUR);
  });

  /*
   * Null rather than a zero, so a caller renders nothing instead of "0 marks
   * from an earlier session".
   */
  it('says nothing when none of them predate the session', () => {
    expect(earlierSessionSummary([{ receivedAtMs: SESSION + 1 }, {}], SESSION)).toBeNull();
    expect(earlierSessionSummary([], SESSION)).toBeNull();
    expect(earlierSessionSummary(undefined as never, SESSION)).toBeNull();
  });
});
