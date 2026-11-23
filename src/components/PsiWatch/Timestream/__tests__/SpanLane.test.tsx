/**
 * A lane of spans (decision D-PW, PW42, PW52), as the notes' windows and alerts draw: a click on a window opens it
 * and puts the shared cursor on its peak; an alert, which has none, on its start.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SpanLane, { SPAN_ROW_PX, type PlacedSpan } from '../SpanLane';

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 1);
const view = { startMs: START, spanMs: 10 * DAY };
// 1000 px over ten days: a day is 100 px.
const lane = (placed: PlacedSpan[], onSeek = vi.fn()) => {
  render(<SpanLane placed={placed} hidden={0} rows={2} view={view} width={1000} onSeek={onSeek} testId="lane" cardTestId="card" />);
  const el = screen.getByTestId('lane');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 30, right: 1000, bottom: 30, x: 0, y: 0, toJSON: () => ({}) });
  return { el, onSeek };
};

describe('SpanLane', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('opens a window at its peak and an alert at its start, each with its own words', () => {
    const window: PlacedSpan = { row: 0, item: {
      key: 'w', fromMs: START + DAY, untilMs: START + 3 * DAY, peakMs: START + 2 * DAY, colour: '#000000',
      weightAt: () => 0.5, label: 'Last Quarter', title: 'Last Quarter, peak 3 Nov', detail: 'Open 2 Nov to 4 Nov',
    } };
    const alert: PlacedSpan = { row: 1, item: { key: 'a', fromMs: START + 5 * DAY, untilMs: START + 6 * DAY, colour: '#000000', label: 'Alert', title: 'Alert' } };
    const { el, onSeek } = lane([window, alert]);
    act(() => { fireEvent.click(el, { clientX: 150, clientY: 4 }); });
    expect(onSeek).toHaveBeenLastCalledWith(window.item.peakMs);
    expect(screen.getByTestId('card').textContent).toContain('Open 2 Nov to 4 Nov');
    act(() => { fireEvent.click(el, { clientX: 550, clientY: 1 + SPAN_ROW_PX + 4 }); });
    expect(onSeek).toHaveBeenLastCalledWith(alert.item.fromMs);
    expect(screen.getByTestId('card').getAttribute('aria-label')).toBe('Alert');
  });
});

describe('SpanLane\'s card action', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('offers its button on the spans it is for, and runs it with the span\'s key (PW69)', () => {
    const run = vi.fn();
    const spans: PlacedSpan[] = [
      { row: 0, item: { key: 'echoed', fromMs: START + DAY, untilMs: START + 3 * DAY, peakMs: START + 2 * DAY, colour: '#000000', label: 'A', title: 'A' } },
      { row: 0, item: { key: 'plain', fromMs: START + 5 * DAY, untilMs: START + 6 * DAY, peakMs: START + 5.5 * DAY, colour: '#000000', label: 'B', title: 'B' } },
    ];
    render(<SpanLane placed={spans} hidden={0} rows={1} view={view} width={1000} testId="lane" cardTestId="card"
      actions={[{ label: 'Echoes', offers: (key) => key === 'echoed', run }]} />);
    const el = screen.getByTestId('lane');
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 30, right: 1000, bottom: 30, x: 0, y: 0, toJSON: () => ({}) });
    act(() => { fireEvent.click(el, { clientX: 550, clientY: 4 }); });
    expect(screen.queryByRole('button', { name: 'Echoes' })).toBeNull();
    act(() => { fireEvent.click(el, { clientX: 150, clientY: 4 }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Echoes' })); });
    expect(run).toHaveBeenCalledWith('echoed');
    expect(screen.queryByTestId('card')).toBeNull();
  });
});
