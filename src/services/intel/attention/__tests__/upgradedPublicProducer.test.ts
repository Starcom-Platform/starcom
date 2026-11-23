import { describe, it, expect } from 'vitest';
import { produceUpgradedPublicItems, UPGRADED_PUBLIC_PRODUCER } from '../upgradedPublicProducer';
import type { IntelCaseUI } from '../../../../types/intel/IntelCaseUI';
import type { MissionUI } from '../../../../types/intel/MissionUI';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import { MissionStatus } from '../../../../types/intel/MissionUI';

/*
 * The 9 Sep 2026 migration made records with no distribution Public (plan item
 * 9.6). What it changed cannot be told from a Public somebody chose, so every
 * Public record made before that day is listed once, to keep or change
 * (decision G3).
 */

const BEFORE = '2026-09-03T10:00:00.000Z';
const AFTER = '2026-09-09T00:00:00.000Z';

const aCase = (over: Partial<IntelCaseUI> = {}) =>
  ({ id: 'c-1', title: 'Harbour cranes', createdAt: BEFORE, visibility: 'public', ...over }) as IntelCaseUI;
const aMission = (over: Partial<MissionUI> = {}) =>
  ({ id: 'm-1', title: 'Coastal survey', createdAt: BEFORE, visibility: 'public', status: MissionStatus.PLANNING, ...over }) as MissionUI;
const aReport = (over: Partial<IntelReportUI> = {}) =>
  ({ id: 'r-1', title: 'Berth 4 photos', createdAt: new Date(BEFORE), visibility: 'public', history: [], ...over }) as IntelReportUI;

const produce = (over: { cases?: IntelCaseUI[]; missions?: MissionUI[]; reports?: IntelReportUI[] } = {}) =>
  produceUpgradedPublicItems({ cases: [], missions: [], reports: [], ...over });

describe('produceUpgradedPublicItems', () => {
  it('lists a Public case made before the upgrade, saying what Public means and why it is asked', () => {
    const [item, ...rest] = produce({ cases: [aCase()] });
    expect(rest).toHaveLength(0);
    expect(item).toMatchObject({
      subject: 'Harbour cranes',
      reason: 'made-public-by-upgrade',
      producedBy: UPGRADED_PUBLIC_PRODUCER,
      caseId: 'c-1',
      distributionOf: { kind: 'case', id: 'c-1', locked: false },
      state: 'new',
    });
    expect(item.missionId).toBeUndefined();
    expect(item.explanation).toBe(
      'This case, made 3 Sep 2026 10:00Z, is Public: anyone may read it once it is published. '
      + 'An upgrade on 9 Sep 2026 made records with no distribution Public, so it may never have been chosen.',
    );
  });

  it('lists missions and reports too, a mission with a way to open it', () => {
    const items = produce({ missions: [aMission()], reports: [aReport()] });
    expect(items.map((i) => i.distributionOf)).toEqual([
      { kind: 'mission', id: 'm-1', locked: false },
      { kind: 'report', id: 'r-1', locked: false },
    ]);
    expect(items[0]).toMatchObject({ missionId: 'm-1', caseId: '' });
    expect(items[1]).toMatchObject({ caseId: '' });
    expect(items[1].missionId).toBeUndefined();
  });

  it("says so when a mission's package is locked, since its distribution locks with it", () => {
    const [item] = produce({ missions: [aMission({ status: MissionStatus.READY_FOR_PACKAGE })] });
    expect(item.distributionOf).toEqual({ kind: 'mission', id: 'm-1', locked: true });
    expect(item.explanation).toMatch(/Its package is locked, so move it back to Planning to change it\.$/);
  });

  it('leaves out anything made on or after the day of the upgrade', () => {
    expect(produce({
      cases: [aCase({ createdAt: AFTER })],
      missions: [aMission({ createdAt: AFTER })],
      reports: [aReport({ createdAt: new Date(AFTER) })],
    })).toEqual([]);
  });

  it('leaves out anything not Public', () => {
    const notPublic = ['limited', 'private', undefined] as const;
    expect(produce({
      cases: notPublic.map((visibility) => aCase({ visibility })),
      missions: notPublic.map((visibility) => aMission({ visibility })),
      reports: notPublic.map((visibility) => aReport({ visibility })),
    })).toEqual([]);
  });

  it('leaves out a report received from elsewhere: Public is where it came from', () => {
    const received = aReport({ history: [{ action: 'IMPORTED', timestamp: BEFORE, user: 'nostr' }] as never });
    expect(produce({ reports: [received] })).toEqual([]);
  });

  it('leaves out a record whose making cannot be dated', () => {
    expect(produce({ cases: [aCase({ createdAt: 'not a date' })] })).toEqual([]);
  });

  it('is one concern per record, however often the queue recomputes', () => {
    const input = { cases: [aCase(), aCase({ id: 'c-2' })], missions: [aMission({ id: 'c-1' })] };
    const a = produce(input);
    const b = produce(input);
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(new Set(a.map((i) => i.id)).size).toBe(3);
  });
});
