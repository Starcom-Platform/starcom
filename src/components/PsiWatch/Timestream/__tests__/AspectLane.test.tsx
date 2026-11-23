/**
 * The aspect lane (decision D-PW, PW42, PW65): its rows grow with the aspects, a click opens the aspect under it and
 * puts the shared cursor on its exact moment, and the window is told only where the view holds its edges.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AspectLane, { ASPECT_ROW_PX, aspectLaneHeight, type PlacedAspect } from '../AspectLane';
import type { AspectEvent } from '../../../../services/psiWatch/timestream/aspectEvents';

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 1);
const view = { startMs: START, spanMs: 10 * DAY };
const event = (over: Partial<AspectEvent>): AspectEvent => ({
  a: 'Mars', b: 'Saturn', kind: 'square', fromMs: START + 2 * DAY, untilMs: START + 6 * DAY, exactMs: START + 4 * DAY, exactInView: true, fromEdge: false, untilEdge: false, ...over,
});
// 1000 px over ten days: a day is 100 px.
const lane = (placed: PlacedAspect[], onSeek = vi.fn()) => {
  render(<AspectLane placed={placed} hidden={0} rows={placed.reduce((n, p) => Math.max(n, p.row + 1), 1)} view={view} width={1000} onSeek={onSeek} />);
  const el = screen.getByTestId('psi-timestream-aspects');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 100, right: 1000, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  return { el, onSeek };
};

describe('AspectLane', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('stands as tall as its rows, one at least', () => {
    expect(aspectLaneHeight(0)).toBe(ASPECT_ROW_PX + 2);
    expect(aspectLaneHeight(3)).toBe(3 * ASPECT_ROW_PX + 2);
  });

  it('opens the aspect a click lands on and puts the cursor on its exact moment, and closes it again', () => {
    const square = event({});
    const trine = event({ a: 'Venus', b: 'Jupiter', kind: 'trine', exactMs: START + 5 * DAY });
    const { el, onSeek } = lane([{ event: square, row: 0 }, { event: trine, row: 1 }]);
    // Row 1, at day 3: on the trine's bar, not the square's.
    act(() => { fireEvent.click(el, { clientX: 300, clientY: 1 + ASPECT_ROW_PX + 4 }); });
    expect(onSeek).toHaveBeenCalledWith(trine.exactMs);
    const card = screen.getByTestId('psi-timestream-aspect-card');
    expect(card.textContent).toContain('Venus trine Jupiter, exact 6 Nov 2026 00:00Z');
    expect(card.textContent).toContain('In orb 3 Nov 2026 00:00Z to 7 Nov 2026 00:00Z');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close' })); });
    expect(screen.queryByTestId('psi-timestream-aspect-card')).toBeNull();
  });

  it('opens nothing where no bar is, and tells only the window\'s edges the computed sky holds', () => {
    const clipped = event({ fromMs: START, untilMs: START + 3 * DAY, exactMs: START + DAY, fromEdge: true });
    const { el, onSeek } = lane([{ event: clipped, row: 0 }]);
    act(() => { fireEvent.click(el, { clientX: 800, clientY: 4 }); });
    expect(onSeek).not.toHaveBeenCalled();
    expect(screen.queryByTestId('psi-timestream-aspect-card')).toBeNull();
    act(() => { fireEvent.click(el, { clientX: 150, clientY: 4 }); });
    expect(screen.getByTestId('psi-timestream-aspect-card').textContent).toContain('In orb until 4 Nov 2026 00:00Z');
  });
});
