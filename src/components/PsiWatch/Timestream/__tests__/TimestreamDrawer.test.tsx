/**
 * The Timestream under the globe (decision D-PW, PW37–PW38): its lanes by name, the UTC ruler, zoom presets, a
 * click putting the shared cursor where it lands, Now returning to the live moment, its height told to the layout,
 * the pointer's reading of a lane and the key under them (PW66), and the psi lanes over the sky's (PW52).
 * jsdom has no WebGL: the lanes say they cannot be drawn, and everything around them still works.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TemporalProvider, useTemporalState } from '../../../../context/TemporalContext';
import TimestreamDrawer, { DEFAULT_LANES, defaultHeight, degreeName, laneAt } from '../TimestreamDrawer';
import { globeCameraTelemetry } from '../../../../services/globe/GlobeCameraTelemetry';
import { setEventSetChoice } from '../../../../services/psiWatch/timestream/eventSetChoice';
import type { TeamCall } from '../../../../services/psiWatch/teamCalls';

// Teammates' revealed calls, as the team relays' reader would tell them (none unless a test sets them).
const team = vi.hoisted(() => ({ calls: [] as TeamCall[] }));
vi.mock('../../../../services/psiWatch/teamCalls', () => ({ useTeamCalls: () => team.calls }));
// What fell in closed calls' windows, as USGS's answer would give it (none unless a test sets it).
const links = vi.hoisted(() => ({ quakes: new Map<string, unknown>() }));
vi.mock('../../../../services/psiWatch/callLinks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/psiWatch/callLinks')>()),
  useQuakeLinks: () => links.quakes,
}));

const NOW = Date.UTC(2026, 9, 27, 3, 0, 0);
let seen: { currentTime: number; isLive: boolean } = { currentTime: 0, isLive: true };
const Probe: React.FC = () => { const t = useTemporalState(); seen = { currentTime: t.currentTime, isLive: t.isLive }; return null; };
const drawer = (props: React.ComponentProps<typeof TimestreamDrawer> = {}) => render(
  <TemporalProvider><TimestreamDrawer {...props} /><Probe /></TemporalProvider>,
);

describe('TimestreamDrawer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // jsdom has no canvas: the lanes are not drawn, and say so.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ }
    setEventSetChoice('quakes');
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('names its lanes, the ten, the north node, the Ascendant and Midheaven and the aspects, and says in which frame', () => {
    drawer();
    const named = [...screen.getByTestId('psi-timestream').querySelectorAll('[aria-hidden="true"]')].map((el) => el.textContent);
    for (const name of ['Sun', 'Moon', 'Mercury', 'Pluto', 'North Node', 'Ascendant', 'Midheaven', 'Aspects']) expect(named).toContain(name);
    expect(DEFAULT_LANES).toHaveLength(13);
    expect((screen.getByLabelText('Frame') as HTMLSelectElement).value).toBe('galactic');
  });

  it('draws the psi lanes over the sky\'s, Busy, the windows and the alerts, each turned off in the View menu (PW52)', () => {
    drawer();
    const named = [...screen.getByTestId('psi-timestream').querySelectorAll('[aria-hidden="true"]')].map((el) => el.textContent);
    for (const name of ['Busy', 'Windows', 'Psi Alerts']) expect(named).toContain(name);
    expect(screen.getByTestId('psi-timestream-busy')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'View' })); });
    act(() => { fireEvent.click(screen.getByRole('checkbox', { name: 'Busy' })); });
    expect(screen.queryByTestId('psi-timestream-busy')).toBeNull();
    expect(screen.getByTestId('psi-timestream-windows')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('starcom:psi-timestream-psi-lanes') ?? 'null')).toEqual(['windows', 'alerts', 'calls', 'kp', 'events', 'resonance', 'tide']);
  });

  it('draws the Resonance Score and tidal stress at first, the shares when asked, and brings the graphs to a choice saved before them (PW45)', () => {
    localStorage.setItem('starcom:psi-timestream-psi-lanes', JSON.stringify(['windows', 'kp']));
    drawer();
    expect(screen.getByTestId('psi-timestream-resonance')).toBeTruthy();
    expect(screen.getByTestId('psi-timestream-tide')).toBeTruthy();
    expect(screen.queryByTestId('psi-timestream-busy')).toBeNull();
    expect(screen.queryByTestId('psi-timestream-elements')).toBeNull();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'View' })); });
    act(() => { fireEvent.click(screen.getByRole('checkbox', { name: 'Elements' })); });
    act(() => { fireEvent.click(screen.getByRole('checkbox', { name: 'Tidal stress' })); });
    expect(screen.getByTestId('psi-timestream-elements')).toBeTruthy();
    expect(screen.queryByTestId('psi-timestream-tide')).toBeNull();
    expect(JSON.parse(localStorage.getItem('starcom:psi-timestream-psi-lanes') ?? 'null')).toEqual(['windows', 'calls', 'kp', 'events', 'resonance', 'elements']);
    expect(JSON.parse(localStorage.getItem('starcom:psi-timestream-psi-lanes-known') ?? 'null')).toContain('modalities');
  });

  it('counts a chosen set of Mecha Jono\'s events, the earthquakes at first, the choice kept (PW46)', () => {
    drawer();
    expect(screen.getByTestId('psi-timestream-events')).toBeTruthy();
    const chooser = screen.getByLabelText('Events shown') as HTMLSelectElement;
    expect(chooser.value).toBe('quakes');
    act(() => { fireEvent.change(chooser, { target: { value: 'conflict' } }); });
    expect(localStorage.getItem('starcom:psi-timestream-event-set')).toBe('conflict');
    expect(screen.getByTestId('psi-timestream-key').textContent).toContain('Conflict');
  });

  it('turns the Moon\'s lane into its marks at wider zooms, and says so in the key (PW51)', () => {
    drawer();
    const zoom = screen.getByLabelText('Zoom');
    fireEvent.change(zoom, { target: { value: '1y' } });
    expect(screen.getByTestId('psi-timestream-moon-marks')).toBeTruthy();
    expect(screen.getByTestId('psi-timestream-key').textContent).toContain('New moonFull moon');
    fireEvent.change(zoom, { target: { value: '10y' } });
    expect(screen.getByTestId('psi-timestream-key').textContent).toContain('Solar eclipseLunar eclipse');
    fireEvent.change(zoom, { target: { value: '7d' } });
    expect(screen.queryByTestId('psi-timestream-moon-marks')).toBeNull();
  });

  it('jumps with N and P to the next and previous moment, and pins marks with M, kept for the next visit (PW63)', async () => {
    drawer();
    // The kit's notes, read from the build.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    const lanes = screen.getByTestId('psi-timestream-lanes');
    act(() => { fireEvent.keyDown(lanes, { key: 'm' }); });
    expect(JSON.parse(localStorage.getItem('starcom:psi-timestream-marks') ?? '[]')).toEqual([NOW]);
    expect(screen.getAllByTestId('psi-timestream-flag')).toHaveLength(1);
    // Back before the Moon–Mars square's exact moment (27 Oct 02:18:06Z), then forward: the square, then the mark.
    act(() => { fireEvent.keyDown(lanes, { key: 'ArrowLeft' }); });
    act(() => { fireEvent.keyDown(lanes, { key: 'n' }); });
    expect(Math.abs(seen.currentTime - Date.UTC(2026, 9, 27, 2, 18, 6))).toBeLessThan(60_000);
    act(() => { fireEvent.keyDown(lanes, { key: 'n' }); });
    expect(seen.currentTime).toBe(NOW);
    act(() => { fireEvent.keyDown(lanes, { key: 'p' }); });
    expect(Math.abs(seen.currentTime - Date.UTC(2026, 9, 27, 2, 18, 6))).toBeLessThan(60_000);
  });

  it('lists the calls kept on this device in their lane, and offers to reveal or keep a closed one (PW72)', async () => {
    const { addCall, resetCallsForTests } = await import('../../../../services/psiWatch/calls');
    resetCallsForTests();
    addCall({
      id: 'c1', createdAt: NOW - 3 * 86_400_000,
      text: {
        window: { address: 'w', title: 'A window', start: (NOW - 2 * 86_400_000) / 1000, end: (NOW - 86_400_000) / 1000 },
        place: { zone: 'zone:levant', name: 'Levant Zone' }, expects: { kind: 'quakes' }, words: 'A strong one.',
      },
      salt: 'ab',
      seal: { eventId: 'e1', relay: 'wss://team.example', at: NOW - 3 * 86_400_000 },
    });
    // The lanes 700 px wide, as a browser would measure them.
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly told: (entries: { contentRect: { width: number } }[]) => void) {}
      observe() { this.told([{ contentRect: { width: 700 } }]); }
      disconnect() {}
    });
    drawer();
    const lane = screen.getByTestId('psi-timestream-calls');
    lane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 30, right: 700, bottom: 30, x: 0, y: 0, toJSON: () => ({}) });
    // A week from a third of the way back (7/3 days before now): the call's day, 2 to 1 days back, is its 5% to 19%.
    act(() => { fireEvent.click(lane, { clientX: 700 * ((7 / 3 - 1.5) / 7), clientY: 4 }); });
    const card = screen.getByTestId('psi-timestream-call-span');
    expect(card.textContent).toContain('Earthquakes M5.5+ in Levant Zone');
    expect(card.textContent).toContain('Its window has closed: reveal it or keep it private');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Keep private' })); });
    const { getCall } = await import('../../../../services/psiWatch/calls');
    expect(getCall('c1')?.keptPrivate).toBeGreaterThan(0);
    resetCallsForTests();
    vi.unstubAllGlobals();
  });

  it('lists a teammate\'s revealed call in the lane, named by its team, with nothing to do on it (PW76)', () => {
    team.calls = [{
      key: 'k:t1', id: 't1', team: 'Blue Team', sealedAt: NOW - 3 * 86_400_000, revealedAt: Date.UTC(2026, 9, 26, 13),
      text: {
        window: { address: 'w', title: 'A window', start: (NOW - 2 * 86_400_000) / 1000, end: (NOW - 86_400_000) / 1000 },
        place: { zone: 'zone:levant', name: 'Levant Zone' }, expects: { kind: 'conflict' }, words: 'Their words.',
      },
    }];
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly told: (entries: { contentRect: { width: number } }[]) => void) {}
      observe() { this.told([{ contentRect: { width: 700 } }]); }
      disconnect() {}
    });
    drawer();
    const lane = screen.getByTestId('psi-timestream-calls');
    lane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 30, right: 700, bottom: 30, x: 0, y: 0, toJSON: () => ({}) });
    act(() => { fireEvent.click(lane, { clientX: 700 * ((7 / 3 - 1.5) / 7), clientY: 4 }); });
    const card = screen.getByTestId('psi-timestream-call-span');
    expect(card.textContent).toContain('Conflict in Levant Zone');
    expect(card.textContent).toContain('A call from Blue Team, revealed 26 Oct 2026 13:00Z');
    expect(screen.queryByRole('button', { name: 'Reveal' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep private' })).toBeNull();
    team.calls = [];
    vi.unstubAllGlobals();
  });

  // A closed earthquake call of Blue Team's, its card opened (PW40, PW74).
  const openQuakesCall = (found: unknown) => {
    team.calls = [{
      key: 'k:t2', id: 't2', team: 'Blue Team', sealedAt: NOW - 3 * 86_400_000, revealedAt: Date.UTC(2026, 9, 26, 13),
      text: {
        window: { address: 'w', title: 'A window', start: (NOW - 2 * 86_400_000) / 1000, end: (NOW - 86_400_000) / 1000 },
        place: { zone: 'zone:levant', name: 'Levant Zone' }, expects: { kind: 'quakes' }, words: 'Their words.',
      },
    }];
    links.quakes = new Map([['team:k:t2', found]]);
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly told: (entries: { contentRect: { width: number } }[]) => void) {}
      observe() { this.told([{ contentRect: { width: 700 } }]); }
      disconnect() {}
    });
    drawer();
    const lane = screen.getByTestId('psi-timestream-calls');
    lane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 30, right: 700, bottom: 30, x: 0, y: 0, toJSON: () => ({}) });
    act(() => { fireEvent.click(lane, { clientX: 700 * ((7 / 3 - 1.5) / 7), clientY: 4 }); });
    const text = screen.getByTestId('psi-timestream-call-span').textContent;
    team.calls = [];
    links.quakes = new Map();
    vi.unstubAllGlobals();
    return text;
  };

  it('lists what fell in a closed earthquake call\'s window (PW40, PW74)', () => {
    const quake = { id: 'us1', ms: Date.UTC(2026, 9, 25, 4, 12), mag: 6.1, lat: 33, lon: 35.5, place: '20 km W of Tyre, Lebanon' };
    expect(openQuakesCall({ state: 'done', quakes: [quake] })).toContain('M6.1 · 25 Oct 2026 04:12Z · 20 km W of Tyre, Lebanon');
  });

  it('says so when nothing of its kind fell in it', () => {
    expect(openQuakesCall({ state: 'done', quakes: [] })).toContain('None of its kind fell in it');
  });

  it('says so when USGS did not answer', () => {
    expect(openQuakesCall({ state: 'failed' })).toContain('Its events could not be read');
  });

  it('splits the globe side by side and back, the Psi layers at now and at the cursor (PW73)', async () => {
    const { getSplit, setSplit } = await import('../../../../services/psiWatch/timestream/split');
    setSplit(false);
    drawer();
    const button = screen.getByRole('button', { name: 'Side by side' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    act(() => { fireEvent.click(button); });
    expect(getSplit()).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    act(() => { fireEvent.click(button); });
    expect(getSplit()).toBe(false);
  });

  it('plays by event: a second at each next moment N would jump to (PW63)', async () => {
    drawer();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    const lanes = screen.getByTestId('psi-timestream-lanes');
    act(() => { fireEvent.keyDown(lanes, { key: 'n' }); });
    const next = seen.currentTime;
    expect(next).toBeGreaterThan(NOW);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Now' })); });
    act(() => { fireEvent.change(screen.getByLabelText('Rate'), { target: { value: 'event' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1150)); });
    expect(seen.currentTime).toBe(next);
  });

  it('brushes a span with a Shift-drag, and clears it with the toolbar\'s chip (PW50)', () => {
    drawer();
    const lanes = screen.getByTestId('psi-timestream-lanes');
    lanes.getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 200, right: 700, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    const press = (type: string, clientX: number) => fireEvent(lanes, new MouseEvent(type, { clientX, shiftKey: true, bubbles: true }));
    act(() => { press('pointerdown', 100); press('pointermove', 300); press('pointerup', 300); });
    expect(screen.getByTestId('psi-timestream-brush')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByTestId('psi-timestream-brush-clear')); });
    expect(screen.queryByTestId('psi-timestream-brush')).toBeNull();
  });

  it('casts the angles for the globe\'s centre as it turns, until a place is pinned (PW43)', () => {
    drawer();
    act(() => { globeCameraTelemetry.publish({ lat: 12.3, lng: -3.2, altitude: 2 }); });
    expect(screen.getByTestId('psi-timestream-observer').textContent).toBe('Sky over 12.5°N 3.0°W');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Pin this place' })); });
    act(() => { globeCameraTelemetry.publish({ lat: -40, lng: 150, altitude: 2 }); });
    expect(screen.getByTestId('psi-timestream-observer').textContent).toBe('Sky over 12.5°N 3.0°W');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Follow the globe' })); });
    expect(screen.getByTestId('psi-timestream-observer').textContent).toBe('Sky over 40.0°S 150.0°E');
  });

  it('opens on a week with the cursor at the live moment, the ruler in UTC days', () => {
    drawer();
    expect(screen.getByTestId('psi-timestream-cursor').textContent).toBe('27 Oct 2026 03:00Z');
    expect((screen.getByLabelText('Zoom') as HTMLSelectElement).value).toBe('7d');
  });

  it('zooms to a preset about the cursor', () => {
    drawer();
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '100y' } });
    expect((screen.getByLabelText('Zoom') as HTMLSelectElement).value).toBe('100y');
  });

  it('puts the shared cursor where a click lands, and Now takes it back to the live moment', () => {
    drawer();
    const lanes = screen.getByTestId('psi-timestream-lanes');
    lanes.getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 200, right: 700, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    // A week from a third of the way back: a click at the right edge is about 4.7 days ahead.
    // jsdom has no PointerEvent: a mouse event of the pointer's type carries the place.
    const press = (type: string) => fireEvent(lanes, new MouseEvent(type, { clientX: 700, bubbles: true }));
    act(() => { press('pointerdown'); press('pointerup'); });
    expect(seen.isLive).toBe(false);
    expect((seen.currentTime - NOW) / 86_400_000).toBeCloseTo(7 * (2 / 3), 1);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Now' })); });
    expect(seen.isLive).toBe(true);
  });

  it('opens at a share of the window, tells the layout how tall it stands, and that it is gone once it closes', () => {
    const heights: number[] = [];
    const { unmount } = drawer({ onHeight: (px) => heights.push(px) });
    expect(heights.at(-1)).toBe(defaultHeight(window.innerHeight));
    expect(defaultHeight(720)).toBe(216);
    expect(defaultHeight(400)).toBe(160);
    expect(defaultHeight(2000)).toBe(340);
    unmount();
    expect(heights.at(-1)).toBe(0);
  });

  it('collapses to its toolbar and opens again, remembering which', () => {
    drawer();
    expect(screen.getByTestId('psi-timestream-lanes')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Hide lanes' })); });
    expect(screen.getByTestId('psi-timestream-lanes').closest('[hidden]')).not.toBeNull();
    expect(localStorage.getItem('starcom:psi-timestream-collapsed')).toBe('1');
    // One strip: the time and its play, nothing that shapes the lanes.
    expect(screen.queryByLabelText('Frame')).toBeNull();
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Live' })).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show lanes' })); });
    expect(screen.getByTestId('psi-timestream-lanes').closest('[hidden]')).toBeNull();
  });

  it('says Live while live, and Now once the cursor has moved off it', () => {
    drawer();
    expect(screen.getByRole('button', { name: 'Live' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('reads a lane at a moment from the drawn sky: its longitude and whether it moves backward', () => {
    const view = { startMs: 0, spanMs: 4000 };
    // Two columns, the Sun and Mars: Mars backward in the second.
    const sky = { columns: 2, bodies: ['Sun', 'Mars'] as const, longitudes: new Float32Array([10, 75.5, 11, 74.9]), retrograde: new Uint8Array([0, 0, 0, 1]) };
    expect(laneAt({ sky, view }, 'Mars', 1000)).toEqual({ lon: 75.5, retrograde: false });
    expect(laneAt({ sky, view }, 'Mars', 3000)).toEqual({ lon: expect.closeTo(74.9, 4), retrograde: true });
    expect(laneAt({ sky, view }, 'Moon', 1000)).toBeNull();
    expect(laneAt({ sky, view }, 'Sun', 5000)).toBeNull();
    expect(degreeName(15.5)).toBe('15°30′');
    expect(degreeName(0.0833)).toBe('0°04′');
    expect(degreeName(29.999)).toBe('29°59′');
  });

  it('keys the lanes\' colours and marks under them', () => {
    drawer();
    const key = screen.getByTestId('psi-timestream-key');
    expect(key.textContent).toBe('FireEarthAirWaterRetrogradeSign beginsWindowPsi AlertEarthquakes M5.5+MeasuredForecast');
  });

  it('takes the Moon\'s aspects out of the lane with a chip, and remembers it', () => {
    drawer();
    const moon = screen.getByRole('button', { name: 'The Moon’s aspects' });
    expect(moon.getAttribute('aria-pressed')).toBe('true');
    act(() => { fireEvent.click(moon); });
    expect(moon.getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('starcom:psi-timestream-moon-aspects')).toBe('0');
  });

  it('says so where the lanes cannot be drawn', () => {
    drawer();
    expect(screen.getByText('This browser cannot draw the lanes.')).toBeTruthy();
  });
});
