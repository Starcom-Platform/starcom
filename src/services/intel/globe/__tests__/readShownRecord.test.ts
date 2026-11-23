/**
 * The one reader behind a shown Case or Mission. The globe's pins and the
 * camera move both come from it, so what it counts as a mission's evidence is
 * what the globe shows. Real persistence, no mocks.
 */
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect } from 'vitest';
import { readShownRecord } from '../readShownRecord';
import { intelCaseService } from '../../IntelCaseService';
import { intelReportService } from '../../IntelReportService';
import { missionService } from '../../MissionService';

const report = (title: string, at?: { latitude: number; longitude: number }) =>
  intelReportService.createReport({ title, content: 'Body', category: 'general', tags: [], ...at }, 'analyst-1');

describe('readShownRecord', () => {
  it("reads a case's linked records", async () => {
    const placed = await report('Placed', { latitude: 1, longitude: 2 });
    const bare = await report('Bare');
    const created = await intelCaseService.createCase({ title: 'Read me', description: 'Body', relatedEntities: [placed.id, bare.id] });

    const read = await readShownRecord({ kind: 'case', id: created.id });
    if (read.status !== 'ready') throw new Error(read.status);
    expect(read.label).toContain('Read me');
    expect(read.placement.markers.map((m) => m.pubkey)).toEqual([placed.id]);
    expect(read.placement.notDrawn).toEqual({ count: 1, byReason: { 'no-coordinates': 1 } });
    expect(read.caseCount).toBeUndefined();
  });

  it("reads a mission's evidence from its cases and its own reports, each record once", async () => {
    const a = await report('A', { latitude: 1, longitude: 2 });
    const b = await report('B', { latitude: 3, longitude: 4 });
    const bare = await report('Bare in a case');
    const first = await intelCaseService.createCase({ title: 'First', description: 'Body', relatedEntities: [a.id, bare.id] });
    const second = await intelCaseService.createCase({ title: 'Second', description: 'Body', relatedEntities: [a.id] });
    const mission = await missionService.createMission({
      title: 'Mission read',
      briefing: 'Body',
      relatedCases: [first.id, second.id, 'case-that-is-gone'],
      relatedReports: [b.id, a.id],
    });

    const read = await readShownRecord({ kind: 'mission', id: mission.id });
    if (read.status !== 'ready') throw new Error(read.status);
    expect(read.label).toContain('Mission read');
    expect(read.placement.markers.map((m) => m.pubkey).sort()).toEqual([a.id, b.id].sort());
    // a, b, the bare report, and the case that cannot be found.
    expect(read.placement.linkedCount).toBe(4);
    expect(read.placement.notDrawn).toEqual({ count: 2, byReason: { 'no-coordinates': 1, 'case-not-found': 1 } });
    expect(read.caseCount).toBe(3);
  });

  it('tells a mission whose cases link nothing apart from a mission with nothing linked', async () => {
    const empty = await intelCaseService.createCase({ title: 'Empty case', description: 'Body' });
    const withEmptyCase = await missionService.createMission({ title: 'Cases, no evidence', briefing: 'Body', relatedCases: [empty.id] });
    const bareMission = await missionService.createMission({ title: 'Nothing at all', briefing: 'Body' });

    expect(await readShownRecord({ kind: 'mission', id: withEmptyCase.id })).toMatchObject({
      status: 'ready', caseCount: 1, placement: { linkedCount: 0 },
    });
    expect(await readShownRecord({ kind: 'mission', id: bareMission.id })).toMatchObject({
      status: 'ready', caseCount: 0, placement: { linkedCount: 0 },
    });
  });

  it('says a case or mission that does not exist is missing', async () => {
    expect(await readShownRecord({ kind: 'case', id: 'case-that-is-gone' })).toEqual({ status: 'missing' });
    expect(await readShownRecord({ kind: 'mission', id: 'mission-that-is-gone' })).toEqual({ status: 'missing' });
  });
});
