/**
 * The timeline selects a window by dragging, and draws the selected window as a
 * band (decision D-E, settled 2026-09-14).
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// jsdom has no PointerEvent, so fireEvent.pointer* sent events without clientX.
if (typeof window.PointerEvent === 'undefined') {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
}

const timeline = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('../../../../core/intel/hooks/useTimelineData', () => ({
  useTimelineData: () => timeline.value,
}));
vi.mock('../../../../hooks/useUnifiedGlobalCommand', () => ({
  useGlobalCommand: () => ({ state: { enhanced: {} } }),
}));

import TimelineView, { WINDOW_BAND_FILL } from '../TimelineView';
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';

const DAY = 86_400_000;
const MINUTE = 60_000;
const LEFT = 50;
const AXIS = 700;
const first = Date.UTC(2026, 6, 1);
const last = Date.UTC(2026, 7, 31);
const pad = (last - first) * 0.1;
const min = first - pad;
const range = last - first + 2 * pad;
const timeAt = (fraction: number) => min + fraction * range;
const clientXAt = (fraction: number) => LEFT + fraction * AXIS;

let temporal: ReturnType<typeof useTemporalState> | null = null;
const Handle: React.FC = () => {
  temporal = useTemporalState();
  return null;
};

const rects: Array<{ x: number; width: number; fill: unknown }> = [];

beforeEach(() => {
  localStorage.clear();
  temporal = null;
  rects.length = 0;
  const items = [first, last].map((t, i) => ({ id: `e${i}`, title: `Event ${i}`, type: 'intel', importance: 50, startTime: new Date(t) }));
  timeline.value = {
    timelineData: { items, groups: [] },
    stats: { totalEvents: items.length, eventsByType: {}, eventsByMonth: {}, eventsImportance: { high: 0, medium: 0, low: 0 } },
    loading: false,
    error: null,
    refreshData: vi.fn(),
  };
  let fill: unknown = null;
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'fillRect') return (x: number, _y: number, width: number) => { rects.push({ x, width, fill }); };
      if (prop === 'measureText') return (text: unknown) => ({ width: String(text).length * 6 });
      return () => ctx;
    },
    set: (_t, prop, value) => {
      if (prop === 'fillStyle') fill = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  // Shown at the size it is drawn, so client pixels are canvas pixels.
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
    { left: 0, top: 0, right: 800, bottom: 400, width: 800, height: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
  );
});

const renderTimeline = () => render(<TemporalProvider><TimelineView /><Handle /></TemporalProvider>);

describe('TimelineView: the selected window', () => {
  it('selects the window a drag covers, and ignores the click that ends the drag', () => {
    const { container } = renderTimeline();
    const canvas = container.querySelector('canvas')!;

    fireEvent.pointerDown(canvas, { clientX: clientXAt(0.2), pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: clientXAt(0.35), pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: clientXAt(0.5), pointerId: 1 });
    fireEvent.click(canvas, { clientX: clientXAt(0.5) });

    const w = temporal!.timeWindow!;
    expect(temporal!.isLive).toBe(false);
    expect(Math.abs(w.start.getTime() - timeAt(0.2))).toBeLessThan(MINUTE);
    expect(Math.abs(w.end.getTime() - timeAt(0.5))).toBeLessThan(MINUTE);
  });

  it('treats a press that barely moves as a click, selecting the step containing it', () => {
    const { container } = renderTimeline();
    const canvas = container.querySelector('canvas')!;

    fireEvent.pointerDown(canvas, { clientX: clientXAt(0.3), pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: clientXAt(0.3) + 2, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: clientXAt(0.3) + 2, pointerId: 1 });
    fireEvent.click(canvas, { clientX: clientXAt(0.3) });

    const w = temporal!.timeWindow!;
    // No data range is published without the scrubber, so the step is the UTC day.
    expect(w.end.getTime() - w.start.getTime()).toBe(DAY);
    expect(w.start.getTime()).toBeLessThanOrEqual(timeAt(0.3));
    expect(w.end.getTime()).toBeGreaterThan(timeAt(0.3));
  });

  it('draws the selected window as a band where it falls on the axis', () => {
    renderTimeline();
    act(() => temporal!.setTimeWindow(timeAt(0.4), timeAt(0.6)));

    const band = rects.filter((r) => r.fill === WINDOW_BAND_FILL).at(-1)!;
    expect(band).toBeDefined();
    expect(Math.abs(band.x - clientXAt(0.4))).toBeLessThan(1);
    expect(Math.abs(band.x + band.width - clientXAt(0.6))).toBeLessThan(1);
  });

  it('draws no band while live', () => {
    renderTimeline();
    expect(rects.some((r) => r.fill === WINDOW_BAND_FILL)).toBe(false);
  });
});
