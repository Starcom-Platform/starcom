/**
 * The notes and packages a received note names (`refers`, decision D-IW) through storage and back.
 * uiToWorkspaceReportData writes an explicit field list, and IntelWeb reads the stored copy: a field
 * one side of the pair forgets is gone from IntelWeb (reportMappers.outline.test.ts says how that went).
 */
import { describe, it, expect } from 'vitest';
import { uiToWorkspaceReportData, workspaceFileToUI } from '../reportMappers';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const MJ = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: `30023:${MJ}:convergence-1`, title: 'Houthis', content: 'body', author: MJ, category: 'GEOINT',
  tags: ['nostr'], createdAt: new Date('2026-10-12T10:00:00Z'), updatedAt: new Date('2026-10-12T10:00:00Z'),
  status: 'SUBMITTED',
  ...over,
} as IntelReportUI);

const roundTrip = (ui: IntelReportUI): IntelReportUI => {
  const data = uiToWorkspaceReportData(ui);
  return workspaceFileToUI({
    path: '', filename: 'r1.intelReport', extension: '.intelReport',
    reportData: data, size: 0,
    createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '',
  } as never);
};

describe('report mappers — what a note names', () => {
  it('keeps the notes and packages a note names through storage and back', () => {
    const refers = [`30023:${MJ}:wikipedia-1`, `30079:${MJ}:ic-grant-1`];
    expect(roundTrip(report({ refers })).refers).toEqual(refers);
  });

  it('adds nothing to a note that names nothing', () => {
    expect('refers' in roundTrip(report())).toBe(false);
  });

  it('reads back only addresses: what storage holds is read, never trusted', () => {
    const data = uiToWorkspaceReportData(report());
    (data.metadata as Record<string, unknown>).refers = [`30023:${MJ}:ok`, 'javascript:alert(1)', 42];
    const back = workspaceFileToUI({ path: '', filename: 'r1.intelReport', extension: '.intelReport', reportData: data, size: 0, createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '' } as never);
    expect(back.refers).toEqual([`30023:${MJ}:ok`]);
  });
});
