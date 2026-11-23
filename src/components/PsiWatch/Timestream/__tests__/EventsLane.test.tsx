/**
 * The events lane (decision D-PW, PW42, PW46, PW51): a hover reads the bar under the pointer, its count and bucket;
 * nothing reads outside the set's record.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import EventsLane from '../EventsLane';
import { readEventSet, type EventSetFile } from '../../../../services/psiWatch/timestream/eventSets';

const DAY = 86_400_000;
const file: EventSetFile = {
  set: 'quakes', kind: 'k', time: 't', licence: 'public domain', credit: 'c', laterEvents: 'l', source: { file: 'f', sha256: 'x' },
  rows: 3, fromMs: Date.UTC(1992, 0, 1), untilMs: Date.UTC(1992, 0, 10), zones: [],
  t: [Date.UTC(1992, 0, 2) / 1000, 3600, DAY / 1000],
};
// jsdom has no PointerEvent: a mouse event of the pointer's type carries the place.
const hoverAt = (el: HTMLElement, clientX: number) => act(() => { fireEvent(el, new MouseEvent('pointermove', { clientX, bubbles: true })); });

describe('EventsLane', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('reads the day under the pointer, and nothing past the record\'s end', () => {
    const readout = vi.fn((bar: { count: number }, bucket: string) => [`${bar.count} by ${bucket}`, 'its time']);
    const view = { startMs: Date.UTC(1992, 0, 1), spanMs: 20 * DAY };
    render(<EventsLane set={readEventSet(file)} view={view} width={2000} readout={readout} />);
    const lane = screen.getByTestId('psi-timestream-events');
    lane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 2000, height: 28, right: 2000, bottom: 28, x: 0, y: 0, toJSON: () => ({}) });
    // 100 px a day: 2 Jan holds two, 3 Jan one.
    hoverAt(lane, 150);
    expect(screen.getByTestId('psi-timestream-events-readout').textContent).toBe('2 by dayits time');
    hoverAt(lane, 250);
    expect(screen.getByTestId('psi-timestream-events-readout').textContent).toBe('1 by dayits time');
    hoverAt(lane, 1500);
    expect(screen.queryByTestId('psi-timestream-events-readout')).toBeNull();
  });

  it('draws the years held back for sealed tests as a band saying so, no bar in them (PW75)', () => {
    const held = readEventSet({ ...file, rows: 2, fromMs: Date.UTC(1999, 0, 1), untilMs: Date.UTC(2003, 0, 1), t: [Date.UTC(1999, 6, 1) / 1000, 2 * 365 * DAY / 1000] })!;
    const view = { startMs: Date.UTC(1999, 0, 1), spanMs: 4 * 365.25 * DAY };
    render(<EventsLane set={held} view={view} width={400} readout={() => ['a bar', 'its time']} heldWords={(years) => `${years} held back`} />);
    expect(screen.getByTestId('psi-timestream-held').textContent).toBe('2000–2024 held back');
    const lane = screen.getByTestId('psi-timestream-events');
    lane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 28, right: 400, bottom: 28, x: 0, y: 0, toJSON: () => ({}) });
    // 2001, inside the held-back years: the band's words, never a bar.
    hoverAt(lane, 220);
    expect(screen.getByTestId('psi-timestream-events-readout').textContent).toBe('2000–2024 held back');
  });
});
