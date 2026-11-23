/**
 * A network report comes back from storage saying what it said when it arrived
 * (decision D-F, section 18, item 3; decision D-E).
 *
 * The globe draws the stored copy, not the one the intake produced. Two things
 * were lost on that trip, found by reading a card of Mecha Jono's Newark, DE
 * report on 2026-09-25:
 *
 *  - Its precision. The mapper writes a named list of fields, so `geoPrecisionM`
 *    — "city", on every one of their jurisdiction reports — was dropped, and the
 *    card said "precision not stated". The same trap its comment records for the
 *    outline.
 *  - When it was written. importReport stamped `updatedAt` with the moment of
 *    import, and the written-time fallback reads `updatedAt` first, so a report
 *    written at 19:37 said "Written 22:37" and sat on the timeline at 22:37.
 *    Importing is not editing; when this device received it is already recorded,
 *    as the IMPORTED history entry.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { uiToWorkspaceReportData, workspaceFileToUI } from '../adapters/reportMappers';
import { intelReportService } from '../IntelReportService';
import { intelWorkspaceManager } from '../IntelWorkspaceManager';
import { reportToMarker } from '../globe/reportMarker';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const WRITTEN = new Date('2026-09-25T19:37:32.000Z');

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: `r-${Math.random().toString(36).slice(2, 9)}`, title: '5 charities in Newark, DE lost their exemption',
  content: 'body', author: 'a'.repeat(64), category: 'GEOINT',
  tags: ['nostr', 'relay:wss://record.cosmiccodex.app'], latitude: 39.68284, longitude: -75.75157,
  geoPrecisionM: 10_000, createdAt: WRITTEN, updatedAt: WRITTEN, status: 'SUBMITTED', version: 1,
  manualSummary: false, history: [],
  ...over,
} as IntelReportUI);

describe('the stored copy of a network report', () => {
  beforeEach(async () => { await intelWorkspaceManager.ensureInitialized(); });

  it('keeps how precisely it was placed, through storage and back', () => {
    const data = uiToWorkspaceReportData(report());
    const back = workspaceFileToUI({
      path: '', filename: 'r.intelReport', extension: '.intelReport', reportData: data, size: 0,
      createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '',
    } as never);
    expect(back.geoPrecisionM).toBe(10_000);
  });

  it('carries no precision back when none went in, rather than a default', () => {
    const data = uiToWorkspaceReportData(report({ geoPrecisionM: undefined }));
    const back = workspaceFileToUI({ reportData: data, createdAt: data.createdAt, modifiedAt: data.modifiedAt } as never);
    expect(back.geoPrecisionM).toBeUndefined();
  });

  it('keeps when its author wrote it through an import, and records the import separately', async () => {
    const imported = (await intelReportService.importReport(report(), { strategy: 'newId' }))!;
    expect(imported.updatedAt.toISOString()).toBe(WRITTEN.toISOString());
    expect(imported.history.at(-1)?.action).toBe('IMPORTED');
    // What the globe and the card read: written at 19:37, not received at import.
    const marker = reportToMarker(imported)!;
    expect(new Date(marker.timestamp).toISOString()).toBe(WRITTEN.toISOString());
    expect(marker.geoPrecisionM).toBe(10_000);
  });
});
