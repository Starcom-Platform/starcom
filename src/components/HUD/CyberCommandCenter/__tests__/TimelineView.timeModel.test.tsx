/**
 * time model: the timeline marks now at now, and labels its axis with dates.
 *
 * Decision D-E (docs/missions/01-architecture-decisions/time-model.md). Measured
 * in the running app on 2026-09-13: in live mode `CURRENT` sat at 50% of the axis
 * while now was at 97%, and across a span of more than two months the ticks read
 * `17:56, 13:51, 09:45…`, times of day at points 6.9 days apart.
 *
 * `today:` asserts what happens now; `it.fails('D-E: …')` asserts what D-E
 * requires and fails once it is true. Then delete `today:` and use `it`.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';

const DAY = 86_400_000;
const LEFT = 50;
const AXIS = 700;
const MONTHS = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;

const drawnAt: Array<{ text: string; x: number; y: number }> = [];

const withEvents = (times: number[]) => {
  const items = times.map((t, i) => ({ id: `e${i}`, title: `Event ${i}`, type: 'intel', importance: 50, startTime: new Date(t) }));
  timeline.value = {
    timelineData: { items, groups: [] },
    stats: { totalEvents: items.length, eventsByType: {}, eventsByMonth: {}, eventsImportance: { high: 0, medium: 0, low: 0 } },
    loading: false,
    error: null,
    refreshData: vi.fn(),
  };
};

const renderLive = () => render(<TemporalProvider><TimelineView /></TemporalProvider>);

let temporal: ReturnType<typeof useTemporalState> | null = null;
const Handle: React.FC = () => {
  temporal = useTemporalState();
  return null;
};

beforeEach(() => {
  localStorage.clear();
  drawnAt.length = 0;
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get: (_t, prop) => {
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

/** Where now falls on the axis the view draws: its range is the events plus 10% padding each side. */
const nowX = (first: number, last: number) => {
  const pad = Math.max((last - first) * 0.1, 3_600_000);
  const min = first - pad;
  const max = last + pad;
  return LEFT + ((Date.now() - min) / (max - min)) * AXIS;
};

const currentX = () => drawnAt.find((d) => d.text === 'CURRENT')?.x;

/** Axis labels: everything drawn except the marker, the title, event names and the range at the bottom corners. */
const axisLabels = () =>
  drawnAt
    .filter((d) => d.text !== 'CURRENT' && d.text !== 'INTELLIGENCE TIMELINE' && !/^Event \d/.test(d.text) && !/events named/.test(d.text) && !/^\d{4}-\d{2}-\d{2}$/.test(d.text))
    .map((d) => d.text);

describe('time model: TimelineView', () => {
  it('D-E: in live mode draws CURRENT where now falls on its axis', () => {
    const first = Date.now() - 30 * DAY;
    const last = Date.now() + 2 * DAY;
    withEvents([first, last]);
    renderLive();

    expect(Math.abs(currentX()! - nowX(first, last))).toBeLessThan(3);
  });

  it('D-E: labels a two-month axis with dates', () => {
    const first = Date.UTC(2026, 6, 9);
    withEvents([first, first + 69 * DAY]);
    renderLive();

    const labels = axisLabels();
    expect(labels.some((t) => /^\d{2}:\d{2}Z?$/.test(t))).toBe(false);
    expect(labels.filter((t) => MONTHS.test(t) || /\b\d{2}-\d{2}\b/.test(t)).length).toBeGreaterThanOrEqual(3);
  });

  it('pauses where the cursor is, rather than jumping to the middle of the axis', () => {
    const first = Date.now() - 30 * DAY;
    const last = Date.now() + 2 * DAY;
    withEvents([first, last]);
    render(<TemporalProvider><TimelineView /><Handle /></TemporalProvider>);

    fireEvent.click(screen.getByRole('button', { name: '⏸' }));
    expect(temporal!.isLive).toBe(false);
    expect(Math.abs(temporal!.currentTime - Date.now())).toBeLessThan(2000);
  });

  it('steps back a tenth of the axis from where the cursor is, and stays paused there', () => {
    const first = Date.now() - 30 * DAY;
    const last = Date.now() + 2 * DAY;
    withEvents([first, last]);
    render(<TemporalProvider><TimelineView /><Handle /></TemporalProvider>);

    fireEvent.click(screen.getByRole('button', { name: '◀◀' }));

    const pad = (last - first) * 0.1;
    expect(temporal!.isLive).toBe(false);
    expect(Math.abs(temporal!.currentTime - (Date.now() - 0.1 * (last - first + 2 * pad)))).toBeLessThan(60_000);
  });

  it('puts the cursor where a click lands, when the canvas is shown smaller than it is drawn', () => {
    // Measured on 2026-09-14: shown 720 wide, a click meant for x 260 put CURRENT at 234.
    const first = Date.now() - 30 * DAY;
    const last = Date.now() + 2 * DAY;
    withEvents([first, last]);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
    );
    const { container } = render(<TemporalProvider><TimelineView /><Handle /></TemporalProvider>);

    fireEvent.click(container.querySelector('canvas')!, { clientX: 400 * (260 / 800), clientY: 100 });

    const pad = (last - first) * 0.1;
    const expected = first - pad + ((260 - LEFT) / AXIS) * (last - first + 2 * pad);
    expect(temporal!.isLive).toBe(false);
    expect(Math.abs(temporal!.currentTime - expected)).toBeLessThan(60_000);
  });

  it('D-E: the scrubber and the timeline span the same dates for the same events', () => {
    // Two hours apart. The scrubber padded by at least a day and the timeline by at
    // least an hour, so the scrubber read 8 Jul – 11 Jul and the timeline 9 Jul – 10 Jul.
    const first = Date.UTC(2026, 6, 9, 23);
    withEvents([first, first + 2 * 3_600_000]);
    const { container } = render(<TemporalProvider><TimeScrubber /><TimelineView /></TemporalProvider>);

    // The scrubber's position, then its two range labels, carry a local-time title.
    const scrubberRange = within(container.firstElementChild as HTMLElement)
      .getAllByTitle(/^Local: /)
      .slice(-2)
      .map((el) => el.textContent);
    const timelineRange = drawnAt
      .filter((d) => d.y === 390 && (d.x === LEFT || d.x === LEFT + AXIS))
      .map((d) => d.text.replace(/ \d{4}$/, ''));

    expect(timelineRange).toEqual(['9 Jul', '10 Jul']);
    expect(scrubberRange).toEqual(timelineRange);
  });
});
