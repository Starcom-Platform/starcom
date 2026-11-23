/**
 * The timeline can be reached by keyboard and by hover: a card says what an event
 * is and when it happened, and choosing an event selects the axis step containing
 * its start (decision D-E, settled 2026-09-14 for step 7). The canvas had no hover,
 * no keyboard access and nothing a screen reader could read.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// jsdom has no PointerEvent, so fireEvent.pointer* sent events without clientX.
if (typeof window.PointerEvent === 'undefined') {
  // A pointer's position can fall between pixels, as it does in a browser; a click's is whole.
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      Object.defineProperty(this, 'clientX', { value: init.clientX ?? 0 });
      Object.defineProperty(this, 'clientY', { value: init.clientY ?? 0 });
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

import TimelineView from '../TimelineView';
import { PIN_RADIUS } from '../timelineMarks';
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';
import { formatUtcDateTime, localTimeTitle } from '../../../../utils/utcTime';
import { notStated } from '../../../../services/epistemic/epistemicLanguage';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Where the pins sit on the canvas, which is shown at the size it is drawn. */
const PIN_Y = 160;
const t0 = Date.UTC(2026, 6, 1, 6);
const breachStart = t0 + 10 * DAY;
const breachEnd = t0 + 11 * DAY + 6 * HOUR;

let temporal: ReturnType<typeof useTemporalState> | null = null;
const Handle: React.FC = () => {
  temporal = useTemporalState();
  return null;
};

const arcs: Array<{ x: number; radius: number }> = [];

beforeEach(() => {
  localStorage.clear();
  temporal = null;
  arcs.length = 0;
  // Given out of time order.
  const items = [
    { id: 'breach', title: 'Breach', type: 'ATTACK', color: '#c0392b', importance: 75, isEstimated: false, startTime: new Date(breachStart), endTime: new Date(breachEnd) },
    { id: 'exfil', title: 'Exfil', type: 'EXFILTRATION', color: '#d35400', importance: 80, isEstimated: false, startTime: new Date(t0 + 20 * DAY) },
    { id: 'recon', title: 'Recon', type: 'RECONNAISSANCE', color: '#f1c40f', importance: 45, isEstimated: true, startTime: new Date(t0) },
  ];
  timeline.value = {
    timelineData: { items, groups: [] },
    stats: { totalEvents: items.length, eventsByType: {}, eventsByMonth: {}, eventsImportance: { high: 0, medium: 0, low: 0 } },
    loading: false,
    error: null,
    refreshData: vi.fn(),
  };
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'clearRect') return () => { arcs.length = 0; };
      if (prop === 'arc') return (x: number, _y: number, radius: number) => { arcs.push({ x, radius }); };
      if (prop === 'measureText') return (text: unknown) => ({ width: String(text).length * 6 });
      return () => ctx;
    },
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
    { left: 0, top: 0, right: 800, bottom: 400, width: 800, height: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
  );
});

const renderTimeline = () => {
  render(<TemporalProvider><TimelineView /><Handle /></TemporalProvider>);
  return screen.getByRole('group', { name: /timeline of 3 events/i });
};
const card = () => screen.getByTestId('timeline-event-card');
const press = (el: HTMLElement, key: string) => fireEvent.keyDown(el, { key });
/** The pins' x positions, left to right: recon, breach, exfil. */
const pinXs = () => arcs.filter((a) => a.radius <= PIN_RADIUS).map((a) => a.x).sort((a, b) => a - b);

describe('TimelineView: reaching an event', () => {
  it('can be focused, and says which keys move between events', () => {
    const timelineEl = renderTimeline();
    expect(timelineEl).toHaveAttribute('tabindex', '0');
    expect(timelineEl).toHaveAccessibleName(/arrow keys/i);
    expect(timelineEl).toHaveAccessibleName(/enter/i);
    expect(card()).toBeEmptyDOMElement();
  });

  it('moves between events in time order with the arrow keys', () => {
    const timelineEl = renderTimeline();
    act(() => timelineEl.focus());

    press(timelineEl, 'ArrowRight');
    expect(card()).toHaveTextContent('Recon');
    press(timelineEl, 'ArrowRight');
    expect(card()).toHaveTextContent('Breach');
    press(timelineEl, 'ArrowRight');
    expect(card()).toHaveTextContent('Exfil');
    press(timelineEl, 'ArrowRight');
    expect(card()).toHaveTextContent('Exfil');
    press(timelineEl, 'ArrowLeft');
    expect(card()).toHaveTextContent('Breach');
  });

  it('starts from the last event when the first key is the left arrow', () => {
    const timelineEl = renderTimeline();
    act(() => timelineEl.focus());
    press(timelineEl, 'ArrowLeft');
    expect(card()).toHaveTextContent('Exfil');
  });

  it('says when an event happened in UTC, from its start to its end, with local time and how closely it is known', () => {
    const timelineEl = renderTimeline();
    act(() => timelineEl.focus());
    press(timelineEl, 'ArrowRight');
    press(timelineEl, 'ArrowRight');

    expect(card()).toHaveTextContent(`Happened: ${formatUtcDateTime(breachStart, { year: true })} – ${formatUtcDateTime(breachEnd, { year: true })}`);
    const local = screen.getByText(/^Local: /).textContent!;
    expect(local).toContain(localTimeTitle(breachStart));
    expect(local).toContain(localTimeTitle(breachEnd).replace(/^Local: /, ''));
    expect(card()).toHaveTextContent(`Known to: a day (${notStated('precision')})`);
    expect(card()).not.toHaveTextContent('Estimated');
    expect(card()).toHaveAttribute('aria-live', 'polite');
  });

  it('says an estimated event is estimated, without claiming a different width for it', () => {
    const timelineEl = renderTimeline();
    act(() => timelineEl.focus());
    press(timelineEl, 'ArrowRight');

    expect(card()).toHaveTextContent('Estimated');
    expect(card()).toHaveTextContent(`Known to: a day (${notStated('precision')})`);
  });

  it('rings the pin the card describes', () => {
    const timelineEl = renderTimeline();
    const [reconX] = pinXs();
    act(() => timelineEl.focus());
    press(timelineEl, 'ArrowRight');

    expect(arcs.some((a) => a.radius > PIN_RADIUS && Math.abs(a.x - reconX) < 0.5)).toBe(true);
  });

  it('hides the card when the timeline loses focus', () => {
    const timelineEl = renderTimeline();
    act(() => timelineEl.focus());
    press(timelineEl, 'ArrowRight');
    act(() => timelineEl.blur());
    expect(card()).toBeEmptyDOMElement();
  });

  it('selects the axis step containing the focused event’s start when Enter is pressed', () => {
    const timelineEl = renderTimeline();
    act(() => timelineEl.focus());
    press(timelineEl, 'ArrowRight');
    press(timelineEl, 'ArrowRight');
    press(timelineEl, 'Enter');

    expect(temporal!.isLive).toBe(false);
    expect(temporal!.currentTime).toBe(breachStart);
    // No data range is published without the scrubber, so the step is the UTC day.
    expect(temporal!.timeWindow!.start.getTime()).toBe(Date.UTC(2026, 6, 11));
    expect(temporal!.timeWindow!.end.getTime()).toBe(Date.UTC(2026, 6, 12));
  });

  it('shows an event’s card while a pin is hovered, and hides it when the pointer leaves', () => {
    const timelineEl = renderTimeline();
    const [, , exfilX] = pinXs();

    fireEvent.pointerMove(timelineEl, { clientX: exfilX + 3, clientY: PIN_Y + 2 });
    expect(card()).toHaveTextContent('Exfil');
    fireEvent.pointerLeave(timelineEl);
    expect(card()).toBeEmptyDOMElement();
  });

  it('selects the step containing an event’s start when its pin is clicked, not the moment under the pointer', () => {
    const timelineEl = renderTimeline();
    const [, breachX] = pinXs();

    fireEvent.click(timelineEl, { clientX: breachX + 4, clientY: PIN_Y });
    expect(temporal!.currentTime).toBe(breachStart);
  });

  it('still selects the moment clicked away from the pins', () => {
    const timelineEl = renderTimeline();
    const [, breachX] = pinXs();

    fireEvent.click(timelineEl, { clientX: breachX + 4, clientY: PIN_Y + 40 });
    expect(temporal!.currentTime).toBeGreaterThan(breachStart);
  });

  it('chooses the event its card names, where a click lands nearer a pin within a pixel of it', () => {
    // Measured in the running app on 2026-09-14: with pins about a pixel apart, the
    // card named one event and the click chose the other, because a pointer's
    // position falls between pixels and a click's is rounded.
    const firstStart = t0 + 10 * DAY;
    timeline.value = {
      ...timeline.value,
      timelineData: {
        items: [
          { id: 'edge', title: 'Edge', type: 'DETECTION', color: '#3498db', importance: 50, isEstimated: false, startTime: new Date(t0) },
          { id: 'first', title: 'First', type: 'ATTACK', color: '#c0392b', importance: 50, isEstimated: false, startTime: new Date(firstStart) },
          { id: 'second', title: 'Second', type: 'ATTACK', color: '#d35400', importance: 50, isEstimated: false, startTime: new Date(firstStart + HOUR) },
          { id: 'far', title: 'Far', type: 'DETECTION', color: '#3498db', importance: 50, isEstimated: false, startTime: new Date(t0 + 20 * DAY) },
        ],
        groups: [],
      },
    };
    render(<TemporalProvider><TimelineView /><Handle /></TemporalProvider>);
    const timelineEl = screen.getByRole('group', { name: /timeline of 4 events/i });
    const [, firstX, secondX] = pinXs();
    expect(secondX - firstX).toBeLessThan(2);
    const between = (firstX + secondX) / 2;

    fireEvent.pointerMove(timelineEl, { clientX: between - 0.2, clientY: PIN_Y });
    expect(card()).toHaveTextContent('First');
    // The click's whole pixel is nearer the second pin.
    fireEvent.click(timelineEl, { clientX: Math.ceil(between + 0.01), clientY: PIN_Y });

    expect(temporal!.currentTime).toBe(firstStart);
  });
});
