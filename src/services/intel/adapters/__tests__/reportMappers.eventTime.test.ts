import { describe, it, expect } from 'vitest';
import { uiToWorkspaceReportData, workspaceFileToUI } from '../reportMappers';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const ui = (over: Partial<IntelReportUI>): IntelReportUI => ({
  id: 'm1', title: 'T', content: 'C', author: 'a', category: 'GENERAL', tags: [],
  createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT', ...over,
});
const fileOf = (data: ReturnType<typeof uiToWorkspaceReportData>) =>
  ({ path: '', filename: 'm1.intelReport', extension: '.intelReport', reportData: data, size: 0, createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '' }) as never;

describe('reportMappers: how closely the event time is known', () => {
  it('keeps timePrecisionMs through storage', () => {
    const start = new Date('2026-07-27T00:00:00.000Z');
    const back = workspaceFileToUI(fileOf(uiToWorkspaceReportData(ui({ startDate: start, timePrecisionMs: 86_400_000 }))));
    expect(back.startDate?.toISOString()).toBe(start.toISOString());
    expect(back.timePrecisionMs).toBe(86_400_000);
  });

  it('reads a stored precision that is not a positive number as not stated', () => {
    for (const bad of [0, -5, 'a day', null]) {
      const data = uiToWorkspaceReportData(ui({}));
      (data.metadata as Record<string, unknown>).timePrecisionMs = bad;
      expect(workspaceFileToUI(fileOf(data)).timePrecisionMs).toBeUndefined();
    }
  });
});
