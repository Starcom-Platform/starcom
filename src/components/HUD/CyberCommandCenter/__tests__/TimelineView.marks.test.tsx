/**
 * The timeline draws each event in its type's colour, with a bar to its end, and
 * a rough or estimated time as a hollow pin (decision D-E, settled 2026-09-14 for
 * step 7). Every event was a white pin at its start: the view's colour table was
 * keyed by types no timeline item has.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const timeline = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('../../../../core/intel/hooks/useTimelineData', () => ({
  useTimelineData: () => timeline.value,
}));
vi.mock('../../../../hooks/useUnifiedGlobalCommand', () => ({
  useGlobalCommand: () => ({ state: { enhanced: {} } }),
}));

import TimelineView from '../TimelineView';
import { PIN_RADIUS } from '../timelineMarks';
import { TemporalProvider } from '../../../../context/TemporalContext';

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 6, 1, 6);
const RED = '#c0392b';
const BLUE = '#3498db';

interface Call { op: string; args: number[]; fill: unknown; stroke: unknown; alpha: unknown }
const calls: Call[] = [];

beforeEach(() => {
  calls.length = 0;
  const state: Record<string, unknown> = { fillStyle: '', strokeStyle: '', globalAlpha: 1 };
  const recorded = new Set(['fillRect', 'arc', 'fill', 'stroke', 'moveTo']);
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get: (_t, prop) => {
      if (typeof prop === 'string' && prop in state) return state[prop];
      // Each redraw starts by clearing, so the record holds the latest frame.
      if (prop === 'clearRect') return () => { calls.length = 0; };
      if (prop === 'measureText') return (text: unknown) => ({ width: String(text).length * 6 });
      if (typeof prop === 'string' && recorded.has(prop)) {
        return (...args: number[]) => {
          calls.push({ op: prop, args, fill: state.fillStyle, stroke: state.strokeStyle, alpha: state.globalAlpha });
        };
      }
      return () => ctx;
    },
    set: (_t, prop, value) => {
      if (typeof prop === 'string') state[prop] = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});

const withItems = (items: Array<Record<string, unknown>>) => {
  timeline.value = {
    timelineData: { items: items.map((item, i) => ({ id: `e${i}`, title: `Event ${i}`, type: 'ATTACK', importance: 50, isEstimated: false, ...item })), groups: [] },
    stats: { totalEvents: items.length, eventsByType: {}, eventsByMonth: {}, eventsImportance: { high: 0, medium: 0, low: 0 } },
    loading: false,
    error: null,
    refreshData: vi.fn(),
  };
  render(<TemporalProvider><TimelineView /></TemporalProvider>);
};

/** Each pin drawn, left to right: where, what filled it, and what outlined it. */
const pins = () =>
  calls
    .flatMap((c, i) => {
      if (c.op !== 'arc' || c.args[2] > PIN_RADIUS) return [];
      const rest = calls.slice(i + 1);
      const next = rest.findIndex((d) => d.op === 'arc' || d.op === 'moveTo');
      const own = next < 0 ? rest : rest.slice(0, next);
      return [{ x: c.args[0], filled: own.find((d) => d.op === 'fill')?.fill, outlined: own.find((d) => d.op === 'stroke')?.stroke }];
    })
    .sort((a, b) => a.x - b.x);

describe('TimelineView: how an event is drawn', () => {
  it('draws each pin in its event’s colour', () => {
    withItems([{ startTime: new Date(t0), color: RED }, { startTime: new Date(t0 + 60 * DAY), color: BLUE }]);

    expect(pins().map((p) => p.filled)).toEqual([RED, BLUE]);
    expect(pins().every((p) => p.outlined === undefined)).toBe(true);
  });

  it('does not draw an item whose start cannot be read', () => {
    // It was drawn at now when it had no start, so the axis here runs across now.
    withItems([
      { startTime: new Date(Number.NaN), color: RED },
      { startTime: new Date(Date.now() - 30 * DAY), color: BLUE },
      { startTime: new Date(Date.now() + 30 * DAY), color: BLUE },
    ]);

    expect(pins().map((p) => p.filled)).toEqual([BLUE, BLUE]);
  });

  it('draws an event with an end as a bar in its colour, from its start to its end', () => {
    withItems([
      { startTime: new Date(t0), endTime: new Date(t0 + 3 * DAY), color: RED },
      { startTime: new Date(t0 + 60 * DAY), color: BLUE },
    ]);

    const [a, b] = pins();
    const bar = calls.find((c) => c.op === 'fillRect' && c.fill === RED)!;
    expect(bar).toBeDefined();
    expect(bar.args[0]).toBeCloseTo(a.x, 0);
    expect(bar.args[2]).toBeCloseTo(((b.x - a.x) * 3) / 60, 0);
    expect(bar.alpha).toBe(1);
  });

  it('draws an estimated event as a hollow pin outlined in its colour', () => {
    withItems([{ startTime: new Date(t0), color: RED, isEstimated: true }, { startTime: new Date(t0 + 60 * DAY), color: BLUE }]);

    const [estimated, stated] = pins();
    expect(estimated.outlined).toBe(RED);
    expect(estimated.filled).not.toBe(RED);
    expect(stated.filled).toBe(BLUE);
    // No width was stated for the estimate, so no window is drawn for it.
    expect(calls.some((c) => c.op === 'fillRect' && c.fill === RED)).toBe(false);
  });

  it('draws a time rough at this zoom as a faint window from the time, behind a hollow pin', () => {
    // Ten days apart: a day is wider than the pin on this axis.
    withItems([{ startTime: new Date(t0), color: RED }, { startTime: new Date(t0 + 10 * DAY), color: BLUE }]);

    const [a, b] = pins();
    const dayPx = (b.x - a.x) / 10;
    expect(dayPx).toBeGreaterThan(2 * PIN_RADIUS);
    const window = calls.find((c) => c.op === 'fillRect' && c.fill === RED)!;
    expect(window).toBeDefined();
    expect(window.args[0]).toBeCloseTo(a.x, 0);
    expect(window.args[2]).toBeCloseTo(dayPx, 0);
    expect(Number(window.alpha)).toBeLessThan(1);
    expect(a.outlined).toBe(RED);
  });
});
