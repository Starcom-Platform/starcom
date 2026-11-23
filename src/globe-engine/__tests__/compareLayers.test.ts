/**
 * Two layers side by side (D-CM, CM1): only a layer that names its objects may be compared; while a comparison is
 * chosen, a render of the globe's scene to the screen is two, each in its own half with the other layer hidden, and
 * everything is as it was after; another scene, or a render into a target (the Sun's glow), is drawn whole.
 *
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  comparableLayers, currentComparison, installComparison, registerLayerFinder, registerLayerRoot, resetComparisonForTests, setComparison,
} from '../compareLayers';

beforeEach(() => { resetComparisonForTests(); });

/** A renderer as far as the comparison uses one: its size, scissor and target, and a record of each render. */
function fakeRenderer(width = 1000, height = 600) {
  const passes: Array<{ scissor: number[] | null; visible: Record<string, boolean> }> = [];
  let scissor: number[] = [0, 0, width, height];
  let scissorTest = false;
  let target: THREE.WebGLRenderTarget | null = null;
  const watched: Record<string, THREE.Object3D> = {};
  const renderer = {
    getSize: (v: THREE.Vector2) => v.set(width, height),
    getScissorTest: () => scissorTest,
    setScissorTest: (on: boolean) => { scissorTest = on; },
    setScissor: (x: number, y: number, w: number, h: number) => { scissor = [x, y, w, h]; },
    getRenderTarget: () => target,
    setRenderTarget: (t: THREE.WebGLRenderTarget | null) => { target = t; },
    render: () => {
      passes.push({ scissor: scissorTest ? [...scissor] : null, visible: Object.fromEntries(Object.entries(watched).map(([k, o]) => [k, o.visible])) });
    },
  } as unknown as THREE.WebGLRenderer;
  return { renderer, passes, watched, scissor: () => scissor, scissorTest: () => scissorTest };
}

describe('the layers that can be compared', () => {
  it('are those that have named their objects, while they stand', () => {
    const quakes = new THREE.Group();
    const off = registerLayerRoot('EcologicalDisasters', quakes);
    const stillOn = registerLayerRoot('EarthWeather', new THREE.Group());
    expect(comparableLayers().sort()).toEqual(['EarthWeather', 'EcologicalDisasters']);
    off();
    expect(comparableLayers()).toEqual(['EarthWeather']);
    stillOn();
    expect(comparableLayers()).toEqual([]);
  });

  it('is no comparison of a layer with itself', () => {
    setComparison({ left: 'EarthWeather', right: 'EarthWeather' });
    expect(currentComparison()).toBeNull();
  });
});

describe('a comparison drawn', () => {
  it('draws each half once, the other layer hidden, and leaves everything as it was', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const { renderer, passes, watched, scissorTest } = fakeRenderer();
    watched.quakes = new THREE.Group();
    watched.weather = new THREE.Group();
    registerLayerRoot('EcologicalDisasters', watched.quakes);
    registerLayerRoot('EarthWeather', watched.weather);
    const stop = installComparison(renderer, scene);
    renderer.render(scene, camera);
    expect(passes).toEqual([{ scissor: null, visible: { quakes: true, weather: true } }]);
    setComparison({ left: 'EcologicalDisasters', right: 'EarthWeather' });
    passes.length = 0;
    renderer.render(scene, camera);
    expect(passes).toEqual([
      { scissor: [0, 0, 500, 600], visible: { quakes: true, weather: false } },
      { scissor: [500, 0, 500, 600], visible: { quakes: false, weather: true } },
    ]);
    expect([watched.quakes.visible, watched.weather.visible, scissorTest()]).toEqual([true, true, false]);
    stop();
    passes.length = 0;
    renderer.render(scene, camera);
    expect(passes).toHaveLength(1);
  });

  it("hides another library's objects of a layer, found as each half is drawn, and makes no layer comparable alone", () => {
    const scene = new THREE.Scene();
    const { renderer, passes, watched } = fakeRenderer();
    watched.intelArc = new THREE.Group();
    watched.warArc = new THREE.Group();
    let warArcs: THREE.Object3D[] = [];
    registerLayerFinder('IntelReports', () => [watched.intelArc]);
    const stopFinding = registerLayerFinder('WarConflict', () => warArcs);
    expect(comparableLayers()).toEqual([]);
    registerLayerRoot('IntelReports', new THREE.Group());
    registerLayerRoot('WarConflict', new THREE.Group());
    installComparison(renderer, scene);
    setComparison({ left: 'IntelReports', right: 'WarConflict' });
    // Made afresh after the finder was named: found as the half is drawn.
    warArcs = [watched.warArc];
    renderer.render(scene, new THREE.PerspectiveCamera());
    expect(passes.map((p) => [p.visible.intelArc, p.visible.warArc])).toEqual([[true, false], [false, true]]);
    expect([watched.intelArc.visible, watched.warArc.visible]).toEqual([true, true]);
    stopFinding();
    passes.length = 0;
    renderer.render(scene, new THREE.PerspectiveCamera());
    expect(passes.map((p) => p.visible.warArc)).toEqual([true, true]);
  });

  it('keeps a layer hidden by its own switch hidden in its half', () => {
    const scene = new THREE.Scene();
    const { renderer, passes, watched } = fakeRenderer();
    watched.quakes = new THREE.Group();
    watched.quakes.visible = false;
    registerLayerRoot('EcologicalDisasters', watched.quakes);
    registerLayerRoot('EarthWeather', new THREE.Group());
    installComparison(renderer, scene);
    setComparison({ left: 'EcologicalDisasters', right: 'EarthWeather' });
    renderer.render(scene, new THREE.PerspectiveCamera());
    expect(passes.map((p) => p.visible.quakes)).toEqual([false, false]);
    expect(watched.quakes.visible).toBe(false);
  });

  it('draws another scene, or a render into a target, whole', () => {
    const scene = new THREE.Scene();
    const { renderer, passes } = fakeRenderer();
    installComparison(renderer, scene);
    setComparison({ left: 'EcologicalDisasters', right: 'EarthWeather' });
    renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    renderer.setRenderTarget({} as THREE.WebGLRenderTarget);
    renderer.render(scene, new THREE.PerspectiveCamera());
    expect(passes).toHaveLength(2);
    expect(passes.every((p) => p.scissor === null)).toBe(true);
  });
});

describe('starting and ending a comparison', () => {
  it('pins a layer not drawn, and lets go of only what it pinned', async () => {
    const { beginComparison, endComparison } = await import('../compareLayers');
    const active = new Set(['EcologicalDisasters']);
    const pins = {
      isLayerActive: (l: string) => active.has(l),
      pinLayer: (l: string) => { active.add(l); },
      unpinLayer: (l: string) => { active.delete(l); },
    };
    beginComparison({ left: 'EcologicalDisasters', right: 'EarthWeather' }, pins);
    expect(currentComparison()).toEqual({ left: 'EcologicalDisasters', right: 'EarthWeather' });
    expect([...active].sort()).toEqual(['EarthWeather', 'EcologicalDisasters']);
    // Another started ends the first, its pin let go.
    beginComparison({ left: 'EcologicalDisasters', right: 'ConflictZones' }, pins);
    expect([...active].sort()).toEqual(['ConflictZones', 'EcologicalDisasters']);
    endComparison(pins);
    expect([...active]).toEqual(['EcologicalDisasters']);
    expect(currentComparison()).toBeNull();
  });
});

describe('where the halves meet', () => {
  it("is the screen's middle, wherever a card's window of it is", async () => {
    const { splitAt } = await import('../compareLayers');
    const camera = new THREE.PerspectiveCamera(50, 2);
    expect(splitAt(camera, 1000)).toBe(500);
    // A window from x 600 to 1000 of a 1200-wide view, drawn 800 wide: the middle (600) is its left edge.
    camera.setViewOffset(1200, 600, 600, 0, 400, 600);
    expect(splitAt(camera, 800)).toBe(0);
    // A window from 200 to 800: the screen's middle (600) is 400 into it.
    camera.setViewOffset(1200, 600, 200, 0, 600, 600);
    expect(splitAt(camera, 600)).toBe(400);
    // A window from 0 to 400: all of it left of the middle.
    camera.setViewOffset(1200, 600, 0, 0, 400, 600);
    expect(splitAt(camera, 400)).toBe(400);
  });
});

describe('one layer at two moments (CM4)', () => {
  it('keeps the timeless objects in both halves, and pins the layer, never its other moment', async () => {
    const { beginComparison, momentComparison, thenOf, comparableLayers: listed } = await import('../compareLayers');
    const scene = new THREE.Scene();
    const { renderer, passes, watched } = fakeRenderer();
    watched.quakes = new THREE.Group();
    watched.plates = new THREE.Group();
    watched.then = new THREE.Group();
    registerLayerRoot('EcologicalDisasters', watched.quakes);
    registerLayerRoot('EcologicalDisasters', watched.plates, { timeless: true });
    registerLayerRoot(thenOf('EcologicalDisasters'), watched.then);
    expect(listed()).toEqual(['EcologicalDisasters']);
    const pinned: string[] = [];
    beginComparison(momentComparison('EcologicalDisasters', { earlier: '1y' }), {
      isLayerActive: () => false, pinLayer: (l) => { pinned.push(l); }, unpinLayer: () => {},
    });
    expect(pinned).toEqual(['EcologicalDisasters']);
    installComparison(renderer, scene);
    renderer.render(scene, new THREE.PerspectiveCamera());
    expect(passes.map((p) => p.visible)).toEqual([
      { quakes: true, plates: true, then: false },
      { quakes: false, plates: true, then: true },
    ]);
  });

  it('holds a window in the left half, the time bar\'s in the right', async () => {
    const { momentComparison } = await import('../compareLayers');
    expect(momentComparison('EcologicalDisasters', { held: { from: 1, until: 2 } })).toMatchObject({ left: 'EcologicalDisasters@then', right: 'EcologicalDisasters' });
    expect(momentComparison('EcologicalDisasters', { earlier: '1w' })).toMatchObject({ left: 'EcologicalDisasters', right: 'EcologicalDisasters@then' });
  });

  it('draws a forecast hour in the right half (CM5)', async () => {
    const { momentComparison } = await import('../compareLayers');
    expect(momentComparison('EarthWeather', { ahead: 24 })).toEqual({
      left: 'EarthWeather', right: 'EarthWeather@then', moment: { layer: 'EarthWeather', pick: { ahead: 24 } },
    });
  });
});
