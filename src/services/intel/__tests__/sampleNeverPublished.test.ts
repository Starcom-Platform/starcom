/**
 * Sample data can never be published (plan item 0.9).
 *
 * The demo seed wrote twenty cases into the real workspace, marked as nothing,
 * and the case screen declared every case's evidence real (`evidenceIsSynthetic:
 * false`), a statement its own comment said would become a lie "if a demo
 * seeder ... is ever added". It had been. Only NetRunner's review refused
 * sample material; missions, findings and the Exchange did not ask.
 *
 * Now what a seeder writes says so, and every review refuses it, or anything
 * that rests on it, before anything is shown or sent.
 *
 * Real persistence, as in the workspace suites. Nothing reaches a relay: the
 * senders are stand-ins that record whether they were asked.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi } from 'vitest';

const sent = vi.hoisted(() => ({ missions: 0, findings: 0, exchange: 0 }));
vi.mock('../capability/missionCapability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capability/missionCapability')>()),
  mintRootGrantSigned: vi.fn(async () => ({ id: 'cap-root' })),
  verifyGrantChain: vi.fn(() => ({ ok: true, reason: undefined })),
}));
vi.mock('../MissionPackageBroadcastService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../MissionPackageBroadcastService')>()),
  MissionPackageBroadcastService: class {
    publishMissionPackage() { sent.missions += 1; return Promise.resolve({ success: true, eventId: 'e', relaysOk: 1, relaysTried: 1 }); }
    dispose() {}
  },
}));
vi.mock('../findings/FindingsBroadcastService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../findings/FindingsBroadcastService')>()),
  FindingsBroadcastService: class {
    publishFinding() { sent.findings += 1; return Promise.resolve({ success: true, eventId: 'e', relaysOk: 1, relaysTried: 1 }); }
    dispose() {}
  },
}));
vi.mock('../../exchange/PublishAdapter', () => ({
  publishAdapter: { publish: () => { sent.exchange += 1; return Promise.resolve({ id: 'p' }); } },
}));

import { generateSampleCaseData, generateRelatedCaseSeries } from '../../../core/intel/utils/caseDataGenerator';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { intelCaseService } from '../IntelCaseService';
import { intelReportService } from '../IntelReportService';
import { missionService } from '../MissionService';
import { MissionStatus } from '../../../types/intel/MissionUI';
import { reviewMissionPackage } from '../../publishing/missions';
import { reviewCaseAdjudication } from '../../publishing/findings';
import { reviewExchangePackage } from '../../publishing/exchange';
import { currentReview } from '../../publishing/publishReview';
import { caseRestsOnSample } from '../sampleRecords';
import { adaptReportsToEvents } from '../../../applications/intelanalyzer/adapters/eventsAdapter';
import type { PackageManifest } from '../../exchange/types';

async function statedCase(input: { title: string; sample?: boolean; relatedEntities?: string[] }) {
  const id = (await caseManagerAdapter.addCase({ description: 'Body', visibility: 'public', ...input }))!;
  await caseManagerAdapter.statePosition(id, 'Two of the five sites are closed.');
  return (await intelCaseService.getCase(id))!;
}

async function readyMission(input: { title: string; sample?: boolean; relatedCases?: string[] }) {
  const created = await missionService.createMission({ briefing: 'Rests on direct observation.', visibility: 'public', ...input });
  await missionService.updateStatus(created.id, MissionStatus.PLANNING);
  return (await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE))!;
}

// An organization: a person-subject is refused on other grounds, which would hide what is tested here.
const OPTIONS = { subjectRef: 'Newark food bank network', subjectKind: 'organization' as const };

describe('what the demo seed writes', () => {
  it('marks every case it writes as sample', async () => {
    const ids = [...await generateSampleCaseData(2), ...await generateRelatedCaseSeries(1)];
    expect(ids).toHaveLength(3);
    for (const id of ids) expect((await intelCaseService.getCase(id))?.sample).toBe(true);
  });
});

describe('what a review refuses, before anything is shown or sent', () => {
  it("a sample case's position", async () => {
    const record = await statedCase({ title: 'Seeded case', sample: true });
    const result = await reviewCaseAdjudication(record, { ...OPTIONS, evidenceIsSynthetic: caseRestsOnSample(record) });

    // Refused by the publication policy, which reads the computed flag, before
    // any review: a decision, stated, and nothing signed.
    expect(result?.refused?.reason).toMatch(/fabricated evidence/);
    expect(currentReview()).toBeNull();
    expect(sent.findings).toBe(0);
  });

  it("a real case's position when its evidence is a sample report", async () => {
    const report = await intelReportService.createReport({ title: 'Seeded report', content: 'Demo.', category: 'general', tags: [], sample: true });
    const record = await statedCase({ title: 'Real case on seeded evidence', relatedEntities: [report.id] });

    expect(caseRestsOnSample(record)).toBe(true);
    const result = await reviewCaseAdjudication(record, { ...OPTIONS, evidenceIsSynthetic: caseRestsOnSample(record) });
    expect(result?.refused?.reason).toMatch(/fabricated evidence/);
    expect(currentReview()).toBeNull();
    expect(sent.findings).toBe(0);
  });

  it('a sample mission, and a mission resting on a sample case', async () => {
    const seededCase = await statedCase({ title: 'Seeded evidence', sample: true });
    for (const mission of [
      await readyMission({ title: 'Seeded mission', sample: true }),
      await readyMission({ title: 'Real mission on seeded evidence', relatedCases: [seededCase.id] }),
    ]) {
      const outcome = await reviewMissionPackage(mission.id);
      expect(outcome).toMatchObject({ status: 'refused', reason: expect.stringMatching(/sample material/i) });
    }
    expect(currentReview()).toBeNull();
    expect(sent.missions).toBe(0);
  });

  it('an Exchange package holding a sample report', async () => {
    const report = await intelReportService.createReport({ title: 'Seeded for the Exchange', content: 'Demo.', category: 'general', tags: [], sample: true });
    const manifest = { id: 'pkg-s', name: 'Seeded package', visibility: 'public', assets: [], reports: [{ id: report.id, title: report.title, checksum: 'x' }] } as unknown as PackageManifest;

    expect(await reviewExchangePackage(manifest)).toBeNull();
    expect(currentReview()).toBeNull();
    expect(sent.exchange).toBe(0);
  });
});

describe('the review itself, even when a caller says the evidence is real', () => {
  it("refuses a sample case's position rather than trusting the caller", async () => {
    const record = await statedCase({ title: 'Seeded, called real', sample: true });
    const result = await reviewCaseAdjudication(record, { ...OPTIONS, evidenceIsSynthetic: false });

    expect(result).toBeNull();
    expect(currentReview()).toBeNull();
    expect(sent.findings).toBe(0);
  });
});

describe('what is computed, not asserted', () => {
  it('calls events from a sample report synthetic, and from a written one real', async () => {
    const seeded = await intelReportService.createReport({ title: 'Seeded event source', content: 'Demo.', category: 'general', tags: [], sample: true });
    const written = await intelReportService.createReport({ title: 'Written event source', content: 'Seen.', category: 'general', tags: [] });
    const [fromSeeded, fromWritten] = adaptReportsToEvents([seeded, written]);
    expect(fromSeeded.isMock).toBe(true);
    expect(fromWritten.isMock).toBe(false);
  });
});
