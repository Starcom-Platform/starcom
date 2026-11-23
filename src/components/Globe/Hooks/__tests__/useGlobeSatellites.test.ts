/**
 * The Satellites layer, tested through its hook (decision D-F, step 6.3).
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * Satellites was the one layer left `not-yet` for a reason other than wiring.
 * Its builder honoured a style and was tested for it, and a mutation deleting
 * the style from the HOOK's call survived every test in the tree. Two attempts
 * to close that failed: a hook test crashed the vitest worker, and a visual
 * check drew nothing. The hook owns a requestAnimationFrame loop and drives a
 * real SGP4 propagation service; mocking that service outright, and stubbing
 * the frame loop, is what makes the hook testable at all.
 *
 * ─── WHAT READING IT FOR THAT TURNED UP ────────────────────────────────────
 *
 * The style and the catalogue load lived in ONE effect, keyed on markerStyles
 * by identity. So picking a style for Satellites ran that effect's teardown —
 * satelliteVisualizationService.dispose(), which clears the catalogue — and
 * then initialize(), which loads it again. Restyling a layer reloaded its data.
 * The same happened once on every visit, when settings loaded on mount and
 * replaced the default choices object with the stored one.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { useGlobeSatellites, PLANE_KEY, SATELLITE_PLANES_TYPE, DEBRIS_LAPSE_KEY } from '../useGlobeSatellites';
import { DEBRIS_LAPSE_TYPE } from '../../debrisLapse';
import { getDebrisLapse, playDebrisLapse, stopDebrisLapse } from '../../../../features/globe/debrisLapse/debrisLapseStore';
import { MARKER_STYLES, type MarkerStyleChoices } from '../../markerStyles';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import { resetGlobeQualityForTests, setGlobeQualitySetting } from '../../../../services/globe/globeQuality';

const service = vi.hoisted(() => ({
  initialize: vi.fn(),
  getSatelliteData: vi.fn(),
  catalogue: vi.fn(),
  getStats: vi.fn(),
  getCurrentPositions: vi.fn(),
  isRefreshDue: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('../../../../services/Satellites/SatelliteVisualizationService', () => ({
  satelliteVisualizationService: service,
}));

/*
 * The propagator (D-GV GV2), standing in for the worker: each satellite where the catalogue below puts it, at the
 * first moment, and a little east at the second, so the blend between them can be seen.
 */
const propagation = vi.hoisted(() => ({ steps: [] as number[][], loads: 0 }));
vi.mock('../../../../services/Satellites/catalogPropagator', async () => {
  const { latLngToGlobeWorld } = await import('../../../../utils/globeCoordinates');
  return {
    createCatalogPropagator: () => {
      let count = 0;
      return {
        load: async (records: unknown[]) => { propagation.loads += 1; count = records.length; return { loaded: count, readable: count }; },
        step: async (timesMs: number[]) => {
          propagation.steps.push([...timesMs]);
          const sats = CATALOGUE.slice(0, count);
          const positions = timesMs.map((_, k) => {
            const out = new Float32Array(count * 3);
            sats.forEach((sat, i) => {
              const v = latLngToGlobeWorld(sat.lat, sat.lng + k, 100 * (1 + sat.altitude / 6371));
              out.set([v.x, v.y, v.z], i * 3);
            });
            return out;
          });
          return { timesMs: [...timesMs], positions, heights: Float32Array.from(sats.map((sat) => sat.altitude)) };
        },
        dispose: () => undefined,
      };
    },
  };
});

// A chosen satellite's lines (D-GV GV2), standing in for SGP4: a short orbit, a track and a footprint.
vi.mock('satellite.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('satellite.js')>()), json2satrec: () => ({ error: 0 }) }));
vi.mock('../../../../services/Satellites/satelliteTrack', () => ({
  satelliteTrack: () => ({
    orbit: [106, 0, 0, 0, 106, 0, -106, 0, 0, 0, -106, 0, 106, 0, 0],
    groundTrack: [[0, 0], [10, 10], [20, 20]],
    footprint: [[0, 20], [20, 0], [0, -20], [-20, 0], [0, 20]],
    now: { lat: 10, lng: 10, heightKm: 408 }, periodMin: 92.9, footprintDeg: 20.3,
  }),
}));

const CATALOGUE = vi.hoisted(() => [
  { id: 'iss', name: 'ISS (ZARYA)', lat: 10, lng: 20, altitude: 408, type: 'space_station', rawTle: { NORAD_CAT_ID: 25544 } },
  { id: 'gps', name: 'GPS BIIR-2', lat: -30, lng: 100, altitude: 20200, type: 'gps_satellite', rawTle: { NORAD_CAT_ID: 2 } },
  { id: 'sl', name: 'STARLINK-1', lat: 45, lng: -60, altitude: 550, type: 'starlink', rawTle: { NORAD_CAT_ID: 3 } },
  { id: 'sci', name: 'HST', lat: 0, lng: 0, altitude: 540, type: 'scientific', rawTle: { NORAD_CAT_ID: 4 } },
]);

const scene = () => new THREE.Scene();
/*
 * One ref per scene, as Globe.tsx's useRef gives: a ref's identity is stable by
 * contract. markerStyles is deliberately passed INLINE in the tests below — a
 * new object every render — because callers do that, and it is what used to
 * drive the effect round until the worker ran out of heap.
 */
const refs = new WeakMap<THREE.Scene, unknown>();
const globeRefFor = (s: THREE.Scene) => {
  if (!refs.has(s)) refs.set(s, { current: { scene: () => s } });
  return refs.get(s) as never;
};
const isLayerActive = (id: string) => id === 'Satellites';

/** The satellites' points, from the group the hook added to the scene. */
const pointsIn = (s: THREE.Scene): THREE.Points | undefined => {
  let found: THREE.Points | undefined;
  s.traverse((o) => { if ((o as THREE.Points).isPoints && o.userData?.type === 'satelliteGroup') found = o as THREE.Points; });
  return found;
};
const definesIn = (s: THREE.Scene) => ({ ...((pointsIn(s)?.material as THREE.ShaderMaterial)?.defines ?? {}) });

describe('useGlobeSatellites', () => {
  beforeEach(() => {
    resetLegendsForTest();
    service.initialize.mockReset().mockResolvedValue(undefined);
    service.getSatelliteData.mockReset().mockResolvedValue(CATALOGUE);
    service.catalogue.mockReset().mockReturnValue(CATALOGUE);
    propagation.steps = [];
    propagation.loads = 0;
    service.getStats.mockReset().mockReturnValue({ lastUpdate: new Date('2026-09-19T12:00:00Z') });
    service.getCurrentPositions.mockReset().mockReturnValue([]);
    service.isRefreshDue.mockReset().mockReturnValue(false);
    service.dispose.mockReset();
    // The hook's position loop. Never advanced: the style is what is under test.
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('gives every satellite drawn a note a click opens, in the order drawn (C5)', async () => {
    const s = scene();
    renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));

    await waitFor(() => expect(pointsIn(s)).toBeDefined());
    const opens = pointsIn(s)!.userData.opens as Array<{ heading: string; notes: Array<{ title: string }> }>;
    expect(opens.map((set) => set.notes[0].title)).toEqual(CATALOGUE.map((sat) => sat.name));
    expect(opens.every((set) => set.heading === 'Satellites')).toBe(true);
  });

  describe('the whole catalogue, moving (D-GV GV2)', () => {
    it('draws every satellite with elements, propagated together, where a hundred were chosen', async () => {
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));
      await waitFor(() => expect(pointsIn(s)).toBeDefined());
      expect(pointsIn(s)!.geometry.getAttribute('position').count).toBe(CATALOGUE.length);
      expect(propagation.loads).toBe(1);
      // Two moments a second apart.
      expect(propagation.steps[0][1] - propagation.steps[0][0]).toBe(1000);
    });

    it('blends from the first moment toward the second as time passes, and holds at the second', async () => {
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));
      await waitFor(() => expect(pointsIn(s)).toBeDefined());
      const points = pointsIn(s)!;
      const next = points.geometry.getAttribute('positionNext');
      const first = points.geometry.getAttribute('position');
      expect(next.getX(0)).not.toBeCloseTo(first.getX(0), 3);
      const from = propagation.steps[0][0];
      const renderer = { getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(800, 600) } as unknown as THREE.WebGLRenderer;
      const camera = new THREE.PerspectiveCamera();
      const blendAt = (ms: number) => {
        vi.spyOn(Date, 'now').mockReturnValue(ms);
        points.onBeforeRender(renderer, s, camera, points.geometry, points.material as THREE.Material, null as never);
        return (points.material as THREE.ShaderMaterial).uniforms.blend.value as number;
      };
      expect(blendAt(from + 250)).toBeCloseTo(0.25, 5);
      expect(blendAt(from + 900)).toBeCloseTo(0.9, 5);
      expect(blendAt(from + 5000)).toBe(1);
      vi.restoreAllMocks();
    });

    it("makes a satellite's note only when it is read", async () => {
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));
      await waitFor(() => expect(pointsIn(s)).toBeDefined());
      const opens = pointsIn(s)!.userData.opens as Array<{ notes: Array<{ title: string; text: string }> }>;
      expect(opens).toHaveLength(CATALOGUE.length);
      expect(opens[1].notes[0].title).toBe('GPS BIIR-2');
      expect(opens[1].notes[0].text).toContain('Altitude about 20200 km');
      expect(opens[1]).toBe(opens[1]);
      expect(opens[99]).toBeUndefined();
    });
  });

  describe("the chosen satellite's orbit, ground track and footprint", () => {
    it('draws them while its note is open, and takes them away when it closes', async () => {
      const { openGlobeNotes, closeGlobeNotes } = await import('../../../../features/globe/noteDetail/globeNoteStore');
      const { SATELLITE_ORBIT_TYPE, SATELLITE_GROUND_TYPE } = await import('../useGlobeSatellites');
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));
      await waitFor(() => expect(pointsIn(s)).toBeDefined());
      const group = (type: string) => s.children.find((c) => c.userData.type === type)!;
      expect(group(SATELLITE_ORBIT_TYPE).children).toHaveLength(0);

      openGlobeNotes({ heading: 'Satellites', notes: [{ id: 'iss', kind: 'Satellite', title: 'ISS (ZARYA)', text: '', timeMs: null, sources: [] }] });
      expect(group(SATELLITE_ORBIT_TYPE).children).toHaveLength(1);
      // The ground track and the footprint, riding the territories' shell.
      expect(group(SATELLITE_GROUND_TYPE).children).toHaveLength(2);
      expect(group(SATELLITE_GROUND_TYPE).userData.type).toBe(SATELLITE_GROUND_TYPE);

      closeGlobeNotes();
      expect(group(SATELLITE_ORBIT_TYPE).children).toHaveLength(0);
      expect(group(SATELLITE_GROUND_TYPE).children).toHaveLength(0);
    });

    it('draws nothing for a note that is not a satellite\'s', async () => {
      const { openGlobeNotes, closeGlobeNotes } = await import('../../../../features/globe/noteDetail/globeNoteStore');
      const { SATELLITE_ORBIT_TYPE } = await import('../useGlobeSatellites');
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));
      await waitFor(() => expect(pointsIn(s)).toBeDefined());
      openGlobeNotes({ heading: 'War & Conflict', notes: [{ id: 'iss', kind: 'Conflict note', title: 'x', text: '', timeMs: null, sources: [] }] });
      expect(s.children.find((c) => c.userData.type === SATELLITE_ORBIT_TYPE)!.children).toHaveLength(0);
      closeGlobeNotes();
    });
  });

  describe('the style chosen for the layer', () => {
    /*
     * The mutation that kept this layer `not-yet`: deleting the style from the
     * hook's call left every builder test green.
     */
    it('reaches the marks the hook draws', async () => {
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive, markerStyles: { Satellites: 'ring' } }));

      await waitFor(() => expect(pointsIn(s)).toBeDefined());
      expect(definesIn(s)).toHaveProperty('STYLE_RING');
    });

    it('can be asked for every style a person can pick', async () => {
      for (const style of MARKER_STYLES) {
        const s = scene();
        const { unmount } = renderHook(() =>
          useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive, markerStyles: { Satellites: style } }));
        await waitFor(() => expect(pointsIn(s)).toBeDefined());
        const reached = Object.keys(definesIn(s)).find((k) => k.startsWith('STYLE_')) ?? 'STYLE_DISC';
        expect(reached).toBe(`STYLE_${style.toUpperCase()}`);
        unmount();
      }
    });

    it('ignores a style chosen for some other layer', async () => {
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive, markerStyles: { SpaceWeather: 'ring' } }));

      await waitFor(() => expect(pointsIn(s)).toBeDefined());
      expect(definesIn(s)).not.toHaveProperty('STYLE_RING');
    });

    it('tells the card which shape it drew', async () => {
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive, markerStyles: { Satellites: 'glow' } }));

      await waitFor(() => expect(getLegends().find((l) => l.layerId === 'Satellites')?.shapeMeans).toBe('glow'));
    });
  });

  describe('changing the style on a globe already drawn', () => {
    it('restyles the marks', async () => {
      const s = scene();
      const { rerender } = renderHook(
        ({ markerStyles }) => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive, markerStyles }),
        { initialProps: { markerStyles: { Satellites: 'disc' } as MarkerStyleChoices } },
      );
      await waitFor(() => expect(pointsIn(s)).toBeDefined());
      expect(definesIn(s)).not.toHaveProperty('STYLE_RING');

      rerender({ markerStyles: { Satellites: 'ring' } });

      await waitFor(() => expect(definesIn(s)).toHaveProperty('STYLE_RING'));
    });

    /*
     * The defect. Restyling is a change to how marks look; it must not clear
     * and reload the catalogue the marks are drawn from.
     */
    it('does not reload the catalogue to do it', async () => {
      const s = scene();
      const { rerender } = renderHook(
        ({ markerStyles }) => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive, markerStyles }),
        { initialProps: { markerStyles: { Satellites: 'disc' } as MarkerStyleChoices } },
      );
      await waitFor(() => expect(pointsIn(s)).toBeDefined());

      rerender({ markerStyles: { Satellites: 'ring' } });
      await waitFor(() => expect(definesIn(s)).toHaveProperty('STYLE_RING'));

      expect(service.initialize).toHaveBeenCalledTimes(1);
      expect(service.dispose).not.toHaveBeenCalled();
    });

    /*
     * The same defect, on every visit: settings load on mount and replace the
     * default choices object with the stored one — the same choices, in a new
     * object. That must not reload anything either.
     */
    it('does not reload when the same choices arrive in a new object', async () => {
      const s = scene();
      const { rerender } = renderHook(
        ({ markerStyles }) => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive, markerStyles }),
        { initialProps: { markerStyles: {} as MarkerStyleChoices } },
      );
      await waitFor(() => expect(pointsIn(s)).toBeDefined());

      rerender({ markerStyles: {} });
      rerender({ markerStyles: {} });

      expect(service.initialize).toHaveBeenCalledTimes(1);
      expect(service.dispose).not.toHaveBeenCalled();
    });
  });

  /*
   * What size says (decision D-F, 2026-09-19). Size and colour both encoded a
   * satellite's role — "role — stations largest" and "role" — so one channel was
   * spent twice, and size, which reads as MORE, carried a category: a station is
   * not more than debris. Altitude is already on position (satellites are drawn
   * at their true altitude) and the catalogue carries no physical size, so size
   * has nothing honest left to carry and is the same for every satellite.
   */
  describe('what size says', () => {
    it('draws every satellite the same size, whatever its role', async () => {
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));

      await waitFor(() => expect(pointsIn(s)).toBeDefined());
      const sizes = pointsIn(s)!.geometry.getAttribute('pointSize');
      const all = Array.from({ length: sizes.count }, (_, i) => sizes.getX(i));
      expect(all).toHaveLength(CATALOGUE.length);
      expect(new Set(all).size).toBe(1);
    });

    it('does not tell the card size means anything', async () => {
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));

      await waitFor(() => expect(getLegends().find((l) => l.layerId === 'Satellites')).toBeDefined());
      const legend = getLegends().find((l) => l.layerId === 'Satellites')!;
      expect(legend.sizeMeans).toBeUndefined();
      // One hue, the space kind's: brightness and the icon close in say the role (OR30).
      expect(legend.colorMeans).toBe('satellites; brighter the named roles, each its icon close in');
    });
  });

  describe('the rings of the planes (D-GV GV2, step 5)', () => {
    // Three GPS satellites in one plane: the propagator above places them where the catalogue's first three are.
    const GPS_PLANE = CATALOGUE.slice(0, 3).map((sat, i) => ({
      ...sat, id: `gps-${i}`, name: `GPS ${i}`, type: 'gps_satellite',
      rawTle: { NORAD_CAT_ID: 10 + i, INCLINATION: 55, RA_OF_ASC_NODE: i },
    }));
    const ringsIn = (s: THREE.Scene) => {
      let rings = 0;
      s.traverse((o) => { if (o.userData?.type === SATELLITE_PLANES_TYPE) rings += o.children.length; });
      return rings;
    };
    const keyHasRings = () => (getLegends().find((l) => l.layerId === 'Satellites')?.swatches ?? [])
      .some((swatch) => swatch.label === PLANE_KEY);
    afterEach(() => resetGlobeQualityForTests());

    it('draws a plane as a ring, with a line for it in the key', async () => {
      service.catalogue.mockReturnValue(GPS_PLANE);
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));

      await waitFor(() => expect(ringsIn(s)).toBe(1));
      expect(keyHasRings()).toBe(true);
    });

    it('gives the rings up where the governor steps a device down, and keeps every satellite', async () => {
      service.catalogue.mockReturnValue(GPS_PLANE);
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));
      await waitFor(() => expect(ringsIn(s)).toBe(1));

      act(() => setGlobeQualitySetting('low'));
      await waitFor(() => expect(ringsIn(s)).toBe(0));
      expect(keyHasRings()).toBe(false);
      expect(pointsIn(s)!.geometry.getAttribute('position').count).toBe(GPS_PLANE.length);

      act(() => setGlobeQualitySetting('high'));
      await waitFor(() => expect(ringsIn(s)).toBe(1));
      expect(keyHasRings()).toBe(true);
      expect(propagation.loads).toBe(1);
    });
  });

  describe("the debris clouds' spread, modelled (D-GV GV2, step 6)", () => {
    // Three pieces of Fengyun-1C: the propagator above places them where the catalogue's first three are.
    const FENGYUN = CATALOGUE.slice(0, 3).map((sat, i) => ({
      ...sat, id: `deb-${i}`, name: `FENGYUN 1C DEB ${i}`, type: 'debris', debrisOf: 'debris-fengyun-1c',
      rawTle: { NORAD_CAT_ID: 20 + i, MEAN_MOTION: 14.0 + i * 0.2, ECCENTRICITY: 0.001, INCLINATION: 98.6 },
    }));
    const lapseIn = (s: THREE.Scene) => {
      let found: THREE.Points | undefined;
      s.traverse((o) => { if (o.userData?.type === DEBRIS_LAPSE_TYPE) found = o as THREE.Points; });
      return found;
    };
    const satellitesKey = () => getLegends().find((l) => l.layerId === 'Satellites');

    it('plays the debris alone from the first breakup, said as modelled, and gives the live view back when stopped', async () => {
      service.catalogue.mockReturnValue(FENGYUN);
      const s = scene();
      const { unmount } = renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));
      await waitFor(() => expect(getDebrisLapse().available).toBe(true));

      act(() => playDebrisLapse());
      expect(getDebrisLapse().atMs).toBe(Date.parse('2007-01-11T00:00:00Z'));
      expect(pointsIn(s)!.visible).toBe(false);
      expect(lapseIn(s)!.geometry.getAttribute('position').count).toBe(FENGYUN.length);
      expect(satellitesKey()).toMatchObject({ when: 'modelled, Jan 2007', swatches: [{ label: DEBRIS_LAPSE_KEY }] });

      act(() => stopDebrisLapse());
      expect(getDebrisLapse().atMs).toBeNull();
      expect(pointsIn(s)!.visible).toBe(true);
      expect(lapseIn(s)).toBeUndefined();
      expect(satellitesKey()?.when).toBeUndefined();

      unmount();
      expect(getDebrisLapse().available).toBe(false);
    });

    it('offers no lapse for a catalogue with no debris clouds in it', async () => {
      const s = scene();
      renderHook(() => useGlobeSatellites({ globeRef: globeRefFor(s), isLayerActive }));
      await waitFor(() => expect(pointsIn(s)).toBeDefined());
      expect(getDebrisLapse().available).toBe(false);
    });
  });
});
