/**
 * Moon and planet imagery is fetched as the camera approaches, not at start.
 *
 * The solar system is built for every globe layer, and building it fetched every
 * planet texture and both Moon textures at once — 4.03 MB, measured server-side on
 * 2026-09-25 — although none of it is drawn in any normal view or share capture.
 *
 * So fetching waits until the camera is heading out: PREFETCH_DISTANCE is short of
 * where the solar system starts to show, so the imagery has a head start and does
 * not pop in.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Moon } from '../components/Moon';
import { PlanetarySystemManager } from '../PlanetarySystemManager';
import { SolarSystemManager, PREFETCH_DISTANCE } from '../SolarSystemManager';
import { solarSystemShownFor } from '../../components/Globe/zoomOutFade';

const moonUrls = (calls: unknown[][]) => calls.filter(([url]) => /moon\//.test(String(url)));
const planetUrls = (calls: unknown[][]) => calls.filter(([url]) => /planets\//.test(String(url)));

afterEach(() => vi.restoreAllMocks());

describe('the Moon', () => {
  it('fetches nothing when it is built', () => {
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'load');
    const moon = new Moon(new THREE.Scene());
    expect(moonUrls(load.mock.calls)).toHaveLength(0);
    moon.dispose();
  });

  it('fetches its imagery once, on prefetch or when shown, and no bump map', () => {
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'load');
    const moon = new Moon(new THREE.Scene());
    moon.prefetchTextures();
    moon.prefetchTextures();
    moon.setShown(1);
    expect(moonUrls(load.mock.calls)).toHaveLength(1);
    moon.dispose();
  });
});

describe('the planetary system', () => {
  it('fetches no imagery when it is built', () => {
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'load');
    const system = new PlanetarySystemManager(new THREE.Scene());
    expect(planetUrls(load.mock.calls)).toHaveLength(0);
    expect(moonUrls(load.mock.calls)).toHaveLength(0);
    system.dispose();
  });

  it('prefetches every planet and the Moon together', () => {
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'load');
    const system = new PlanetarySystemManager(new THREE.Scene());
    system.prefetchTextures();
    expect(planetUrls(load.mock.calls).length).toBeGreaterThanOrEqual(7);
    expect(moonUrls(load.mock.calls)).toHaveLength(1);
    system.dispose();
  });
});

describe('the approach threshold', () => {
  it('sits past every capture altitude and short of where the solar system shows in a 900-pixel view', () => {
    // A capture at 3.5 globe radii is 450 units out.
    expect(PREFETCH_DISTANCE).toBeGreaterThan(450);
    const camera = new THREE.PerspectiveCamera(50, 1400 / 900);
    camera.position.set(0, 0, PREFETCH_DISTANCE);
    camera.updateMatrixWorld(true);
    const renderer = { getSize: (v: THREE.Vector2) => v.set(1400, 900) } as unknown as THREE.WebGLRenderer;
    expect(solarSystemShownFor(renderer, camera)).toBe(0);
  });

  it('fetches nothing at a normal globe altitude, and prefetches once past the threshold', () => {
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'load');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const manager = new SolarSystemManager({ scene, camera, globe: { scene: () => scene, camera: () => camera } });

    manager.frame({ eye: new THREE.Vector3(0, 0, 350), shown: 0, atMs: Date.now() }); // altitude 2.5 — the default view
    expect(planetUrls(load.mock.calls)).toHaveLength(0);

    manager.frame({ eye: new THREE.Vector3(0, 0, PREFETCH_DISTANCE + 1), shown: 0, atMs: Date.now() });
    expect(planetUrls(load.mock.calls).length).toBeGreaterThanOrEqual(7);
    manager.dispose();
  });
});
