/**
 * The Finder in the panel (decision D-PW, PW61, PW70): its two positive controls listed, one opened at a time, each
 * drawing its bars and reading one under the pointer, drawn as data with no sentence reading them.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import FinderSection from '../FinderSection';
import { getFinderOpen } from '../../../services/psiWatch/finder';

const served: Record<string, string> = {
  '/data/psi-finder-plates.json': readFileSync('public/data/psi-finder-plates.json', 'utf8'),
  '/data/psi-events-storms.json': readFileSync('public/data/psi-events-storms.json', 'utf8'),
};

describe('FinderSection', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => new Response(served[String(url)] ?? '', { status: served[String(url)] ? 200 : 404 }));
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('lists its two controls, and opens the plate-boundary one, its bars read under the pointer', async () => {
    render(<FinderSection />);
    expect(screen.getByRole('button', { name: /A 27-day return of geomagnetic activity/ })).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /A Zone on a plate boundary/ })); });
    expect(getFinderOpen()).toBe('plates');
    const chart = await waitFor(() => screen.getByTestId('psi-finder-plates'));
    chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 260, height: 64, right: 260, bottom: 64, x: 0, y: 0, toJSON: () => ({}) });
    act(() => { fireEvent.mouseMove(chart, { clientX: 255 }); });
    expect(screen.getByTestId('psi-finder-plates-reading').textContent).toMatch(/^Group 10 \(shares \d+% to 100%\): \d+ Zones, [\d,]+ quakes, [\d.]+ per million km², usual [\d.]+$/);
  });

  it('opens the 27-day one in its place, and closes it on a second click', async () => {
    render(<FinderSection />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /A 27-day return/ })); });
    const chart = await waitFor(() => screen.getByTestId('psi-finder-rotation'));
    chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 260, height: 64, right: 260, bottom: 64, x: 0, y: 0, toJSON: () => ({}) });
    // 60 days across 260 px: day 27 lies at 26 × 4.33 px.
    act(() => { fireEvent.mouseMove(chart, { clientX: 26.5 * (260 / 60) }); });
    expect(screen.getByTestId('psi-finder-rotation-reading').textContent).toMatch(/^Day 27: [\d,]+, usual [\d.]+$/);
    expect(screen.queryByTestId('psi-finder-plates')).toBeNull();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /A 27-day return/ })); });
    expect(getFinderOpen()).toBeNull();
  });
});
