/**
 * What survives the trip to storage and back.
 *
 * uiToWorkspaceReportData writes an EXPLICIT field list, so anything it does
 * not name is dropped silently and totally. That is how a shape came to
 * survive until its report was saved and never afterwards: a network report is
 * persisted moments after it is drawn, and the globe then draws the
 * round-tripped copy. Measured against a real relay — of two reports drawn
 * together, only the one still held in memory had its outline.
 *
 * The round trip is asserted rather than the mapper's output shape, because
 * the defect was a field missing from one side of a pair.
 */
import { describe, it, expect } from 'vitest';
import { uiToWorkspaceReportData, workspaceFileToUI } from '../reportMappers';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'A district', content: 'body', author: 'a', category: 'GEOINT',
  tags: ['nostr'], latitude: 38.9072, longitude: -77.0369,
  createdAt: new Date('2026-09-20T10:00:00Z'), updatedAt: new Date('2026-09-20T10:00:00Z'),
  status: 'SUBMITTED',
  ...over,
} as IntelReportUI);

const roundTrip = (ui: IntelReportUI): IntelReportUI => {
  const data = uiToWorkspaceReportData(ui);
  // The file wrapper the workspace stores, as reportMappers.roundtrip builds it.
  return workspaceFileToUI({
    path: '', filename: 'r1.intelReport', extension: '.intelReport',
    reportData: data, size: 0,
    createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '',
  } as never);
};

describe('report mappers — the outline', () => {
  it('keeps the shape through storage and back', () => {
    const outline = {
      kind: 'polygon' as const,
      parts: [[[38.9, -77.03], [38.8, -77.02], [38.85, -77.1]] as Array<[number, number]>],
      sourceVertices: 121, keptVertices: 64,
    };
    const back = roundTrip(report({ outline }));
    expect(back.outline).toEqual(outline);
    // The coordinate is what places the report and must be unaffected.
    expect(back.latitude).toBe(38.9072);
    expect(back.longitude).toBe(-77.0369);
  });

  it('keeps the counts, so a restored shape still admits being simplified', () => {
    const back = roundTrip(report({
      outline: {
        kind: 'polygon', parts: [[[1, 2], [3, 4]]], sourceVertices: 900, keptVertices: 64,
      },
    }));
    expect(back.outline?.sourceVertices).toBe(900);
    expect(back.outline?.keptVertices).toBe(64);
  });

  it('carries no outline for a report that never had one', () => {
    expect(roundTrip(report()).outline).toBeUndefined();
  });

  it('does not invent a shape for a report with no coordinates', () => {
    const back = roundTrip(report({ latitude: undefined, longitude: undefined }));
    expect(back.outline).toBeUndefined();
    expect(back.latitude).toBeUndefined();
  });

  it('keeps stated jurisdictions through storage and back', () => {
    // The same question that `outline` failed: a field added to the UI type
    // reaches storage through a mapper that writes an explicit list.
    const back = roundTrip(report({ jurisdictions: ['us', 'us-va'] }));
    expect(back.jurisdictions).toEqual(['us', 'us-va']);
  });

  it('keeps a stated jurisdiction for a report with no coordinates', () => {
    // Nested under `geo` this would vanish — and a report that names a
    // jurisdiction without a coordinate is exactly the non-spatial class a
    // peer says is a whole category of their output.
    const back = roundTrip(report({
      latitude: undefined, longitude: undefined, jurisdictions: ['us-tx'],
    }));
    expect(back.jurisdictions).toEqual(['us-tx']);
    expect(back.latitude).toBeUndefined();
  });

  it('carries no jurisdictions for a report that stated none', () => {
    expect(roundTrip(report()).jurisdictions).toBeUndefined();
  });
});
