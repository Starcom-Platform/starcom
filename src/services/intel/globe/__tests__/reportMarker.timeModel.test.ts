/**
 * time model: a report pin is placed in time by when the event happened.
 *
 * Decision D-E (docs/missions/01-architecture-decisions/time-model.md): a record's
 * time is its event time, falling back to record time only when none was given.
 * The globe placed a report by `updatedAt ?? createdAt`, so scrubbing to July
 * showed reports edited in July, not reports about July, although reports carry
 * `startDate`/`endDate` for exactly this.
 *
 * `today:` asserts what happens now; `it.fails('D-E: …')` asserts what D-E
 * requires and fails once it is true. Then delete `today:` and use `it`.
 */
import { describe, it, expect } from 'vitest';
import { reportToMarker } from '../reportMarker';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const happened = new Date('2026-07-27T21:24:00Z');
const edited = new Date('2026-09-12T08:00:00Z');

const report = {
  id: 'report-time-model',
  title: 'Substation fire',
  content: 'Observed from the road.',
  author: 'analyst',
  tags: [],
  latitude: 29.76,
  longitude: -95.37,
  createdAt: new Date('2026-09-10T12:00:00Z'),
  updatedAt: edited,
  startDate: happened,
  status: 'DRAFT',
} as unknown as IntelReportUI;

describe('time model: reportToMarker', () => {
  it('D-E: times the pin by when the event happened', () => {
    expect(reportToMarker(report)?.timestamp).toBe(happened.getTime());
  });

  it('says the pin was placed by its event, with the span and precision the report gives', () => {
    const marker = reportToMarker({ ...report, endDate: new Date('2026-07-29T00:00:00Z'), timePrecisionMs: 86_400_000 } as IntelReportUI);
    expect(marker?.timeBasis).toBe('event');
    expect(marker?.timeEndMs).toBe(Date.parse('2026-07-29T00:00:00Z'));
    expect(marker?.timePrecisionMs).toBe(86_400_000);
  });

  it('places a report with no stated event time by when it was written, and says so', () => {
    const marker = reportToMarker({ ...report, startDate: undefined } as IntelReportUI);
    expect(marker?.timestamp).toBe(edited.getTime());
    expect(marker?.timeBasis).toBe('written');
    expect(marker?.timeEndMs).toBeUndefined();
  });
});

describe('reportToMarker — a report with no readable time (D-F step 15)', () => {
  it('gives it no time, rather than the moment it was converted', () => {
    const marker = reportToMarker({
      id: 'r', title: 'T', content: '', author: 'a', category: 'GENERAL', tags: [],
      latitude: 1, longitude: 2, createdAt: new Date('not a date'), updatedAt: new Date('not a date'), status: 'DRAFT',
    } as never);

    expect(Number.isNaN(marker!.timestamp)).toBe(true);
    expect(marker!.timeBasis).toBeUndefined();
  });
});

describe('reportToMarker — a report with no date field at all (D-F step 15)', () => {
  /*
   * A separate path from an unreadable date: no field reaches the last branch
   * of markerTimestamp, which also returned Date.now(). A mutation restoring it
   * there survived the test above, which only covers an invalid Date.
   */
  it('gives it no time either', () => {
    const marker = reportToMarker({
      id: 'r', title: 'T', content: '', author: 'a', category: 'GENERAL', tags: [],
      latitude: 1, longitude: 2, status: 'DRAFT',
    } as never);

    expect(Number.isNaN(marker!.timestamp)).toBe(true);
  });
});

describe('reportToMarker — an unreadable date stored as a string (D-F step 15)', () => {
  /*
   * A report read back from storage can carry its dates as strings. An
   * unreadable one took the string branch, which also returned Date.now(); a
   * mutation restoring it survived until this test.
   */
  it('gives it no time', () => {
    const marker = reportToMarker({
      id: 'r', title: 'T', content: '', author: 'a', category: 'GENERAL', tags: [],
      latitude: 1, longitude: 2, status: 'DRAFT', createdAt: 'last Tuesday', updatedAt: 'last Tuesday',
    } as never);

    expect(Number.isNaN(marker!.timestamp)).toBe(true);
  });
});
