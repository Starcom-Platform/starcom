/**
 * The alignment lane (decision D-PW, PW55, PW71): a hover reads the day from exact under the pointer, its count and
 * the usual.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AlignLane from '../AlignLane';

// jsdom has no PointerEvent: a mouse event of the pointer's type carries the place.
const hoverAt = (el: HTMLElement, clientX: number) => act(() => { fireEvent(el, new MouseEvent('pointermove', { clientX, bubbles: true })); });

describe('AlignLane', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('reads the day from exact under the pointer', () => {
    const counts = Array.from({ length: 61 }, (_, i) => i);
    render(<AlignLane alignment={{ counts, returns: 12, usual: 20 }} colour="currentColor" beforeMs={86_400_000} afterMs={86_400_000} width={610}
      label="Aligned" read={(day, count) => `Day ${day}: ${count}`} />);
    const lane = screen.getByTestId('psi-timestream-align');
    lane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 610, height: 44, right: 610, bottom: 44, x: 0, y: 0, toJSON: () => ({}) });
    // 10 px a day: x 305 is day 0, the 31st bar.
    hoverAt(lane, 305);
    expect(screen.getByTestId('psi-timestream-align-readout').textContent).toBe('Day 0: 30');
    hoverAt(lane, 5);
    expect(screen.getByTestId('psi-timestream-align-readout').textContent).toBe('Day -30: 0');
  });
});
