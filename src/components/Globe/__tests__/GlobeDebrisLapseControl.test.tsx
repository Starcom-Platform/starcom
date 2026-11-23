/**
 * The debris spread's lapse, played beside the globe (D-GV GV2, step 6): there only while it can be played, and
 * saying the day drawn, that it is modelled and what is not, while it plays.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GlobeDebrisLapseControl, DEBRIS_LAPSE_CAVEAT } from '../GlobeDebrisLapseControl';
import { registerDebrisLapse, setDebrisLapseAt } from '../../../features/globe/debrisLapse/debrisLapseStore';

afterEach(() => act(() => registerDebrisLapse(null)));

describe('GlobeDebrisLapseControl', () => {
  it('is not there while no debris spread can be played', () => {
    render(<GlobeDebrisLapseControl />);
    expect(screen.queryByTestId('globe-debris-lapse')).toBeNull();
  });

  it('plays the lapse, then says the day drawn, that it is modelled and what is not, and stops it', () => {
    const controller = { play: vi.fn(), stop: vi.fn() };
    act(() => registerDebrisLapse(controller));
    render(<GlobeDebrisLapseControl />);

    fireEvent.click(screen.getByRole('button', { name: /debris spread/i }));
    expect(controller.play).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('globe-debris-lapse-at')).toBeNull();

    act(() => setDebrisLapseAt(Date.parse('2009-02-10T00:00:00Z')));
    expect(screen.getByTestId('globe-debris-lapse-at').textContent).toBe('Modelled · 10 Feb 2009');
    expect(screen.getByText(DEBRIS_LAPSE_CAVEAT)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(controller.stop).toHaveBeenCalledTimes(1);
  });
});
