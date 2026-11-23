/**
 * The Watchlist (D-WL, WL4, WL8, WL9): the header's button counts the pings not yet opened and opens the panel, which
 * lists each watch with what it counts, a circle's radius, what has landed in it (opening one in the inspector), and
 * stops watching; "Watch a place…" opens the palette with the verb typed. A country's card watches the country.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../Globe/Hooks/useTerritories', () => ({
  loadTerritories: async () => ({ a2Of: (a3: string) => (a3 === 'JPN' ? 'JP' : null), at: () => null, countries: () => [], byCode: () => null, size: 0 }),
}));
const opened: unknown[] = [];
vi.mock('../../Globe/Hooks/useGlobeWatchPings', () => ({ openWatchPing: (ping: unknown) => { opened.push(ping); } }));

import Watchlist from '../Watchlist';
import { WatchPlaceButton } from '../WatchPlaceButton';
import { addWatch, resetWatchesForTests, watches } from '../../../features/watch/watchlist';
import { paletteOpen, closePalette } from '../../../features/palette/palette';
import { newWatchPings, newKnown, resetWatchPingsForTests } from '../../../services/watch/watchPings';

beforeEach(() => { localStorage.clear(); resetWatchesForTests(); resetWatchPingsForTests(); opened.length = 0; });
afterEach(() => { act(() => closePalette()); });

describe('the header button', () => {
  it('says the Watchlist, and opens the panel with what to do when nothing is watched', () => {
    render(<Watchlist />);
    const button = screen.getByTestId('watchlist-button');
    expect(button).toHaveAccessibleName('Watchlist');
    expect(screen.queryByTestId('watchlist-count')).toBeNull();
    fireEvent.click(button);
    expect(screen.getByTestId('watchlist')).toHaveTextContent('Nothing watched yet.');
    fireEvent.click(screen.getByTestId('watchlist-add'));
    expect(paletteOpen()).toMatchObject({ query: 'watch ' });
    expect(screen.queryByTestId('watchlist')).toBeNull();
  });

  it('lists each watch, changes what it counts and a circle\'s radius, and stops watching', () => {
    act(() => { addWatch({ kind: 'territory', code: 'jp', name: 'Japan' }); addWatch({ kind: 'circle', lat: 14.6, lng: 121, km: 300, name: 'Manila' }); });
    render(<Watchlist />);
    fireEvent.click(screen.getByTestId('watchlist-button'));
    const rows = screen.getAllByTestId('watch-row');
    expect(rows.map((r) => r.querySelector('strong')?.textContent)).toEqual(['Japan', '300 km around Manila']);
    fireEvent.change(screen.getAllByTestId('watch-quakes')[0], { target: { value: '6' } });
    fireEvent.change(screen.getAllByTestId('watch-hazards')[0], { target: { value: 'off' } });
    fireEvent.click(screen.getAllByTestId('watch-war')[0]);
    expect(watches()[0].kinds).toEqual({ quakes: '6', hazards: null, intel: true, war: false, unrest: true });
    fireEvent.click(screen.getByRole('button', { name: '1000 km' }));
    expect(watches()[1].place).toMatchObject({ km: 1000 });
    fireEvent.click(screen.getByRole('button', { name: 'Stop watching: Japan' }));
    expect(watches().map((w) => w.place.kind)).toEqual(['circle']);
  });

  it('counts a ping not yet opened, and opens what landed in the inspector', async () => {
    act(() => { addWatch({ kind: 'circle', lat: 35.68, lng: 139.69, km: 300, name: 'Tokyo' }, { quakes: '4.5', hazards: null, intel: true, war: true, unrest: true }, 0); });
    render(<Watchlist />);
    // A quake read after the watch was made, inside its circle.
    const { keepForTests } = await import('../../../services/watch/watchPings');
    act(() => keepForTests(newWatchPings([{ id: 'q', kind: 'quake', lat: 35.4, lng: 139.8, level: 5.1, timeMs: Date.now() - 60_000,
      event: { id: 'q', lat: 35.4, lng: 139.8, type: 'earthquake', description: 'M 5.1 - 30 km S of Tokyo, Japan' } }], newKnown(), watches(), () => null, Date.now())));
    expect(screen.getByTestId('watchlist-count')).toHaveTextContent('1');
    expect(screen.getByTestId('watchlist-button')).toHaveAccessibleName('Watchlist: 1 new');
    fireEvent.click(screen.getByTestId('watchlist-button'));
    fireEvent.click(screen.getByTestId('watch-landed'));
    expect(opened).toHaveLength(1);
  });
});

describe('a country\'s card', () => {
  it('watches the country by its two letters, then says it is watched', async () => {
    render(<WatchPlaceButton a3="JPN" name="Japan" />);
    const button = await screen.findByTestId('watch-place');
    expect(button).toHaveTextContent('Watch');
    fireEvent.click(button);
    expect(watches()[0].place).toEqual({ kind: 'territory', code: 'jp', name: 'Japan' });
    expect(screen.getByTestId('watch-place')).toHaveTextContent('Watched');
    expect(screen.getByTestId('watch-place')).toBeDisabled();
  });

  it('shows nothing for a territory without two letters', async () => {
    render(<WatchPlaceButton a3="SOL" name="Somaliland" />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId('watch-place')).toBeNull();
  });
});
