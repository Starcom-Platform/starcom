/**
 * The territories drawn in the style each render draws (decision K5, TS3): the
 * screen's between captures, the card's during one, switched at the start of the
 * render with nothing rebuilt.
 *
 * Every module is loaded fresh for each test: the layer registry, the capture
 * clock, the key and the drawn look are module singletons, and a registry entry
 * left by one test would hold the previous hook's groups.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';

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

const parts = [
  { id: 'USA', countryCode: 'USA', positions: [0, 0, 100, 1, 0, 100, 0, 1, 100], indices: [0, 1, 2] },
  { id: 'CAN', countryCode: 'CAN', positions: [0, 0, 100, -1, 0, 100, 0, -1, 100], indices: [0, 1, 2] },
];
const borders = [{ id: 'settled', coordinates: [[0, 0], [1, 1]], classification: 'international' }];

async function load() {
  vi.resetModules();
  const [hook, service, lines, clock, look, legends, legendIds, theme, styles, lift] = await Promise.all([
    import('../hooks/useNationalTerritories3D'),
    import('../services/NationalTerritoriesService'),
    import('../geometry/lineBatches'),
    import('../../globe-engine/captureClock'),
    import('../../globe-engine/territoryLook'),
    import('../../services/globe/globeLegendStore'),
    import('../theme/borderLegend'),
    import('../theme/materialTheme'),
    import('../theme/territoryStyles'),
    import('../../globe-engine/shellLift'),
  ]);
  vi.spyOn(service.nationalTerritoriesService, 'loadBordersLOD').mockResolvedValue(borders as never);
  const loadFills = vi.spyOn(service.nationalTerritoriesService, 'loadTerritoriesLODResolved').mockResolvedValue({ kind: 'baked', parts } as never);
  return { hook, lines, clock, look, legends, legendIds, theme, styles, lift, loadFills };
}

async function mount(overrides: Partial<typeof config> = {}, looks?: unknown) {
  const m = await load();
  const scene = new THREE.Scene();
  // Another layer's root, as any mark layer adds one.
  const rider = m.lift.ridesShell(new THREE.Group());
  scene.add(rider);
  const camera = new THREE.PerspectiveCamera();
  const hook = renderHook(() => m.hook.useNationalTerritories3D({
    enabled: true, scene, camera, config: { ...config, ...overrides } as never, ...(looks ? { looks: looks as never } : {}),
  }));
  /** A render's start, as three.js runs it: the scene's own hook, before any object. */
  const render = () => scene.onBeforeRender(null as never, scene, camera, null as never, null as never, null as never);
  const fills = () => {
    let mesh: THREE.Mesh | null = null;
    scene.traverse((o) => { if (!mesh && o instanceof THREE.Mesh && o.name === 'territories') mesh = o; });
    return mesh as THREE.Mesh | null;
  };
  const settledColour = () => {
    let colour: number | null = null;
    scene.traverse((o) => { const line = m.lines.lineBatchData(o)?.lines.find((l) => l.id === 'settled'); if (line) colour = line.color; });
    return colour;
  };
  await waitFor(() => expect(fills()).not.toBeNull());
  const fillsGroup = () => fills()?.parent ?? null;
  return { ...m, scene, hook, render, fills, fillsGroup, settledColour, rider };
}
const uniform = (mesh: THREE.Mesh | null, name: string) => (mesh!.material as THREE.ShaderMaterial).uniforms[name].value;

describe('the territories in the style each render draws', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws the screen\'s Classic live, Quiet for a capture\'s render, and Classic again after', async () => {
    const t = await mount();
    t.render();
    expect(uniform(t.fills(), 'uOneColour')).toBe(0);
    expect(t.settledColour()).toBe(t.styles.CLASSIC_INTERNATIONAL_BORDER);

    t.clock.stillMotion(1_000);
    t.render();
    expect(uniform(t.fills(), 'uOneColour')).toBe(1);
    expect(t.settledColour()).toBe(t.theme.BORDER_CLASS_COLORS.international);

    t.clock.releaseMotion();
    t.render();
    expect(uniform(t.fills(), 'uOneColour')).toBe(0);
    expect(t.settledColour()).toBe(t.styles.CLASSIC_INTERNATIONAL_BORDER);
    t.hook.unmount();
  });

  it('draws Quiet live where the screen chose Quiet', async () => {
    const t = await mount({ style: 'quiet' });
    t.render();
    expect(uniform(t.fills(), 'uOneColour')).toBe(1);
    t.hook.unmount();
  });

  it('keys the screen in its own style, records what was drawn for cards, and withdraws both when it goes', async () => {
    const t = await mount();
    const { BORDERS_LEGEND_ID, COUNTRIES_LEGEND_ID } = t.legendIds;
    await waitFor(() => expect(t.legends.getLegends().map((l) => l.layerId)).toEqual([BORDERS_LEGEND_ID, COUNTRIES_LEGEND_ID]));
    expect(t.look.territoriesDrawn()).toEqual({ borderKinds: ['international'], fills: true });
    t.hook.unmount();
    expect(t.legends.getLegends()).toEqual([]);
    expect(t.look.territoriesDrawn()).toEqual({ borderKinds: [], fills: false });
  });

  it('keys the screen\'s borders in the colours its style was given', async () => {
    const m = await import('../theme/territoryStyles');
    const looks = { ...m.TERRITORY_STYLE_DEFAULTS, classic: { ...m.TERRITORY_STYLE_DEFAULTS.classic, borderColours: { ...m.TERRITORY_STYLE_DEFAULTS.classic.borderColours, international: 'violet' } } };
    const t = await mount({}, looks);
    const { BORDERS_LEGEND_ID } = t.legendIds;
    await waitFor(() => expect(t.legends.getLegends().find((l) => l.layerId === BORDERS_LEGEND_ID)).toBeDefined());
    const settled = t.legends.getLegends().find((l) => l.layerId === BORDERS_LEGEND_ID)!.swatches[0];
    expect(settled.color).toBe(t.legends.cssColorOf(m.BORDER_SWATCHES.violet.hex));
    t.hook.unmount();
  });

  it('takes each style\'s look from the looks it is given, so a card draws the card style\'s', async () => {
    const m = await import('../theme/territoryStyles');
    const looks = { ...m.TERRITORY_STYLE_DEFAULTS, quiet: { ...m.TERRITORY_STYLE_DEFAULTS.quiet, fillOpacity: 20 } };
    const t = await mount({}, looks);
    t.render();
    expect(uniform(t.fills(), 'uOpacity')).toBeCloseTo(m.TERRITORY_STYLE_DEFAULTS.classic.fillOpacity / 100);
    t.clock.stillMotion(1_000);
    t.render();
    expect(uniform(t.fills(), 'uOpacity')).toBeCloseTo(0.2);
    t.clock.releaseMotion();
    t.hook.unmount();
  });

  /*
   * The hook is handed a new config object on every render here, as a settings
   * change during the first build would hand it one. That started a second first
   * build (and, in a locked level of detail, a third), whose groups took the refs
   * while the first's stayed in the scene: the look was put on groups nobody saw.
   */
  it('builds once, however often it renders before the first build lands, so the look reaches what is drawn', async () => {
    const t = await mount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(t.loadFills).toHaveBeenCalledTimes(1);
    let meshes = 0;
    t.scene.traverse((o) => { if (o instanceof THREE.Mesh && o.name === 'territories') meshes += 1; });
    expect(meshes).toBe(1);
    t.hook.unmount();
  });
});

describe('the layer fading in over the cross-fade length it is given (decision K5, step 5)', () => {
  beforeEach(() => {
    // No frame ever comes: a fade that waits for one stays where it started.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const borderOpacity = (scene: THREE.Scene) => {
    let opacity: number | null = null;
    scene.traverse((o) => { if (opacity === null && o instanceof THREE.Mesh && (o as THREE.Mesh).geometry.getAttribute('instanceStart')) opacity = ((o as THREE.Mesh).material as THREE.Material).opacity; });
    return opacity;
  };

  it('fades in over its length, and appears at once at 0', async () => {
    const slow = await mount({ reducedMotion: false });
    expect(borderOpacity(slow.scene)).toBe(0);
    slow.hook.unmount();
    const instant = await mount({ reducedMotion: false, crossFadeMs: 0 } as never);
    expect(borderOpacity(instant.scene)).toBeGreaterThan(0);
    instant.hook.unmount();
  });
});

describe('the groups the scene draws are the ones this mount built', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const meshesIn = (scene: THREE.Scene) => {
    const found: THREE.Mesh[] = [];
    scene.traverse((o) => { if (o instanceof THREE.Mesh && o.name === 'territories') found.push(o); });
    return found;
  };

  it('takes them out of the scene when the layer goes with the overlay still on', async () => {
    const t = await mount();
    expect(meshesIn(t.scene)).toHaveLength(1);
    t.hook.unmount();
    expect(meshesIn(t.scene)).toHaveLength(0);
    expect(t.settledColour()).toBeNull();
  });

  it('refuses a card when the groups it styles are not the ones the scene draws', async () => {
    const t = await mount();
    t.render();
    t.scene.remove(t.fillsGroup()!);
    t.clock.stillMotion(1_000);
    t.render();
    t.clock.releaseMotion();
    expect(t.look.territoriesMissedCardStyle()).toMatch(/not redrawn/);
    t.hook.unmount();
  });

  it('puts its own in place of any an earlier mount left under the same ids, and styles what is drawn', async () => {
    const m = await load();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    // An earlier mount's fills, left registered and drawn, as built.
    const stale = new THREE.Group();
    const staleMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: { uOneColour: { value: 0 } } }));
    staleMesh.name = 'territories';
    stale.add(staleMesh);
    const registry = (await import('../LayerRegistry')).globalLayerRegistry;
    registry.register({ id: 'geopolitical-territories', order: 95, build: () => stale });
    registry.activate('geopolitical-territories', scene);

    const hook = renderHook(() => m.hook.useNationalTerritories3D({ enabled: true, scene, camera, config: config as never }));
    await waitFor(() => expect(meshesIn(scene)).not.toContain(staleMesh));
    expect(meshesIn(scene)).toHaveLength(1);
    m.clock.stillMotion(1_000);
    scene.onBeforeRender(null as never, scene, camera, null as never, null as never, null as never);
    expect(uniform(meshesIn(scene)[0], 'uOneColour')).toBe(1);
    m.clock.releaseMotion();
    hook.unmount();
  });
});

describe('the marks riding a raised shell (decision K5, TS1)', () => {
  // The screen's look as the settings resolve Classic's: 3.5 up.
  const RAISED = { fillElevationEpsilon: 3.5 };
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lifts every rider, the borders among them, while Classic stands raised, and draws the shell before them', async () => {
    const t = await mount(RAISED);
    t.render();
    const lift = t.lift.liftForHeight(t.styles.TERRITORY_STYLE_DEFAULTS.classic.height);
    expect(lift).toBeGreaterThan(1.03);
    expect(t.rider.scale.x).toBeCloseTo(lift, 9);
    let bordersLifted = false;
    t.scene.traverse((o) => { if (t.lines.lineBatchData(o) && o.parent?.scale.x === lift) bordersLifted = true; });
    expect(bordersLifted).toBe(true);
    expect(t.fillsGroup()!.renderOrder).toBe(t.lift.RAISED_SHELL_ORDER);
    t.hook.unmount();
  });

  it('puts every rider back for a card drawn Quiet, and lifts it again for the next live frame', async () => {
    const t = await mount(RAISED);
    t.render();
    t.clock.stillMotion(1_000);
    t.render();
    expect(t.rider.scale.x).toBe(1);
    expect(t.fillsGroup()!.renderOrder).toBe(95);
    t.clock.releaseMotion();
    t.render();
    expect(t.rider.scale.x).toBeGreaterThan(1.03);
    t.hook.unmount();
  });

  it('lifts nothing where the screen draws Quiet, or where the fills are off', async () => {
    const quiet = await mount({ style: 'quiet' });
    quiet.render();
    expect(quiet.rider.scale.x).toBe(1);
    quiet.hook.unmount();
    const m = await import('../theme/territoryStyles');
    const noFills = { ...m.TERRITORY_STYLE_DEFAULTS, classic: { ...m.TERRITORY_STYLE_DEFAULTS.classic, fillOpacity: 0 } };
    const off = await mount(RAISED, noFills);
    off.render();
    expect(off.rider.scale.x).toBe(1);
    off.hook.unmount();
  });

  it('notes the style each capture drew, so a card that missed its own is refused', async () => {
    const t = await mount(RAISED);
    t.render();
    t.clock.stillMotion(1_000);
    expect(t.look.territoriesMissedCardStyle()).toMatch(/not redrawn/);
    t.render();
    t.clock.releaseMotion();
    expect(t.look.territoriesMissedCardStyle()).toBeNull();
    t.hook.unmount();
  });

  it('puts the country names in the scene with the layer, riding the shell, and takes them away with it', async () => {
    const t = await mount(RAISED);
    const names = t.scene.getObjectByName('country-names');
    expect(names).toBeDefined();
    expect(t.lift.isShellRider(names!)).toBe(true);
    t.render();
    expect(names!.scale.x).toBeGreaterThan(1.03);
    t.hook.unmount();
    expect(t.scene.getObjectByName('country-names')).toBeUndefined();
  });

  it('leaves no rider raised when the layer goes', async () => {
    const t = await mount(RAISED);
    t.render();
    expect(t.rider.scale.x).toBeGreaterThan(1);
    t.hook.unmount();
    expect(t.rider.scale.x).toBe(1);
  });
});

/*
 * The level-of-detail watcher looks on its first frame, and the first build is still
 * loading then: it started a second build, for the level the camera's distance asks
 * for, and when that level's files came first its groups took the layer's place in the
 * scene. The first build's groups then took the refs and never reached the scene, so
 * the look went onto groups nobody saw and the scene kept what was built, in Classic,
 * under a card that asked for Quiet. A cold first load made it likely.
 */
describe('a level of detail chosen while the first build is still loading', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '?geoDeviceTier=B');
    // Frames a second apart in the page's clock, a few ms apart in the test's, and a cap.
    const pending = new Map<number, ReturnType<typeof setTimeout>>();
    let frames = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = ++frames;
      if (id <= 200) pending.set(id, setTimeout(() => { pending.delete(id); cb(1_000 * id); }, 5));
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { clearTimeout(pending.get(id)); pending.delete(id); });
  });
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds the camera\'s own level first, and only once (D-GV GV0.2)', async () => {
    const m = await load();
    const loads: string[] = [];
    const service = (await import('../services/NationalTerritoriesService')).nationalTerritoriesService;
    vi.spyOn(service, 'loadBordersLOD').mockImplementation(async (lod: number) => { loads.push(`borders ${lod}`); return borders as never; });
    vi.spyOn(service, 'loadTerritoriesLODResolved').mockImplementation(async (lod: number) => { loads.push(`fills ${lod} in`); return { kind: 'baked', parts } as never; });
    const camera = new THREE.PerspectiveCamera();
    // Far: level 0. Tier B's default would have been 1, and the watcher would have rebuilt at once.
    camera.position.set(0, 0, 500);
    const auto = { ...config, lod: { mode: 'auto', hysteresis: 25 } } as never;
    const hook = renderHook(() => m.hook.useNationalTerritories3D({ enabled: true, scene: new THREE.Scene(), camera, config: auto }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(loads).toEqual(['borders 0', 'fills 0 in']);
    hook.unmount();
  });

  it('waits for the first build, so the look reaches the only fills and borders drawn', async () => {
    const m = await load();
    // The first build's level (tier B's, 1) loads slowly; the far camera's (0) sooner, over a few frames.
    const slowFor = (lod: number) => new Promise((resolve) => setTimeout(resolve, lod === 1 ? 30 : 12));
    const loads: string[] = [];
    const service = (await import('../services/NationalTerritoriesService')).nationalTerritoriesService;
    vi.spyOn(service, 'loadBordersLOD').mockImplementation(async (lod: number) => {
      loads.push(`borders ${lod}`);
      await slowFor(lod);
      return borders as never;
    });
    vi.spyOn(service, 'loadTerritoriesLODResolved').mockImplementation(async (lod: number) => {
      await slowFor(lod);
      loads.push(`fills ${lod} in`);
      return { kind: 'baked', parts } as never;
    });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    // Near enough for level 1 when the first build starts (it takes the camera's own level), then far while it loads.
    camera.position.set(0, 0, 260);
    const auto = { ...config, lod: { mode: 'auto', hysteresis: 25 } } as never;
    const hook = renderHook(() => m.hook.useNationalTerritories3D({ enabled: true, scene, camera, config: auto }));
    camera.position.set(0, 0, 500);
    await new Promise((resolve) => setTimeout(resolve, 300));
    // The camera's new level is built once the first build is in, not before, and once.
    expect(loads).toEqual(['borders 1', 'fills 1 in', 'borders 0', 'fills 0 in']);
    const fillMeshes: THREE.Mesh[] = [];
    const borderGroups: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name === 'territories') fillMeshes.push(o);
      if (m.lines.lineBatchData(o)?.lines.some((l) => l.id === 'settled')) borderGroups.push(o);
    });
    expect(fillMeshes).toHaveLength(1);
    expect(borderGroups).toHaveLength(1);
    m.clock.stillMotion(1_000);
    scene.onBeforeRender(null as never, scene, camera, null as never, null as never, null as never);
    expect(uniform(fillMeshes[0], 'uOneColour')).toBe(1);
    expect(m.lines.lineBatchData(borderGroups[0])!.lines.find((l) => l.id === 'settled')!.color).toBe(m.theme.BORDER_CLASS_COLORS.international);
    m.clock.releaseMotion();
    hook.unmount();
  });
});
