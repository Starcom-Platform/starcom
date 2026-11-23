/**
 * time model: IntelAnalyzer places records by when the event happened.
 *
 * Decision D-E (docs/missions/01-architecture-decisions/time-model.md): a record's
 * time is its event time, falling back to record time only when none was given.
 * The analyzer's timeline, histogram and time filter all used
 * `updatedAt ?? createdAt`, for reports and items alike.
 *
 * `today:` asserts what happens now; `it.fails('D-E: …')` asserts what D-E
 * requires and fails once it is true. Then delete `today:` and use `it`.
 */
import { describe, it, expect } from 'vitest';
import { adaptReportsToEvents, adaptIntelItemsToEvents } from '../eventsAdapter';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import type { IntelItemUI } from '../../../../types/intel/IntelItemUI';

const happened = '2026-07-27T21:24:00.000Z';
const edited = new Date('2026-09-12T08:00:00Z');

const report = {
  id: 'r-time', title: 'Substation fire', category: 'INFRASTRUCTURE', tags: [], latitude: 29.76, longitude: -95.37,
  confidence: 0.6, author: 'analyst', entityRefs: [],
  createdAt: new Date('2026-09-10T12:00:00Z'), updatedAt: edited, startDate: new Date(happened),
} as unknown as IntelReportUI;

const item = {
  id: 'i-time', title: 'Port scan', categories: ['CYBER'], tags: [], latitude: 1, longitude: 2,
  confidence: 0.5, source: 'osint',
  createdAt: new Date('2026-09-10T12:00:00Z'), updatedAt: edited, eventDate: happened,
} as unknown as IntelItemUI;

describe('time model: eventsAdapter', () => {
  it('D-E: times a report by when the event happened', () => {
    expect(adaptReportsToEvents([report])[0].timestamp).toBe(happened);
  });

  it('D-E: times an intel item by when the event happened', () => {
    expect(adaptIntelItemsToEvents([item])[0].timestamp).toBe(happened);
  });

  it('says which time placed each event, with the span and precision its record gives', () => {
    const [dated] = adaptReportsToEvents([{ ...report, endDate: new Date('2026-07-29T00:00:00Z'), timePrecisionMs: 86_400_000 } as IntelReportUI]);
    expect(dated.timeBasis).toBe('event');
    expect(dated.timeEndMs).toBe(Date.parse('2026-07-29T00:00:00Z'));
    expect(dated.timePrecisionMs).toBe(86_400_000);
  });

  it('places a record with no stated event time by when it was written, and says so', () => {
    const [undatedReport] = adaptReportsToEvents([{ ...report, startDate: undefined } as IntelReportUI]);
    expect(undatedReport.timestamp).toBe(edited.toISOString());
    expect(undatedReport.timeBasis).toBe('written');

    const [undatedItem] = adaptIntelItemsToEvents([{ ...item, eventDate: undefined } as IntelItemUI]);
    expect(undatedItem.timestamp).toBe(edited.toISOString());
    expect(undatedItem.timeBasis).toBe('written');
  });
});
