/**
 * How serious a report is, on one scale (plan item 1.9, story S7).
 *
 * "Edit has Priority: ROUTINE, PRIORITY or IMMEDIATE. The globe draws a report
 * as critical, actionable, standard or raw, taken first from a hashtag like
 * `#critical` that she cannot know to type. Cases use LOW, MEDIUM, HIGH or
 * CRITICAL. That is three vocabularies on screen for one idea."
 *
 * Reports now use the Cases' scale. A report nobody assessed says so, rather
 * than being stored as ROUTINE; older reports are read onto the scale; and the
 * globe draws what was stated before it guesses from tags. What the form writes
 * about a place, jurisdictions and precision, is kept, where it was dropped.
 *
 * Real persistence, as in the workspace suites.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect } from 'vitest';
import { intelReportService } from '../IntelReportService';
import { intelWorkspaceManager } from '../IntelWorkspaceManager';
import { parseReport, serializeReport } from '../serialization/intelReportSerialization';
import { reportToMarker } from '../globe/reportMarker';
import { intelVariantOf } from '../../../components/Globe/intelVariant';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const input = { content: 'Seen at the bridge.', category: 'general', tags: [] as string[] };

describe('one scale for how serious a report is', () => {
  it('keeps the severity the author gave, on the Cases scale', async () => {
    const report = await intelReportService.createReport({ ...input, title: 'Bridge closed', priority: 'HIGH' });
    expect((await intelReportService.getReport(report.id))?.priority).toBe('HIGH');
  });

  it('says a report nobody assessed is not assessed, instead of storing ROUTINE', async () => {
    const report = await intelReportService.createReport({ ...input, title: 'Not assessed' });
    expect((await intelReportService.getReport(report.id))?.priority).toBeUndefined();
  });

  it('reads the old words onto the scale', async () => {
    for (const [old, now] of [['IMMEDIATE', 'CRITICAL'], ['PRIORITY', 'HIGH'], ['ROUTINE', 'LOW']] as const) {
      const report = await intelReportService.createReport({ ...input, title: `Old ${old}` });
      const stored = intelWorkspaceManager.getReports().find((r) => r.id === report.id)!;
      await intelWorkspaceManager.updateReport({ ...stored, priority: old } as never);
      expect((await intelReportService.getReport(report.id))?.priority).toBe(now);
    }
  });

  it('reads an old export onto the scale', () => {
    const exported = serializeReport({ ...input, id: 'r-old', title: 'Exported', author: 'a', createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT', priority: 'IMMEDIATE' as never } as IntelReportUI);
    expect(parseReport(exported).report?.priority).toBe('CRITICAL');
  });
});

describe('the globe draws what was stated', () => {
  const at = (over: Partial<IntelReportUI>) => reportToMarker({
    ...input, id: 'r1', title: 'On the globe', author: 'a', createdAt: new Date(), updatedAt: new Date(),
    status: 'DRAFT', latitude: 40.7, longitude: -74.2, ...over,
  } as IntelReportUI)!;

  it('as critical when the author said Critical, with no tag to guess from', () => {
    expect(intelVariantOf(at({ priority: 'CRITICAL' }))).toBe('critical');
  });

  it('as assessed for High, and as not assessed when nobody said', () => {
    expect(intelVariantOf(at({ priority: 'HIGH' }))).toBe('standard');
    expect(intelVariantOf(at({}))).toBe('raw');
  });

  it("still reads a peer's hashtag when there is no stated value", () => {
    expect(intelVariantOf(at({ tags: ['critical'] }))).toBe('critical');
  });
});

describe('what the form writes about a place', () => {
  it('is kept: jurisdictions, how precisely it was placed, and the entities named', async () => {
    const report = await intelReportService.createReport({
      ...input, title: 'Placed', latitude: 40.7, longitude: -74.2,
      jurisdictions: ['us', 'us-nj'], geoPrecisionM: 1000, entityRefs: ['Newark food bank network'],
    });
    const back = (await intelReportService.getReport(report.id))!;
    expect(back.jurisdictions).toEqual(['us', 'us-nj']);
    expect(back.geoPrecisionM).toBe(1000);
    expect(back.entityRefs).toEqual(['Newark food bank network']);
  });
});
