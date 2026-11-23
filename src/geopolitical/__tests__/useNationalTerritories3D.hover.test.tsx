/**
 * A country is hovered only under a pointer that is there: none before a pointer
 * has moved over the page (a phone, or an agent's headless browser), and none
 * left behind when a finger lifts. Picking from a pointer that never was, the
 * centre of the canvas, hovered the country in the middle of the screen and put
 * its "Click for details" at the page's corner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { territoryBatchData } from '../geometry/territoryBatch';

const config = {
  style: 'classic' as const,
  borderVisibility: 70,
  borderThickness: 1,
  territoryColors: { useCustomColors: false, opacity: 50 },
  fillElevationEpsilon: 0.2,
  bvhPicking: false,
  showDisputedTerritories: true,
  showMaritimeBorders: false,
  labelVisibility: 60,
  highlightOnHover: true,
  reducedMotion: true,
  lod: { mode: 'locked' as const, lockedLevel: 0 as const, hysteresis: 25 },
};

// One country, large enough that the middle of the screen lands in it.
const parts = [{ id: 'USA', countryCode: 'USA', positions: [-20, -20, 100, 20, -20, 100, 0, 20, 100], indices: [0, 1, 2] }];

let now = 0;
let frames: FrameRequestCallback[] = [];
/** Runs the frames due, as the browser would, a few times so a hover can settle. */
const run = (times = 6) => act(() => {
  for (let i = 0; i < times; i++) {
    now += 50;
    const due = frames.splice(0);
    due.forEach((frame) => frame(now));
  }
});

/** A pointer event of a kind at the middle of the 200×200 canvas, on `target` (the window unless told). */
function pointer(type: string, pointerType: 'mouse' | 'touch', target: EventTarget = window) {
  const event = new MouseEvent(type, { clientX: 100, clientY: 100, button: 0, bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  act(() => { target.dispatchEvent(event); });
}

async function mount() {
  vi.resetModules();
  const [hook, service] = await Promise.all([
    import('../hooks/useNationalTerritories3D'),
    import('../services/NationalTerritoriesService'),
  ]);
  vi.spyOn(service.nationalTerritoriesService, 'loadBordersLOD').mockResolvedValue([] as never);
  vi.spyOn(service.nationalTerritoriesService, 'loadTerritoriesLODResolved').mockResolvedValue({ kind: 'baked', parts } as never);
  const scene = new THREE.Scene();
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 2000);
  const hovered: Array<string | null> = [];
  const onHoverChange = (info: { countryCode?: string } | null) => hovered.push(info?.countryCode ?? null);
  const rendered = renderHook(() => hook.useNationalTerritories3D({
    enabled: true, scene, camera, config: config as never, onHoverChange: onHoverChange as never, getCanvas: () => canvas,
  }));
  let mesh: THREE.Mesh | null = null;
  await waitFor(() => {
    scene.traverse((o) => { if (!mesh && o instanceof THREE.Mesh && o.name === 'territories') mesh = o; });
    expect(mesh).not.toBeNull();
  });
  // The camera looks straight down at the country's middle, from outside the globe.
  scene.updateMatrixWorld(true);
  const centre = new THREE.Vector3(0, 0, 100);
  mesh!.localToWorld(centre);
  camera.position.copy(centre.clone().multiplyScalar(3));
  camera.lookAt(centre);
  camera.updateMatrixWorld(true);
  return { rendered, hovered, canvas, mesh: mesh! as THREE.Mesh };
}

describe('a country is hovered only under a pointer that is there', () => {
  beforeEach(() => {
    now = 0;
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => { frames.push(frame); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('hovers nothing before a pointer has moved, though a country fills the middle of the screen', async () => {
    const t = await mount();
    run();
    expect(t.hovered).toEqual([]);
    t.rendered.unmount();
  });

  it('hovers the country under a mouse', async () => {
    const t = await mount();
    pointer('pointermove', 'mouse');
    run();
    expect(t.hovered).toEqual(['USA']);
    t.rendered.unmount();
  });

  it('hovers under a finger while it is down, and nothing once it lifts', async () => {
    const t = await mount();
    pointer('pointermove', 'touch');
    run();
    expect(t.hovered).toEqual(['USA']);
    pointer('pointerup', 'touch');
    run();
    expect(t.hovered).toEqual(['USA', null]);
    t.rendered.unmount();
  });

  it('keeps a mouse\'s hover when its button comes up: a mouse is still there', async () => {
    const t = await mount();
    pointer('pointermove', 'mouse');
    run();
    pointer('pointerup', 'mouse');
    run();
    expect(t.hovered).toEqual(['USA']);
    t.rendered.unmount();
  });

  it('lights up a tapped country though the finger has gone: no pointer is a miss, not a stop', async () => {
    const t = await mount();
    pointer('pointerdown', 'touch', t.canvas);
    pointer('pointerup', 'touch', t.canvas);
    run();
    expect(territoryBatchData(t.mesh)!.motion.select[0]).toBe(1);
    expect(t.hovered).toEqual([]);
    t.rendered.unmount();
  });
});
