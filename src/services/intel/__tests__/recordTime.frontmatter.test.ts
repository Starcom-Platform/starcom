import { describe, it, expect } from 'vitest';
import { frontmatterTime, markerRecordTime, nodeTimeFields } from '../recordTime';

const DAY = 86_400_000;
const fileWritten = '2026-09-14T10:00:00.000Z';

describe('frontmatterTime', () => {
  it("reads a report's stated event time from its frontmatter", () => {
    expect(frontmatterTime({ startDate: '2026-07-27T00:00:00.000Z', timePrecisionMs: DAY, timestamp: '2026-09-12T08:00:00.000Z' }, fileWritten))
      .toEqual({ basis: 'event', start: Date.parse('2026-07-27T00:00:00Z'), precisionMs: DAY });
  });

  it("reads an intel item's event date and end", () => {
    expect(frontmatterTime({ eventDate: '2026-07-01T00:00:00.000Z', eventEndDate: '2026-07-03T00:00:00.000Z' }, fileWritten))
      .toEqual({ basis: 'event', start: Date.parse('2026-07-01T00:00:00Z'), statedEnd: Date.parse('2026-07-03T00:00:00Z') });
  });

  it('falls back to when the record was written, then to when the file was', () => {
    expect(frontmatterTime({ timestamp: '2026-09-12T08:00:00.000Z' }, fileWritten))
      .toEqual({ basis: 'written', start: Date.parse('2026-09-12T08:00:00Z') });
    expect(frontmatterTime({ timestamp: 'not a date' }, fileWritten)).toEqual({ basis: 'written', start: Date.parse(fileWritten) });
    expect(frontmatterTime(undefined, undefined)).toBeNull();
  });
});

describe('nodeTimeFields', () => {
  it('gives a node its time, which time that is, and its end and precision', () => {
    expect(nodeTimeFields({ basis: 'event', start: 5, statedEnd: 9, precisionMs: 2 }))
      .toEqual({ timestamp: new Date(5), timeBasis: 'event', timeEndMs: 9, timePrecisionMs: 2 });
    expect(nodeTimeFields(null)).toEqual({});
  });
});

describe('markerRecordTime', () => {
  it("reads a node's Date as well as a marker's milliseconds", () => {
    expect(markerRecordTime({ timestamp: new Date(5), timeBasis: 'written' })).toEqual({ basis: 'written', start: 5 });
  });
});
