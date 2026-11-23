/**
 * The Busy lane's hover (decision D-PW, PW52, PW67): what is open at a moment, nearest its peak first, each with how
 * often its kind comes round, and nothing but the name where that is not known.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import BusyLane from '../BusyLane';
import type { BusyPart } from '../../../../services/psiWatch/timestream/busy';

const DAY = 86_400_000;
const view = { startMs: Date.UTC(2026, 10, 1), spanMs: 10 * DAY };
// jsdom has no PointerEvent: a mouse event of the pointer's type carries the place.
const hoverAt = (el: HTMLElement, clientX: number) => act(() => { fireEvent(el, new MouseEvent('pointermove', { clientX, bubbles: true })); });

describe('BusyLane', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('names what is open at the hover, each with how often its kind recurs', () => {
    const parts: BusyPart[] = [
      { kind: 'aspect', a: 'Moon', b: 'Mars', aspect: 'square', weight: 0.9, recurrenceDays: 14.2 },
      { kind: 'aspect', a: 'Jupiter', b: 'Saturn', aspect: 'conjunction', weight: 0.4, recurrenceDays: 7254 },
      { kind: 'window', address: 'x', title: 'Psi Watch focus window', weight: 0.3 },
    ];
    const partsAt = vi.fn(() => parts);
    render(<BusyLane values={new Float32Array(10)} drawnView={view} view={view} width={1000} partsAt={partsAt} />);
    const lane = screen.getByTestId('psi-timestream-busy');
    lane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 30, right: 1000, bottom: 30, x: 0, y: 0, toJSON: () => ({}) });
    hoverAt(lane, 450);
    expect(partsAt).toHaveBeenLastCalledWith(4);
    const lines = [...screen.getByTestId('psi-timestream-busy-readout').querySelectorAll('span')].map((s) => s.textContent);
    expect(lines.slice(0, 4)).toEqual([
      'Open:',
      'Moon square Mars, about every 14 days',
      'Jupiter conjunct Saturn, about every 20 years',
      'Psi Watch focus window',
    ]);
  });

  it('says so when nothing is open', () => {
    render(<BusyLane values={new Float32Array(10)} drawnView={view} view={view} width={1000} partsAt={() => []} />);
    const lane = screen.getByTestId('psi-timestream-busy');
    lane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 30, right: 1000, bottom: 30, x: 0, y: 0, toJSON: () => ({}) });
    hoverAt(lane, 50);
    expect(screen.getByTestId('psi-timestream-busy-readout').textContent).toContain('Nothing open');
  });
});
