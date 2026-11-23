/**
 * The missions a person here has taken on (decision D-MF, MF7–MF10): whole, desk or field, kept on this device
 * and sent nowhere (MF8), each a checklist of its steps. The words are kept, since the package may change or go.
 */
import { describe, it, expect } from 'vitest';
import type { AcceptedPackage } from '../../MissionPackageIngest';
import { MemoryTakenMissionsStore, TakenMissions, takeInputOf, type TakeInput } from '../takenMissions';

const NALOXONE: TakeInput = {
  key: 'abc:starcom_mission_package_field-naloxone-nm', signer: 'abc', packageId: 'field-naloxone-nm', relay: 'wss://record.example',
  title: 'Put naloxone in more pockets and first-aid kits in New Mexico.', subject: 'Carry naloxone in New Mexico',
  limits: 'Work in pairs. Never confront anyone.', where: 'field', place: { state: 'NM' }, closesAt: 1_794_700_800_000,
  steps: [{ id: 's1', ask: 'Get naloxone.', effortMinutes: 30 }, { id: 's2', ask: 'Learn the four steps.', effortMinutes: 10 }],
};

describe('TakenMissions', () => {
  it('takes a mission whole, its steps a checklist, none yet done', () => {
    const taken = new TakenMissions();
    const record = taken.take(NALOXONE, '2026-10-16T20:00:00Z');
    expect(record.takenAt).toBe('2026-10-16T20:00:00Z');
    expect(record.steps.map((s) => [s.ask, s.done])).toEqual([['Get naloxone.', false], ['Learn the four steps.', false]]);
    expect(taken.isTaken(NALOXONE.key)).toBe(true);
  });

  it('keeps when it was first taken, taken again', () => {
    const taken = new TakenMissions();
    taken.take(NALOXONE, '2026-10-16T20:00:00Z');
    expect(taken.take(NALOXONE, '2026-10-17T09:00:00Z').takenAt).toBe('2026-10-16T20:00:00Z');
  });

  it('is worked with a team by its relay, kept as taken, and alone again (D-RS, RS55)', () => {
    const store = new MemoryTakenMissionsStore();
    const taken = new TakenMissions(store);
    taken.take(NALOXONE, '2026-10-16T20:00:00Z');
    taken.setTeam(NALOXONE.key, { relay: 'wss://team.example.org', name: 'Bay Area crew' });
    expect(new TakenMissions(store).get(NALOXONE.key)?.team).toEqual({ relay: 'wss://team.example.org', name: 'Bay Area crew' });
    taken.setTeam(NALOXONE.key, null);
    expect(new TakenMissions(store).get(NALOXONE.key)).not.toHaveProperty('team');
  });

  it('ticks a step done and back, saying when', () => {
    const taken = new TakenMissions();
    taken.take(NALOXONE, '2026-10-16T20:00:00Z');
    taken.setStepDone(NALOXONE.key, 's1', true, '2026-10-17T10:00:00Z');
    expect(taken.get(NALOXONE.key)!.steps[0]).toMatchObject({ done: true, doneAt: '2026-10-17T10:00:00Z' });
    taken.setStepDone(NALOXONE.key, 's1', false, '2026-10-17T11:00:00Z');
    expect(taken.get(NALOXONE.key)!.steps[0].done).toBe(false);
    expect(taken.get(NALOXONE.key)!.steps[0].doneAt).toBeUndefined();
  });

  it('lets a mission go', () => {
    const taken = new TakenMissions();
    taken.take(NALOXONE);
    taken.release(NALOXONE.key);
    expect(taken.isTaken(NALOXONE.key)).toBe(false);
    expect(taken.all()).toEqual([]);
  });

  it('keeps what it holds on the device, across a reload, and tells who listens', () => {
    const store = new MemoryTakenMissionsStore();
    const first = new TakenMissions(store);
    let told = 0;
    first.subscribe(() => { told += 1; });
    first.take(NALOXONE, '2026-10-16T20:00:00Z');
    first.setStepDone(NALOXONE.key, 's2', true, '2026-10-17T10:00:00Z');
    expect(told).toBe(2);
    const reloaded = new TakenMissions(store);
    expect(reloaded.get(NALOXONE.key)).toMatchObject({ title: NALOXONE.title, limits: NALOXONE.limits, place: { state: 'NM' } });
    expect(reloaded.get(NALOXONE.key)!.steps[1].done).toBe(true);
  });

  it('keeps each report sent, newest last, so its card can say what went', () => {
    const taken = new TakenMissions();
    taken.take(NALOXONE);
    taken.addReport(NALOXONE.key, { day: '2026-10-16', values: { kits: 3 }, sentAt: '2026-10-16T21:00:00Z', relays: 2 });
    taken.addReport(NALOXONE.key, { day: '2026-10-20', values: { kits: 5 }, sentAt: '2026-10-20T09:00:00Z', relays: 1 });
    expect(taken.get(NALOXONE.key)!.reports!.map((r) => r.day)).toEqual(['2026-10-16', '2026-10-20']);
  });

  it('lists the newest taken first', () => {
    const taken = new TakenMissions();
    taken.take(NALOXONE, '2026-10-16T20:00:00Z');
    taken.take({ ...NALOXONE, key: 'abc:other', packageId: 'other', title: 'Other' }, '2026-10-17T08:00:00Z');
    expect(taken.all().map((m) => m.title)).toEqual(['Other', NALOXONE.title]);
  });
});

// A quest line's next mission unlocks when the one before is finished (D-RS, RS29).
describe('TakenMissions: finished', () => {
  const COORDINATE = '30079:abc:field-naloxone-nm';
  const WITH = { ...NALOXONE, coordinate: COORDINATE };

  it('is finished when every step is ticked, as of the last tick, and not once one is unticked', () => {
    const taken = new TakenMissions();
    taken.take(WITH, '2026-10-16T20:00:00Z');
    taken.setStepDone(WITH.key, 's2', true, '2026-10-17T12:00:00Z');
    expect(taken.finishedAt(COORDINATE)).toBeUndefined();
    taken.setStepDone(WITH.key, 's1', true, '2026-10-17T10:00:00Z');
    expect(taken.finishedAt(COORDINATE)).toBe('2026-10-17T12:00:00Z');
    taken.setStepDone(WITH.key, 's1', false);
    expect(taken.finishedAt(COORDINATE)).toBeUndefined();
  });

  it('stays finished when it is let go, across a reload, and taken again', () => {
    const store = new MemoryTakenMissionsStore();
    const taken = new TakenMissions(store);
    taken.take(WITH);
    taken.setStepDone(WITH.key, 's1', true, '2026-10-17T10:00:00Z');
    taken.setStepDone(WITH.key, 's2', true, '2026-10-17T11:00:00Z');
    taken.release(WITH.key);
    expect(taken.finishedAt(COORDINATE)).toBe('2026-10-17T11:00:00Z');
    const reloaded = new TakenMissions(store);
    expect(reloaded.finishedAt(COORDINATE)).toBe('2026-10-17T11:00:00Z');
    reloaded.take(WITH);
    expect(reloaded.finishedAt(COORDINATE)).toBe('2026-10-17T11:00:00Z');
  });

  it('is not finished when let go unfinished', () => {
    const taken = new TakenMissions();
    taken.take(WITH);
    taken.setStepDone(WITH.key, 's1', true, '2026-10-17T10:00:00Z');
    taken.release(WITH.key);
    expect(taken.finishedAt(COORDINATE)).toBeUndefined();
  });

  it('a mission with no steps is never finished by taking it, only marked by hand, and the mark can be undone', () => {
    const store = new MemoryTakenMissionsStore();
    const taken = new TakenMissions(store);
    let told = 0;
    taken.subscribe(() => { told += 1; });
    taken.take({ ...WITH, steps: [] });
    expect(taken.finishedAt(COORDINATE)).toBeUndefined();
    taken.markFinished(COORDINATE, '2026-10-17T13:00:00Z');
    expect(taken.finishedAt(COORDINATE)).toBe('2026-10-17T13:00:00Z');
    expect(told).toBe(2);
    expect(new TakenMissions(store).finishedAt(COORDINATE)).toBe('2026-10-17T13:00:00Z');
    taken.unmarkFinished(COORDINATE);
    expect(taken.finishedAt(COORDINATE)).toBeUndefined();
    expect(new TakenMissions(store).finishedAt(COORDINATE)).toBeUndefined();
  });

  it('one finished before, taken again and ticked again, keeps when it was first finished', () => {
    const taken = new TakenMissions();
    taken.markFinished(COORDINATE, '2026-10-12T09:00:00Z');
    taken.take(WITH);
    taken.setStepDone(WITH.key, 's1', true, '2026-10-17T10:00:00Z');
    taken.setStepDone(WITH.key, 's2', true, '2026-10-17T11:00:00Z');
    expect(taken.finishedAt(COORDINATE)).toBe('2026-10-12T09:00:00Z');
  });

  it('marking one already finished keeps when it was', () => {
    const taken = new TakenMissions();
    taken.markFinished(COORDINATE, '2026-10-17T13:00:00Z');
    taken.markFinished(COORDINATE, '2026-10-18T09:00:00Z');
    expect(taken.finishedAt(COORDINATE)).toBe('2026-10-17T13:00:00Z');
  });
});

describe('takeInputOf', () => {
  it('takes a package as its card reads it: its mission line, limits, place and end, and the steps not done, with their ids', () => {
    const pkg: AcceptedPackage = {
      event: { id: 'evt-1', pubkey: 'abc', created_at: 1, kind: 30079, content: '', sig: '', tags: [['d', 'starcom_mission_package_field-naloxone-nm'], ['t', 'where:field']] },
      check: {
        ok: true,
        manifest: {
          id: 'field-naloxone-nm', name: 'Carry naloxone in New Mexico', version: '1.0.0', author: 'Mecha Jono', createdAt: '2026-10-16T00:00:00Z',
          description: 'MISSION: Put naloxone in more pockets and first-aid kits in New Mexico.\n\nPeople died.', license: 'CC-BY-4.0', visibility: 'public',
          reports: [], intel: [], assets: [],
          metadata: { mechaJono: { area: { country: 'us-nm', state: 'NM' }, window: { until: '2026-11-15T00:00:00+00:00' }, format: { limits: 'Work in pairs. Never confront anyone.', effect: ['Naloxone kits carried or placed: a count'], performance: ['Trainings run: a count'] } } },
          objectives: [
            { id: 's1', ask: 'Get naloxone.', effortMinutes: 30, done: false },
            { id: 's0', ask: 'Already done by the sender.', done: true },
            { id: 's2', ask: 'Learn the four steps.', effortMinutes: 10, done: false },
          ],
        },
      } as AcceptedPackage['check'],
      relay: 'wss://record.example',
    };
    expect(takeInputOf(pkg)).toEqual({
      key: 'abc:starcom_mission_package_field-naloxone-nm', signer: 'abc', packageId: 'field-naloxone-nm', relay: 'wss://record.example',
      coordinate: '30079:abc:starcom_mission_package_field-naloxone-nm',
      // Effect lines only, each kept verbatim: a performance line's count would be dropped by its reader (MX28).
      counts: [{ id: 'naloxone-kits-carried-or-placed', label: 'Naloxone kits carried or placed', line: 'Naloxone kits carried or placed: a count' }],
      title: 'Put naloxone in more pockets and first-aid kits in New Mexico.', subject: 'Carry naloxone in New Mexico',
      limits: 'Work in pairs. Never confront anyone.', where: 'field', place: { state: 'NM' }, closesAt: Date.parse('2026-11-15T00:00:00Z'),
      steps: [{ id: 's1', ask: 'Get naloxone.', effortMinutes: 30 }, { id: 's2', ask: 'Learn the four steps.', effortMinutes: 10 }],
    });
  });
});
