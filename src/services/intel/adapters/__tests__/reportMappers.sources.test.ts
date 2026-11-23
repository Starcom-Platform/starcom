/**
 * A received note's sources (`sourceLinks`, decision D-CT, CT2) through storage and back. The globe
 * draws the stored copy moments after a note arrives, so a field the mapper forgets is gone from
 * the popup's Sources (reportMappers.outline.test.ts says how that went for shapes).
 */
import { describe, it, expect } from 'vitest';
import { uiToWorkspaceReportData, workspaceFileToUI } from '../reportMappers';
import { reportToMarker } from '../../globe/reportMarker';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'note-1', title: 'A designation', content: 'body', author: 'b'.repeat(64), category: 'GEOINT',
  tags: ['nostr'], createdAt: new Date('2026-10-16T10:00:00Z'), updatedAt: new Date('2026-10-16T10:00:00Z'),
  status: 'SUBMITTED', latitude: 1, longitude: 2,
  ...over,
} as IntelReportUI);

const fileOf = (data: ReturnType<typeof uiToWorkspaceReportData>) => ({
  path: '', filename: 'r1.intelReport', extension: '.intelReport',
  reportData: data, size: 0, createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '',
}) as never;

describe('report mappers — where a note was published', () => {
  const sourceLinks = ['https://ofac.treasury.gov/recent-actions/x', 'https://www.federalregister.gov/d/y'];

  it('keeps its sources, in order, through storage and back, and onto its marker', () => {
    const back = workspaceFileToUI(fileOf(uiToWorkspaceReportData(report({ sourceLinks }))));
    expect(back.sourceLinks).toEqual(sourceLinks);
    expect(reportToMarker(back)?.sourceLinks).toEqual(sourceLinks);
  });

  it('adds nothing to a note that names no source', () => {
    const back = workspaceFileToUI(fileOf(uiToWorkspaceReportData(report())));
    expect('sourceLinks' in back).toBe(false);
    expect('sourceLinks' in (reportToMarker(back) ?? {})).toBe(false);
  });

  it('reads back only safe links: what storage holds is read, never trusted', () => {
    const data = uiToWorkspaceReportData(report());
    (data.metadata as Record<string, unknown>).sourceLinks = ['javascript:alert(1)', sourceLinks[0], 42, 'data:text/html,x'];
    expect(workspaceFileToUI(fileOf(data)).sourceLinks).toEqual([sourceLinks[0]]);
  });
});
