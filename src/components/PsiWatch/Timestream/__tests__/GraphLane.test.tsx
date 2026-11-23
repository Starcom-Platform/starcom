/**
 * A graph lane (decision D-PW, PW45, PW51): a hover reads the column under the pointer, a click puts the shared
 * cursor where it lands.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import GraphLane, { laneBounds } from '../GraphLane';

const DAY = 86_400_000;
const view = { startMs: Date.UTC(2026, 10, 1), spanMs: 10 * DAY };
const series = { mean: new Float32Array([40, 50, 60, 70]), min: new Float32Array([35, 45, 55, 65]), max: new Float32Array([45, 55, 65, 75]) };
// jsdom has no PointerEvent: a mouse event of the pointer's type carries the place.
const pointer = (el: HTMLElement, type: string, clientX: number) => act(() => { fireEvent(el, new MouseEvent(type, { clientX, bubbles: true })); });

describe('GraphLane', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('reads the column under the pointer, its time last, and seeks where a click lands', () => {
    const onSeek = vi.fn();
    const readout = vi.fn((col: number) => [`Value ${series.mean[col]}`, 'its time']);
    render(<GraphLane series={series} samples={4} drawnView={view} view={view} width={400} floor={0} ceiling={100} leastSpan={12} marks={[50]}
      colour="currentColor" readout={readout} onSeek={onSeek} testId="graph" />);
    const lane = screen.getByTestId('graph');
    lane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 30, right: 400, bottom: 30, x: 0, y: 0, toJSON: () => ({}) });
    pointer(lane, 'pointermove', 250);
    expect(readout).toHaveBeenLastCalledWith(2);
    expect(screen.getByTestId('graph-readout').textContent).toBe('Value 60its time');
    act(() => { fireEvent.click(lane, { clientX: 100 }); });
    expect(onSeek).toHaveBeenLastCalledWith(view.startMs + 2.5 * DAY);
    act(() => { fireEvent.pointerLeave(lane); });
    expect(screen.queryByTestId('graph-readout')).toBeNull();
  });

  it('spans what the view shows, never less than its least span, inside its floor and ceiling', () => {
    expect(laneBounds(series, view, view, 0, 100, 12)).toEqual([35 - 40 * 0.075, 75 + 40 * 0.075]);
    const flat = { mean: new Float32Array([50, 50]), min: new Float32Array([49, 49]), max: new Float32Array([51, 51]) };
    expect(laneBounds(flat, view, view, 0, 100, 12)).toEqual([44, 56]);
    const low = { mean: new Float32Array([1, 2]), min: new Float32Array([0, 1]), max: new Float32Array([2, 3]) };
    expect(laneBounds(low, view, view, 0, 100, 12)).toEqual([0, 12]);
    expect(laneBounds(null, null, view, 0, 100, 12)).toEqual([0, 100]);
  });
});
