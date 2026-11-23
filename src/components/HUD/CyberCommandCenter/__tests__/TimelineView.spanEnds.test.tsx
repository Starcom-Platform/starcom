/**
 * The timeline and the scrubber share one span, and it runs to the last end, so a
 * bar is not cut off at the timeline's edge and the two views still agree
 * (decision D-E, settled 2026-09-14 for step 7).
 */
import React from 'react';
import { render, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const timeline = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('../../../../core/intel/hooks/useTimelineData', () => ({
  useTimelineData: () => timeline.value,
}));
vi.mock('../../../../hooks/useUnifiedGlobalCommand', () => ({
  useGlobalCommand: () => ({ state: { enhanced: {} } }),
}));
// The scrubber reads the same hook through the core/intel index.
vi.mock('../../../../core/intel', () => ({
  useTimelineData: () => timeline.value,
}));

import TimelineView from '../TimelineView';
import TimeScrubber from '../../TimeScrubber/TimeScrubber';
import { TemporalProvider } from '../../../../context/TemporalContext';

const DAY = 86_400_000;
const drawnAt: Array<{ text: string; x: number; y: number }> = [];

beforeEach(() => {
  localStorage.clear();
  drawnAt.length = 0;
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'clearRect') return () => { drawnAt.length = 0; };
      if (prop === 'fillText') {
        return (text: unknown, x: unknown, y: unknown) => { drawnAt.push({ text: String(text), x: Number(x), y: Number(y) }); };
      }
      if (prop === 'measureText') return (text: unknown) => ({ width: String(text).length * 6 });
      return () => ctx;
    },
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});

describe('TimelineView: a span that ends after the last start', () => {
  it('D-E: the timeline and the scrubber both run past it, and still agree', () => {
    const first = Date.UTC(2026, 6, 9, 12);
    const items = [
      { id: 'a', title: 'Campaign', type: 'ATTACK', importance: 50, isEstimated: false, startTime: new Date(first), endTime: new Date(first + 30 * DAY) },
      { id: 'b', title: 'Alert', type: 'DETECTION', importance: 50, isEstimated: false, startTime: new Date(first + 10 * DAY) },
    ];
    timeline.value = {
      timelineData: { items, groups: [] },
      stats: { totalEvents: items.length, eventsByType: {}, eventsByMonth: {}, eventsImportance: { high: 0, medium: 0, low: 0 } },
      loading: false,
      error: null,
      refreshData: vi.fn(),
    };
    const { container } = render(<TemporalProvider><TimeScrubber /><TimelineView /></TemporalProvider>);

    // The span is 9 Jul 12:00Z to 8 Aug 12:00Z, with three days each side.
    const timelineRange = drawnAt
      .filter((d) => d.y === 390 && (d.x === 50 || d.x === 750))
      .map((d) => d.text.replace(/ \d{4}$/, ''));
    const scrubberRange = within(container.firstElementChild as HTMLElement)
      .getAllByTitle(/^Local: /)
      .slice(-2)
      .map((el) => el.textContent);

    expect(timelineRange).toEqual(['6 Jul', '11 Aug']);
    expect(scrubberRange).toEqual(timelineRange);
  });
});
