/**
 * A report read from a relay keeps the version it was read at through storage,
 * and so does its globe mark: a review is pinned to that version (plan item 5.1).
 */
import { describe, it, expect } from 'vitest';
import { uiToWorkspaceReportData, workspaceFileToUI } from '../reportMappers';
import { reportToMarker } from '../../globe/reportMarker';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const report = {
  id: `30023:${'a'.repeat(64)}:intel-1`, title: 'Berth 4 cranes at night', content: 'body', author: 'a'.repeat(64), category: 'GEOINT',
  tags: ['nostr', 'relay:wss://r.example'], latitude: 38.9, longitude: -77.0,
  createdAt: new Date('2026-09-20T10:00:00Z'), updatedAt: new Date('2026-09-20T10:00:00Z'), status: 'SUBMITTED',
  nostrEventId: 'e'.repeat(64), nostrKind: 30023,
} as IntelReportUI;

describe('the version a report was read at', () => {
  it('survives storage and back', () => {
    const data = uiToWorkspaceReportData(report);
    const back = workspaceFileToUI({
      path: '', filename: 'r.intelReport', extension: '.intelReport', reportData: data, size: 0,
      createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '',
    } as never);
    expect(back).toMatchObject({ nostrEventId: 'e'.repeat(64), nostrKind: 30023 });
  });

  it('is on its globe mark', () => {
    expect(reportToMarker(report)).toMatchObject({ nostrEventId: 'e'.repeat(64), nostrKind: 30023 });
  });
});
