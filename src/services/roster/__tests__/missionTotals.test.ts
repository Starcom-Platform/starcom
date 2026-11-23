/**
 * An Epic's progress (decision D-RS, RS23; spec rev 14, "An Epic's progress: mission totals"): each package's signer
 * posts its missions' reported totals, never who reported; an Epic sums the totals of the missions it counts, by
 * its criteria's labels. Only the package's own signer's note counts.
 */
import { describe, it, expect } from 'vitest';
import type { Event } from 'nostr-tools';
import { readMissionTotals, MissionTotalsStore, epicProgress } from '../missionTotals';
import type { RosterItem } from '../rosterItem';

const MJ = 'a'.repeat(64);
const SOMEONE = 'c'.repeat(64);
let n = 0;
const note = (over: { pubkey?: string; d?: string; tags?: string[][]; created_at?: number } = {}): Event => {
  n += 1;
  const d = over.d ?? 'starcom_mission_package_naloxone-sf';
  return {
    id: n.toString(16).padStart(64, '0'), kind: 30023, pubkey: over.pubkey ?? MJ, created_at: over.created_at ?? 1_792_200_000, sig: 's'.repeat(128), content: '',
    tags: over.tags ?? [
      ['d', `mission-totals-${d}`], ['t', 'mission_totals'], ['a', `30079:${MJ}:${d}`],
      ['total', 'Naloxone kits carried or placed', '120'], ['total', 'Trainings run', '7'], ['reports', '19'], ['as_of', '2026-10-17'],
    ],
  } as Event;
};

describe('readMissionTotals', () => {
  it('reads a signer\'s totals for its own mission', () => {
    expect(readMissionTotals(note())).toEqual({
      ok: true,
      totals: { coordinate: `30079:${MJ}:starcom_mission_package_naloxone-sf`, counts: [{ label: 'Naloxone kits carried or placed', n: 120 }, { label: 'Trainings run', n: 7 }], reports: 19, asOf: '2026-10-17', createdAt: 1_792_200_000 },
    });
  });

  it('refuses totals for a mission someone else signed', () => {
    expect(readMissionTotals(note({ pubkey: SOMEONE }))).toEqual({ ok: false, reason: 'not signed by the mission\'s own signer' });
  });

  it('refuses a note without its tag or its mission, and drops a count that is not whole', () => {
    expect(readMissionTotals(note({ tags: [['d', 'x'], ['a', `30079:${MJ}:x`]] }))).toEqual({ ok: false, reason: 'not tagged mission_totals' });
    expect(readMissionTotals(note({ tags: [['d', 'x'], ['t', 'mission_totals']] }))).toEqual({ ok: false, reason: 'no mission named' });
    const read = readMissionTotals(note({ tags: [['d', 'x'], ['t', 'mission_totals'], ['a', `30079:${MJ}:x`], ['total', 'Kits', '2.5'], ['total', 'Trainings run', '3']] }));
    expect(read.ok && read.totals.counts).toEqual([{ label: 'Trainings run', n: 3 }]);
  });
});

describe('MissionTotalsStore', () => {
  it('keeps the newest totals for each mission, and withdraws a retracted one', () => {
    const store = new MissionTotalsStore();
    store.accept(note({ created_at: 100 }));
    store.accept(note({ created_at: 200, tags: [['d', 'mission-totals-starcom_mission_package_naloxone-sf'], ['t', 'mission_totals'], ['a', `30079:${MJ}:starcom_mission_package_naloxone-sf`], ['total', 'Trainings run', '9'], ['reports', '20'], ['as_of', '2026-10-18']] }));
    store.accept(note({ created_at: 150 }));
    expect(store.of(`30079:${MJ}:starcom_mission_package_naloxone-sf`)?.counts).toEqual([{ label: 'Trainings run', n: 9 }]);
    store.accept(note({ created_at: 300, tags: [['d', 'mission-totals-starcom_mission_package_naloxone-sf'], ['t', 'mission_totals'], ['t', 'retracted'], ['a', `30079:${MJ}:starcom_mission_package_naloxone-sf`]] }));
    expect(store.of(`30079:${MJ}:starcom_mission_package_naloxone-sf`)).toBeNull();
  });
});

describe('epicProgress', () => {
  const epic: RosterItem = {
    d: 'epic-nm', kind: 'epic', title: 'Naloxone across the West', limits: [], places: [], toward: [], text: '',
    criteria: [{ label: 'Naloxone kits carried or placed', target: 500 }, { label: 'Venues checked', target: 40 }],
    counts: [
      { coordinate: `30079:${MJ}:starcom_mission_package_naloxone-sf`, relay: '' },
      { coordinate: `30079:${MJ}:starcom_mission_package_naloxone-la`, relay: '' },
      { coordinate: `30084:${SOMEONE}:epic-sub`, relay: '' },
    ],
  };

  it('sums each criterion from the posted totals of the missions it counts, by label', () => {
    const store = new MissionTotalsStore();
    store.accept(note());
    store.accept(note({ d: 'starcom_mission_package_naloxone-la', tags: [['d', 'mission-totals-la'], ['t', 'mission_totals'], ['a', `30079:${MJ}:starcom_mission_package_naloxone-la`], ['total', '  naloxone KITS carried or placed ', '30'], ['as_of', '2026-10-16']] }));
    const progress = epicProgress(epic, store);
    expect(progress).toEqual({
      missions: 2, posted: 2, asOf: '2026-10-17',
      criteria: [{ label: 'Naloxone kits carried or placed', target: 500, done: 150 }, { label: 'Venues checked', target: 40, done: 0 }],
    });
  });

  it('says how many of its missions have totals posted, and none when none has', () => {
    const store = new MissionTotalsStore();
    expect(epicProgress(epic, store)).toEqual({
      missions: 2, posted: 0, asOf: null,
      criteria: [{ label: 'Naloxone kits carried or placed', target: 500, done: 0 }, { label: 'Venues checked', target: 40, done: 0 }],
    });
    store.accept(note());
    expect(epicProgress(epic, store).posted).toBe(1);
  });

  it('has no progress for an item with no criteria', () => {
    expect(epicProgress({ ...epic, criteria: [] }, new MissionTotalsStore())).toBeNull();
  });
});

/*
 * An Operation's counts, a day late and coarse (RS26), so nobody can follow people as they go: only totals as of a
 * day before today, rounded down to tens below 100 and to hundreds above.
 */
describe('epicProgress, late and coarse', () => {
  const op: RosterItem = {
    d: 'operation-x', kind: 'operation', title: 'Op', limits: [], places: [], toward: [], text: '',
    criteria: [{ label: 'Naloxone kits carried or placed', target: 500 }],
    counts: [{ coordinate: `30079:${MJ}:starcom_mission_package_naloxone-sf`, relay: '' }, { coordinate: `30079:${MJ}:starcom_mission_package_naloxone-la`, relay: '' }],
  };
  const totalsOn = (d: string, kits: string, asOf: string) => note({ d, tags: [['d', `mission-totals-${d}`], ['t', 'mission_totals'], ['a', `30079:${MJ}:${d}`], ['total', 'Naloxone kits carried or placed', kits], ['as_of', asOf]] });

  it('leaves out totals as of today, and rounds what is left', () => {
    const store = new MissionTotalsStore();
    store.accept(totalsOn('starcom_mission_package_naloxone-sf', '127', '2026-10-16'));
    store.accept(totalsOn('starcom_mission_package_naloxone-la', '38', '2026-10-17'));
    const progress = epicProgress(op, store, { lateAndCoarse: { today: '2026-10-17' } })!;
    expect(progress.posted).toBe(1);
    expect(progress.criteria[0].done).toBe(100);
    expect(progress.coarse).toBe(true);
  });

  it('rounds to tens below a hundred', () => {
    const store = new MissionTotalsStore();
    store.accept(totalsOn('starcom_mission_package_naloxone-sf', '38', '2026-10-15'));
    expect(epicProgress(op, store, { lateAndCoarse: { today: '2026-10-17' } })!.criteria[0].done).toBe(30);
  });
});
