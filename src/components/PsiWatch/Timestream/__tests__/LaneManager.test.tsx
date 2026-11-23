/**
 * The Timestream's lanes, chosen (decision D-PW, PW38): on and off, moved up and down, remembered in this browser;
 * the drawer's frame switched between the Galactic Centre and tropical, and its palette kept.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { TemporalProvider } from '../../../../context/TemporalContext';
import { moveLane, readLanes, saveLanes, toggleLane } from '../LaneManager';
import TimestreamDrawer from '../TimestreamDrawer';

describe('the lane manager', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* none */ }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('turns a lane on at the end and off again, and moves one a place', () => {
    expect(toggleLane(['Sun', 'Moon'], 'Mars')).toEqual(['Sun', 'Moon', 'Mars']);
    expect(toggleLane(['Sun', 'Moon'], 'Sun')).toEqual(['Moon']);
    expect(moveLane(['Sun', 'Moon', 'Mars'], 'Mars', -1)).toEqual(['Sun', 'Mars', 'Moon']);
    expect(moveLane(['Sun', 'Moon'], 'Sun', -1)).toEqual(['Sun', 'Moon']);
  });

  it('remembers the choice in this browser, and falls back to the default for anything it does not know', () => {
    saveLanes(['Pluto', 'Sun']);
    expect(readLanes(['Moon'])).toEqual(['Pluto', 'Sun']);
    localStorage.setItem('starcom:psi-timestream-lanes', JSON.stringify(['Vulcan']));
    expect(readLanes(['Moon'])).toEqual(['Moon']);
  });

  it('adds Lilith as a lane from the menu, and the drawer names it', () => {
    render(<TemporalProvider><TimestreamDrawer /></TemporalProvider>);
    expect(screen.queryByText('Lilith')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    const menu = screen.getByTestId('psi-timestream-lane-menu');
    act(() => { fireEvent.click(within(menu).getByLabelText('Lilith')); });
    expect(screen.getAllByText('Lilith').length).toBeGreaterThan(1);
    expect(readLanes([])).toContain('Lilith');
  });

  it('switches the frame between the Galactic Centre and tropical', () => {
    render(<TemporalProvider><TimestreamDrawer /></TemporalProvider>);
    const frame = screen.getByLabelText('Frame') as HTMLSelectElement;
    expect(frame.value).toBe('galactic');
    fireEvent.change(frame, { target: { value: 'tropical' } });
    expect(frame.value).toBe('tropical');
  });

  it('keeps the palette chosen in the View menu, Cosmic Cypher\'s by default (PW41, PW65)', () => {
    render(<TemporalProvider><TimestreamDrawer /></TemporalProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByRole('button', { name: 'Cosmic Cypher' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Colour-blind safe' }));
    expect(screen.getByRole('button', { name: 'Colour-blind safe' }).getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('starcom:psi-timestream-palette')).toBe('safe');
  });
});
