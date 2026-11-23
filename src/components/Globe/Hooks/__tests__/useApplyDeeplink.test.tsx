/**
 * A link, applied (deeplink v1; decision RW8; globe record section 19, Phase
 * 1 step 5). Read once, after the globe is ready, and never written back.
 * Applied through the share handle, in the order the grammar states, with the
 * calls Mecha Jono's grammar names for each part: the layer with other pins
 * cleared, the pins, the camera, the window, then the featured report, framed
 * and featured once drawn, waited for up to 90 s. Each part stands or falls
 * alone.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApplyDeeplink, type LinkDriver } from '../useApplyDeeplink';
import { noteHandleCall, resetLinkYield } from '../../../../features/globe/capture/linkYield';
import { noticedWhenUsed } from '../../../../features/globe/capture/shareActivity';

// Mecha Jono with a newer key beside their first (D-HW: the key changes in early November 2026).
vi.mock('../../../../config/publicInfrastructure', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  MECHA_JONO_KEYS: ['a'.repeat(64), '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692'],
}));
import { getGlobeAppearance, resetGlobeAppearanceForTests } from '../../../../services/globe/globeAppearance';

const PK = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const FOCUS = `30023:${PK}:raver-drug-check-alert-x`;

function driver(listed: () => string[] = () => [FOCUS]) {
  const calls: string[] = [];
  const handle: LinkDriver = {
    whenReady: vi.fn(async () => { calls.push('whenReady'); return { ready: true, waitedMs: 0 }; }),
    setLayer: vi.fn((id: string, options?: object) => { calls.push(`setLayer ${id} ${JSON.stringify(options ?? {})}`); return { primary: id, pinned: [] }; }),
    pinLayers: vi.fn((ids: string[]) => { calls.push(`pinLayers ${ids.join(',')}`); return { pinned: ids }; }),
    setView: vi.fn(async (pov: object) => { calls.push(`setView ${JSON.stringify(pov)}`); return { lat: 0, lng: 0, altitude: 1 }; }),
    setTimeWindow: vi.fn(async (w: { from: number; until: number } | null) => { calls.push(`setTimeWindow ${JSON.stringify(w)}`); return { from: 0, until: 1, live: false }; }),
    listReports: vi.fn(() => listed().map((id) => ({ id }))),
    frameReports: vi.fn(async (ids: string[]) => { calls.push(`frameReports ${ids.join(',')}`); return { lat: 0, lng: 0, altitude: 1 }; }),
    focusReport: vi.fn((id: string | null) => { calls.push(`focusReport ${id}`); return { featured: null }; }),
  };
  return { handle, calls };
}
const apply = (search: string, handle: LinkDriver | undefined, focusWaitMs = 300) =>
  renderHook(() => useApplyDeeplink({ handle: () => handle, search, focusWaitMs, pollMs: 10 }));

describe('a link, applied', () => {
  it('in order once the globe is ready: layer, pins, camera, window, then the report', async () => {
    const { handle, calls } = driver();
    apply(`?v=1&sub=DrugCheckAlerts&pin=SpaceWeather&at=48.2,16.4,1.3&win=1790899200..1791158400&focus=${FOCUS}`, handle);
    await waitFor(() => expect(calls).toContain(`focusReport ${FOCUS}`));
    expect(calls).toEqual([
      'whenReady',
      'setLayer DrugCheckAlerts {"pin":false,"clearOtherPins":true}',
      'pinLayers SpaceWeather',
      'setView {"lat":48.2,"lng":16.4,"altitude":1.3}',
      'setTimeWindow {"from":1790899200,"until":1791158400}',
      // Focus overrides the camera once it succeeds.
      `frameReports ${FOCUS}`,
      `focusReport ${FOCUS}`,
    ]);
  });

  // A card's link or QR code, made before Mecha Jono's key changed, still finds its note signed under the new key.
  it('finds the note a link names under Mecha Jono\'s old key, now drawn under their new one', async () => {
    const renewed = `30023:${'a'.repeat(64)}:raver-drug-check-alert-x`;
    const { handle, calls } = driver(() => [renewed]);
    apply(`?v=1&sub=DrugCheckAlerts&focus=${FOCUS}`, handle);
    await waitFor(() => expect(calls).toContain(`focusReport ${renewed}`));
    expect(calls).toContain(`frameReports ${renewed}`);
  });

  it('keeps the current altitude when the link gives none', async () => {
    const { handle, calls } = driver();
    apply('?v=1&sub=SpaceWeather&at=60,-30', handle);
    await waitFor(() => expect(calls).toContain('setView {"lat":60,"lng":-30}'));
  });

  it('waits for the featured report to be drawn, and features it when it is', async () => {
    let drawn: string[] = [];
    const { handle, calls } = driver(() => drawn);
    apply(`?v=1&focus=${FOCUS}`, handle, 2_000);
    await new Promise((r) => setTimeout(r, 60));
    expect(calls).not.toContain(`focusReport ${FOCUS}`);
    drawn = [FOCUS];
    await waitFor(() => expect(calls).toContain(`focusReport ${FOCUS}`));
  });

  it('stops waiting when the wait is over, and features nothing drawn after it', async () => {
    let drawn: string[] = [];
    const { handle, calls } = driver(() => drawn);
    apply(`?v=1&focus=${FOCUS}`, handle, 100);
    await new Promise((r) => setTimeout(r, 200));
    drawn = [FOCUS];
    await new Promise((r) => setTimeout(r, 100));
    expect(calls.some((c) => c.startsWith('focusReport'))).toBe(false);
    expect((handle.listReports as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(20);
  });

  it('lets each part stand or fall alone', async () => {
    const { handle, calls } = driver();
    (handle.setLayer as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('No layer'); });
    apply('?v=1&sub=DrugCheckAlerts&at=48.2,16.4,1.3', handle);
    await waitFor(() => expect(calls).toContain('setView {"lat":48.2,"lng":16.4,"altitude":1.3}'));
  });

  it('does nothing for a link that states nothing, and nothing twice', async () => {
    const quiet = driver();
    apply('?utm_source=discord', quiet.handle);
    await new Promise((r) => setTimeout(r, 50));
    expect(quiet.calls).toEqual([]);

    const once = driver();
    const { rerender } = apply('?v=1&sub=SpaceWeather', once.handle);
    await waitFor(() => expect(once.calls).toContain('setLayer SpaceWeather {"pin":false,"clearOtherPins":true}'));
    rerender();
    await new Promise((r) => setTimeout(r, 50));
    expect(once.calls.filter((c) => c.startsWith('setLayer SpaceWeather'))).toHaveLength(1);
  });

  it('waits for the handle to exist before driving it', async () => {
    const { handle, calls } = driver();
    let installed: LinkDriver | undefined;
    renderHook(() => useApplyDeeplink({ handle: () => installed, search: '?v=1&sub=SpaceWeather', pollMs: 10 }));
    await new Promise((r) => setTimeout(r, 40));
    expect(calls).toEqual([]);
    installed = handle;
    await waitFor(() => expect(calls).toContain('setLayer SpaceWeather {"pin":false,"clearOtherPins":true}'));
  });
});

void React;

// Measured on starcom.app, 1 Nov 2026: a caller's setLayer('ResourceZones') after whenReady was undone by the
// link's own setLayer (?mode=GeoPolitical's default) in three runs of five, and the cards showed the wrong layer.
describe('a link yields to whoever drives the handle', () => {
  afterEach(() => resetLinkYield());

  it("leaves a part the caller has chosen, and applies the rest", async () => {
    const { handle, calls } = driver();
    // An agent has set its own layer and window through the handle before the link's turn.
    noteHandleCall('setLayer');
    noteHandleCall('setTimeWindow');
    apply('?v=1&sub=DiplomaticEvents&pin=SpaceWeather&at=25,45,1.4&win=1790899200..1791158400', handle);
    await waitFor(() => expect(calls).toContain('setView {"lat":25,"lng":45,"altitude":1.4}'));
    expect(calls.some((c) => c.startsWith('setLayer') || c.startsWith('pinLayers') || c.startsWith('setTimeWindow'))).toBe(false);
  });

  // The release check, 1 Nov: the caller's setLayer came while the link was still waiting for the globe, and the
  // first version counted the whole wait as the link's own call.
  it("counts a caller's call made while the link is still waiting for the globe", async () => {
    const { handle, calls } = driver();
    let ready: () => void = () => {};
    handle.whenReady = vi.fn(() => new Promise<{ ready: boolean; waitedMs: number }>((resolve) => {
      ready = () => { calls.push('whenReady'); resolve({ ready: true, waitedMs: 0 }); };
    }));
    const installed = noticedWhenUsed(handle);
    apply('?v=1&sub=DiplomaticEvents&at=25,45,1.4', installed);
    await waitFor(() => expect(handle.whenReady).toHaveBeenCalled());
    // The caller sets its own layer through the installed handle while the link waits.
    installed.setLayer('ResourceZones');
    ready();
    await waitFor(() => expect(calls).toContain('setView {"lat":25,"lng":45,"altitude":1.4}'));
    expect(calls.filter((c) => c.startsWith('setLayer'))).toEqual(['setLayer ResourceZones {}']);
  });

  it("does not count the link's own calls through the installed handle as a caller's", async () => {
    const { handle, calls } = driver();
    const installed = noticedWhenUsed(handle);
    apply(`?v=1&sub=DrugCheckAlerts&at=48.2,16.4,1.3&focus=${FOCUS}`, installed);
    await waitFor(() => expect(calls).toContain(`focusReport ${FOCUS}`));
    expect(calls).toContain('setLayer DrugCheckAlerts {"pin":false,"clearOtherPins":true}');
    expect(calls).toContain(`frameReports ${FOCUS}`);
  });

  it("an address names a layer, camera and window: a caller's composeFor takes all three", async () => {
    const { handle, calls } = driver();
    noteHandleCall('composeFor');
    apply('?v=1&sub=DiplomaticEvents&at=25,45,1.4&win=1790899200..1791158400', handle);
    await waitFor(() => expect(calls).toContain('whenReady'));
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual(['whenReady']);
  });
});

describe('a link\'s look (deeplink v2)', () => {
  it('is applied at once, for this visit, without waiting for the globe', async () => {
    const look = vi.fn();
    renderHook(() => useApplyDeeplink({ handle: () => undefined, search: '?v=2&sub=WarConflict&look=blueMarble,headlamp,0.3', look, pollMs: 10 }));
    await waitFor(() => expect(look).toHaveBeenCalledWith({ skin: 'blueMarble', lightMode: 'headlamp', nightFill: 0.3 }));
  });

  it('shows the look without changing the visitor\'s saved choice', async () => {
    resetGlobeAppearanceForTests();
    localStorage.removeItem('starcom-globe-appearance');
    renderHook(() => useApplyDeeplink({ handle: () => undefined, search: '?v=2&look=,headlamp', pollMs: 10 }));
    await waitFor(() => expect(getGlobeAppearance().lightMode).toBe('headlamp'));
    expect(localStorage.getItem('starcom-globe-appearance')).toBeNull();
    resetGlobeAppearanceForTests();
  });

  it('changes no look when the link states none', async () => {
    const look = vi.fn();
    const { handle, calls } = driver();
    renderHook(() => useApplyDeeplink({ handle: () => handle, search: '?v=1&sub=WarConflict', look, pollMs: 10 }));
    await waitFor(() => expect(calls).toContain('setLayer WarConflict {"pin":false,"clearOtherPins":true}'));
    expect(look).not.toHaveBeenCalled();
  });
});

