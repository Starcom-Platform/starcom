/**
 * A sample event with an end ends 1 to 72 hours after the start it records. The
 * end was worked out from a separate random start, up to 30 days away, so the
 * sample timeline drew events meant to last hours as bars of 12 or 20 days, and
 * dropped the ends that fell before their start.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateSampleTimelineEvent } from '../timelineDataGenerator';

const HOUR = 3_600_000;
const start = '2026-07-22T10:30:00.000Z';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateSampleTimelineEvent', () => {
  it('ends an event 1 to 72 hours after the start it records', () => {
    // 0.9 gives an end (above 0.7) 65 hours long, and a random start 24 days from the base.
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const event = generateSampleTimelineEvent(1, new Date(start), { startDate: start });

    expect(event.startDate).toBe(start);
    expect(Date.parse(event.endDate!) - Date.parse(start)).toBe(65 * HOUR);
  });

  it('keeps an end it is given', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const event = generateSampleTimelineEvent(1, new Date(start), { startDate: start, endDate: '2026-07-25T00:00:00.000Z' });

    expect(event.endDate).toBe('2026-07-25T00:00:00.000Z');
  });

  it('gives an event no end most of the time', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(generateSampleTimelineEvent(1, new Date(start), { startDate: start }).endDate).toBeUndefined();
  });
});
