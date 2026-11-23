/**
 * Globe markers as fixed-size points. What can be checked without a GPU: that every
 * marker becomes one point of its size and colour, in one draw call, sized in the
 * renderer's pixels, drawn after the cloud shell — and that moving one moves only it.
 *
 * Whether they READ on a card is measured against the running app by the layer audit
 * (scripts/audit-globe-layers.mjs, "on the card: … at least 4×4 px").
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
  buildScreenPoints, setScreenPointPosition, setScreenPointsOpacity, disposeScreenPoints, setScreenPointsStyle,
  drawAboveSurfaceLayers, SCREEN_POINTS_RENDER_ORDER,
  LIMB_MIN_SCALE, LIMB_SQUARE_ON, LIMB_FADE_IN, LIMB_FADE_OUT, GLOW_QUAD_SCALE,
} from '../screenPoints';

const markers = [
  { position: new THREE.Vector3(106, 0, 0), sizePx: 11, color: 0x00ff88 },
  { position: new THREE.Vector3(0, 110, 0), sizePx: 7, color: 0xcccccc },
  { position: new THREE.Vector3(0, 0, 417), sizePx: 8, color: 0x4488ff },
];
const material = (p: THREE.Points) => p.material as THREE.ShaderMaterial;

describe('buildScreenPoints', () => {
  const points = buildScreenPoints(markers);
  const attr = (name: string) => points.geometry.getAttribute(name) as THREE.BufferAttribute;

  it('draws every marker as one point, in one object', () => {
    expect(points).toBeInstanceOf(THREE.Points);
    expect(attr('position').count).toBe(3);
    expect([attr('position').getX(0), attr('position').getY(1), attr('position').getZ(2)]).toEqual([106, 110, 417]);
  });

  it('gives each point its own size and colour', () => {
    expect(Array.from(attr('pointSize').array)).toEqual([11, 7, 8]);
    const c = new THREE.Color(0x4488ff);
    // The attribute holds float32; compare at that precision.
    expect([attr('pointColor').getX(2), attr('pointColor').getY(2), attr('pointColor').getZ(2)])
      .toEqual(Array.from(new Float32Array([c.r, c.g, c.b])));
  });

  it('takes the renderer\'s pixel ratio at every draw, so a point is the same size on every screen', () => {
    const draw = (ratio: number) => points.onBeforeRender(
      { getPixelRatio: () => ratio } as unknown as THREE.WebGLRenderer,
      new THREE.Scene(), new THREE.PerspectiveCamera(), points.geometry, points.material as THREE.Material, null as never,
    );
    draw(2);
    expect(material(points).uniforms.pixelRatio.value).toBe(2);
    draw(1.5);
    expect(material(points).uniforms.pixelRatio.value).toBe(1.5);
  });

  // Block G, item 1: zoomed out, the Earth's marks no longer outgrow the Earth.
  it('fades its marks as the Earth shrinks on screen', () => {
    const renderer = { getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(1400, 900) } as unknown as THREE.WebGLRenderer;
    const cameraAt = (altitude: number) => {
      const camera = new THREE.PerspectiveCamera(50, 1400 / 900, 1, 125000);
      camera.position.set(0, 0, 100 * (1 + altitude));
      camera.updateMatrixWorld(true);
      return camera;
    };
    points.updateMatrixWorld(true);
    const draw = (altitude: number) => points.onBeforeRender(
      renderer, new THREE.Scene(), cameraAt(altitude), points.geometry, points.material as THREE.Material, null as never,
    );
    draw(40);
    expect(material(points).uniforms.zoomFade.value).toBe(0);
    draw(2.5);
    expect(material(points).uniforms.zoomFade.value).toBe(1);
    expect(material(points).fragmentShader).toMatch(/\* zoomFade;/);
  });

  it('is drawn at its render order, and never culled on a stale bounding sphere', () => {
    expect(points.renderOrder).toBe(SCREEN_POINTS_RENDER_ORDER);
    expect(points.frustumCulled).toBe(false);
  });

  it('puts a marker group after the surface layers — the group\'s order is the one three.js sorts by first', () => {
    const group = drawAboveSurfaceLayers(new THREE.Group());
    expect(group.renderOrder).toBe(SCREEN_POINTS_RENDER_ORDER);
  });

  it('is drawn after every surface layer the app sets an order for', () => {
    // The markers do not write depth, so anything drawn after them paints over them.
    // A layer's group order counts before its objects' own (drawAboveSurfaceLayers).
    // Every literal order in src/: `renderOrder = N` or, in an object, `renderOrder: N`
    // (often N + a small priority; batched lines carry theirs in a look object), and
    // the geopolitical layer registry's `order: N`. Two passes of the same scan over
    // different shapes, not a list typed out here that would go stale.
    const orders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(full); continue; }
        if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        const src = fs.readFileSync(full, 'utf8');
        for (const m of src.matchAll(/renderOrder\s*=\s*(\d+(?:\.\d+)?)/g)) orders.push(`${m[1]} ${full}`);
        for (const m of src.matchAll(/renderOrder:\s*(\d+(?:\.\d+)?)/g)) orders.push(`${m[1]} ${full}`);
        if (full.includes(`${path.sep}geopolitical${path.sep}`)) {
          for (const m of src.matchAll(/\border:\s*(\d+)/g)) orders.push(`${m[1]} ${full}`);
        }
      }
    };
    walk(path.resolve(__dirname, '../../..'));
    expect(orders.length).toBeGreaterThan(5); // the scan found the layers it exists to find
    // 20 of headroom for "base + priority".
    const tooHigh = orders.filter((o) => parseFloat(o) + 20 >= SCREEN_POINTS_RENDER_ORDER);
    expect(tooHigh).toEqual([]);
  });

  it('is hidden behind the globe, and does not hide what is drawn after it', () => {
    expect(material(points).depthTest).toBe(true);
    expect(material(points).depthWrite).toBe(false);
  });
});

describe('styles', () => {
  it('a disc is a solid fill with the rim asked for', () => {
    const dark = material(buildScreenPoints(markers, { rim: 'dark' }));
    const light = material(buildScreenPoints(markers, { rim: 'light' }));
    expect(dark.defines).toEqual({});
    expect(dark.blending).toBe(THREE.NormalBlending);
    const lum = (m: THREE.ShaderMaterial) => (m.uniforms.rimColor.value as THREE.Color).getHSL({ h: 0, s: 0, l: 0 }).l;
    expect(lum(light)).toBeGreaterThan(0.9);
    expect(lum(dark)).toBeLessThan(0.1);
  });

  it('a bloom adds light, so overlapping blooms brighten where markers crowd', () => {
    const bloom = material(buildScreenPoints(markers, { style: 'bloom', opacity: 0.4 }));
    expect(bloom.defines).toHaveProperty('STYLE_BLOOM');
    expect(bloom.blending).toBe(THREE.AdditiveBlending);
    expect(bloom.uniforms.opacity.value).toBe(0.4);
  });

  it('a ring is its own style', () => {
    expect(material(buildScreenPoints(markers, { style: 'ring' })).defines).toHaveProperty('STYLE_RING');
  });

  // Diplomacy's mark for a place GDELT put only at a country, under the Ring style (D-DP, DP13).
  it('a dashed ring is its own style, a ring broken into dashes', () => {
    const dashed = material(buildScreenPoints(markers, { style: 'dashedRing' }));
    expect(dashed.defines).toHaveProperty('STYLE_DASHED_RING');
    expect(dashed.defines).not.toHaveProperty('STYLE_RING');
    expect(dashed.fragmentShader).toMatch(/STYLE_DASHED_RING[\s\S]*sin\(atan\(p\.y, p\.x\) \* 8\.0\)/);
    expect(dashed.premultipliedAlpha).toBe(false);
  });
});

/*
 * A mark that glows, in ONE object (decision D-F, step 6.3).
 *
 * `glow` used to be what `bloom` is now — pure additive light — and drawn as a
 * mark at the intel anchors' ~8px it measured as very nearly invisible: adding
 * light to an already-bright green and yellow globe barely changes it. The first
 * fix drew two objects, a bloom with a disc over it, inside useScreenMarkLayer.
 * That worked, but ten layers call buildScreenPoints directly and got one object,
 * so the switcher had to withhold glow from them layer by layer.
 *
 * These tests pin the three things that make one object enough, because each of
 * them is a way the mark could go back to being invisible.
 */
describe('a mark that glows', () => {
  const glow = () => material(buildScreenPoints(markers, { style: 'glow' }));

  it('blends normally, because additive light with no core is what vanished', () => {
    expect(glow().defines).toHaveProperty('STYLE_GLOW');
    expect(glow().blending).toBe(THREE.NormalBlending);
  });

  it('draws a core as well as a halo, so there is a mark to locate', () => {
    // A halo alone is the defect this style replaced. The alpha is the DISC's
    // coverage — the halo is added separately, as light.
    expect(glow().fragmentShader).toContain('vec4(lit, opacity * discMask)');
  });

  it('adds the halo as light, so it can never darken the ground it sits on', () => {
    /*
     * The premultiplied blend is src + dst*(1 - src.a), so a fragment written
     * with alpha 0 leaves the destination alone and only adds. The test below
     * works out why that matters; measured on the running build, a glow brightens
     * 897 px and darkens 13 against the disc it replaces.
     */
    expect(glow().premultipliedAlpha).toBe(true);
    expect(glow().fragmentShader).toContain('gl_FragColor.rgb * gl_FragColor.a + light');
  });

  /*
   * Why the halo cannot composite, worked out rather than photographed.
   *
   * This is arithmetic the GPU does, so it can be done here exactly, and it is
   * the claim a screenshot kept failing to settle: under SwiftShader a base
   * texture times out on most loads, and a frame missing one differs from a frame
   * that has it across a twentieth of the image — far more than any mark. Two
   * before/after readings taken that way disagreed with each other.
   */
  describe('the blend the halo needs', () => {
    // One channel is enough: both equations are per-channel and linear.
    const composite = (ground: number, mark: number, alpha: number) => mark * alpha + ground * (1 - alpha);
    const premultipliedAdd = (ground: number, mark: number, strength: number) =>
      mark * strength + ground * (1 - 0); // src.a is 0 in the halo, so dst is kept whole

    it('darkens the ground when the mark is darker than it, which a glow must not', () => {
      const ground = 0.8; // bright ocean under the terminator's day side
      const mark = 0.2;   // and a palette entry darker than it, as every palette has

      expect(composite(ground, mark, 0.5)).toBeLessThan(ground);
      expect(premultipliedAdd(ground, mark, 0.5)).toBeGreaterThanOrEqual(ground);
    });

    it('still brightens where the mark is brighter, so nothing is given up', () => {
      const ground = 0.2;
      const mark = 0.9;

      expect(composite(ground, mark, 0.5)).toBeGreaterThan(ground);
      expect(premultipliedAdd(ground, mark, 0.5)).toBeGreaterThan(ground);
    });
  });

  it('leaves every other style compositing straight alpha', () => {
    // The premultiplied blend applied to a shader that writes ordinary alpha
    // washes it out — so this is not a flag to set generally.
    for (const style of ['disc', 'ring', 'bloom', 'dashedRing'] as const) {
      expect(material(buildScreenPoints(markers, { style })).premultipliedAlpha).toBe(false);
    }
  });

  it('enlarges the quad to make room for the light around the mark', () => {
    // Nothing can be drawn outside a point sprite's own quad, so without this
    // the halo has nowhere to go and only softens the disc's edge.
    expect(glow().vertexShader).toContain(`quad = ${GLOW_QUAD_SCALE}`);
  });

  it('scales the distance back by the same figure, so the mark is disc-sized', () => {
    /*
     * The invariant that keeps disc and glow interchangeable. The vertex shader
     * grows the quad by GLOW_QUAD_SCALE and the fragment shader divides the
     * distance by it, so the disc inside a glow is the SIZE of the one STYLE_DISC
     * draws — its rim is a smoothstep rather than a hard cut, which at a mark's
     * scale is a fraction of a pixel. Change one figure and not the other and
     * every mark on the layer silently resizes when someone picks glow.
     */
    expect(glow().fragmentShader).toContain(`float r = d * ${GLOW_QUAD_SCALE}`);
    expect(glow().vertexShader).toContain(`quad = ${GLOW_QUAD_SCALE}`);
  });

  it('leaves every other style at its own size', () => {
    for (const style of ['disc', 'ring', 'bloom'] as const) {
      expect(material(buildScreenPoints(markers, { style })).vertexShader)
        .toContain('float quad = 1.0');
    }
  });
});

describe('changing a set in place', () => {
  it('moves one point and leaves the rest', () => {
    const points = buildScreenPoints(markers);
    setScreenPointPosition(points, 1, new THREE.Vector3(1, 2, 3));
    const p = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect([p.getX(1), p.getY(1), p.getZ(1)]).toEqual([1, 2, 3]);
    expect(p.getX(0)).toBe(106);
  });

  it('sets the whole set\'s opacity', () => {
    const points = buildScreenPoints(markers);
    setScreenPointsOpacity(points, 0.25);
    expect(material(points).uniforms.opacity.value).toBe(0.25);
  });

  it('releases both GPU buffers', () => {
    const points = buildScreenPoints(markers);
    let released = 0;
    points.geometry.addEventListener('dispose', () => { released++; });
    (points.material as THREE.Material).addEventListener('dispose', () => { released++; });
    disposeScreenPoints(points);
    expect(released).toBe(2);
  });
});

/*
 * Marks near the globe's limb (decision D-F, clutter and legibility).
 *
 * ─── WHAT WAS WRONG ────────────────────────────────────────────────────────
 *
 * A screen point is drawn at a fixed pixel size wherever it is, so a mark sat
 * at the limb — where the surface it describes is nearly edge-on — was drawn at
 * exactly the size it has dead centre. The layer audit's first reading of this
 * was that marks rendered OUTSIDE the globe; zoomed in they sit ON the limb,
 * full size, against the dark terminator, which reads as a halo at
 * contact-sheet scale. RLSH mode showed it best: 44 marks stacked down the left
 * edge, none of them foreshortened.
 *
 * ─── WHAT CAN BE TESTED HERE, AND WHAT CANNOT ──────────────────────────────
 *
 * The curve lives in GLSL and jsdom runs no shaders, so what is checked is the
 * contract around it: the switch exists, it defaults on, a layer can turn it
 * off, and the numbers the shader uses are the exported ones rather than a
 * second copy free to drift. The curve itself is judged by looking at the globe,
 * which is the only place a falloff can be judged anyway.
 */
describe('a mark near the limb', () => {
  const material = (points: THREE.Points) => points.material as THREE.ShaderMaterial;

  it('falls off by default, without any layer asking', () => {
    expect(material(buildScreenPoints(markers)).uniforms.limbFalloff.value).toBe(1);
  });

  /*
   * An escape hatch rather than a decision: a layer whose marks are not on the
   * surface has grounds to opt out, and finding that out should not require
   * editing the shared shader.
   */
  it('can be turned off by a layer that should not have it', () => {
    expect(material(buildScreenPoints(markers, { limbFalloff: false })).uniforms.limbFalloff.value).toBe(0);
  });

  /*
   * The shader reads the exported numbers, so there is one source of truth for
   * them. Without this they could be exported, documented, and quietly not used.
   */
  it('uses the numbers it publishes', () => {
    const source = material(buildScreenPoints(markers)).vertexShader
      + material(buildScreenPoints(markers)).fragmentShader;

    expect(source).toContain(LIMB_MIN_SCALE.toFixed(2));
    expect(source).toContain(LIMB_SQUARE_ON.toFixed(2));
    expect(source).toContain(LIMB_FADE_IN.toFixed(2));
  });

  /*
   * The curve has to be monotonic to mean anything: fully faded before the
   * horizon, fully opaque once the surface is reasonably square on, and never
   * shrinking a mark to nothing.
   */
  it('publishes a curve that runs the right way', () => {
    expect(LIMB_FADE_OUT).toBeLessThan(LIMB_FADE_IN);
    expect(LIMB_FADE_IN).toBeLessThanOrEqual(LIMB_SQUARE_ON);
    expect(LIMB_MIN_SCALE).toBeGreaterThan(0);
    expect(LIMB_MIN_SCALE).toBeLessThan(1);
  });

  /*
   * Nothing about the falloff may depend on a layer passing a normal: every
   * screen point sits on a radius of a sphere centred on its group's origin, so
   * the shader derives it. Ten layers call this and none of them was changed.
   */
  it('needs no new attribute from the ten layers that call it', () => {
    const geometry = buildScreenPoints(markers).geometry;

    expect(Object.keys(geometry.attributes).sort()).toEqual(['pointColor', 'pointSize', 'position']);
  });
});

/**
 * Redrawing marks in another style without rebuilding them (decision D-F, 6.3).
 *
 * A style lives in the material — shader defines, blending, premultiplied alpha
 * — and nowhere in the geometry. So a restyle should touch the material alone.
 * The alternative every layer used was to rebuild, and a rebuild is where
 * Satellites went wrong: its rebuild lived in the effect that loads the
 * catalogue, so choosing a style reloaded the data.
 */
describe('setScreenPointsStyle', () => {
  const STYLES = ['disc', 'glow', 'ring', 'bloom', 'dashedRing'] as const;
  const propsOf = (p: THREE.Points) => {
    const m = material(p);
    return { defines: { ...m.defines }, blending: m.blending, premultipliedAlpha: m.premultipliedAlpha };
  };

  /*
   * The invariant. Building and restyling set the same three properties from
   * one place; if they ever disagree, a restyled layer draws differently from
   * the same layer built in that style — and nothing else would show it.
   */
  it('leaves a restyled set exactly as if it had been built in that style', () => {
    for (const style of STYLES) {
      const restyled = buildScreenPoints(markers, { style: 'disc' });
      setScreenPointsStyle(restyled, style);

      expect(propsOf(restyled)).toEqual(propsOf(buildScreenPoints(markers, { style })));
    }
  });

  it('can go from any style to any other, including back', () => {
    for (const from of STYLES) {
      for (const to of STYLES) {
        const p = buildScreenPoints(markers, { style: from });
        setScreenPointsStyle(p, to);
        expect(propsOf(p)).toEqual(propsOf(buildScreenPoints(markers, { style: to })));
      }
    }
  });

  /*
   * The point of doing it in place: the marks stay where they are, in the
   * colours and sizes they were drawn with. Same attribute objects, not copies.
   */
  it('keeps the geometry — positions, colours, sizes — untouched', () => {
    const p = buildScreenPoints(markers, { style: 'disc' });
    const before = ['position', 'pointColor', 'pointSize'].map((a) => p.geometry.getAttribute(a));

    setScreenPointsStyle(p, 'ring');

    expect(['position', 'pointColor', 'pointSize'].map((a) => p.geometry.getAttribute(a))).toEqual(before);
    before.forEach((attr, i) => expect(p.geometry.getAttribute(['position', 'pointColor', 'pointSize'][i])).toBe(attr));
  });

  it('keeps the material, and its opacity and rim, so a fade in progress survives', () => {
    const p = buildScreenPoints(markers, { style: 'disc', rim: 'light', opacity: 0.4 });
    const m = material(p);
    const rim = m.uniforms.rimColor.value.clone();

    setScreenPointsStyle(p, 'glow');

    expect(p.material).toBe(m);
    expect(m.uniforms.opacity.value).toBe(0.4);
    expect(m.uniforms.rimColor.value.equals(rim)).toBe(true);
  });

  /*
   * Changing defines does nothing until three.js recompiles the program, and it
   * only does that when told. Without this the call "works" and draws nothing new.
   */
  it('tells three.js to recompile the shader', () => {
    const p = buildScreenPoints(markers, { style: 'disc' });
    const version = material(p).version;

    setScreenPointsStyle(p, 'ring');

    expect(material(p).version).toBeGreaterThan(version);
  });
});

/*
 * The value a mark's size encodes, kept beside its tooltip so describeView can
 * rank by it (decision D-F, section 18, item 6).
 */
describe('magnitudes', () => {
  it('collects each mark\'s magnitude in point order, and none when no mark has one', () => {
    const at = new THREE.Vector3(0, 0, 100);
    const withValues = buildScreenPoints([
      { position: at, sizePx: 10, color: 0xffffff, magnitude: 626 },
      { position: at, sizePx: 10, color: 0xffffff },
    ]);
    expect(withValues.userData.magnitudes).toEqual([626, null]);
    expect(buildScreenPoints([{ position: at, sizePx: 10, color: 0xffffff }]).userData.magnitudes).toBeUndefined();
  });
});

/*
 * What a click on each mark opens (critique C5, decision D-CT, CT3), kept beside its tooltip in point order, as
 * intelReportSprites keeps it, so useGlobePointTooltips opens what the hover named.
 */
describe('opens', () => {
  it('collects each mark\'s notes in point order, and none when no mark has any', () => {
    const at = new THREE.Vector3(0, 0, 100);
    const set = { heading: 'Earthquake', notes: [{ id: 'q', kind: 'Reported by USGS', title: 'M 4.2', text: '', timeMs: null, sources: [] }] };
    const withNotes = buildScreenPoints([
      { position: at, sizePx: 10, color: 0xffffff, tooltip: 'M4.2', opens: set },
      { position: at, sizePx: 10, color: 0xffffff, tooltip: 'M3.0' },
    ]);
    expect(withNotes.userData.opens).toEqual([set, null]);
    expect(withNotes.userData.tooltips).toEqual(['M4.2', 'M3.0']);
    expect(buildScreenPoints([{ position: at, sizePx: 10, color: 0xffffff }]).userData.opens).toBeUndefined();
  });
});

describe('marks that move between two snapshots on the GPU (D-GV GV2)', () => {
  it('blends only when asked, and keeps the blend through a restyle', async () => {
    const { buildScreenPoints, setScreenPointsStyle, setScreenPointsSnapshots, setScreenPointsBlend } = await import('../screenPoints');
    const still = buildScreenPoints([{ position: new THREE.Vector3(100, 0, 0), sizePx: 8, color: 0xffffff }]);
    expect(still.geometry.getAttribute('positionNext')).toBeUndefined();
    expect((still.material as THREE.ShaderMaterial).uniforms.blend).toBeUndefined();

    const moving = buildScreenPoints([{ position: new THREE.Vector3(100, 0, 0), sizePx: 8, color: 0xffffff }], { blend: true, style: 'ring' });
    const material = moving.material as THREE.ShaderMaterial;
    expect(material.defines).toMatchObject({ BLEND_POSITIONS: '', STYLE_RING: '' });
    setScreenPointsStyle(moving, 'glow');
    expect(material.defines).toMatchObject({ BLEND_POSITIONS: '', STYLE_GLOW: '' });
    expect(material.defines).not.toHaveProperty('STYLE_RING');

    setScreenPointsBlend(moving, 0.4);
    setScreenPointsSnapshots(moving, [1, 2, 3], [4, 5, 6]);
    expect(Array.from(moving.geometry.getAttribute('position').array)).toEqual([1, 2, 3]);
    expect(Array.from(moving.geometry.getAttribute('positionNext').array)).toEqual([4, 5, 6]);
    // New snapshots start the blend again from the first.
    expect(material.uniforms.blend.value).toBe(0);
    setScreenPointsBlend(moving, 1.7);
    expect(material.uniforms.blend.value).toBe(1);
    setScreenPointsBlend(moving, -1);
    expect(material.uniforms.blend.value).toBe(0);
  });
});

// Critique-2026-11-01, OR30: a layer's marks may be icons close in, dots far out; only a layer that asks draws them.
describe('icons close in', () => {
  const atlas = new THREE.Texture();
  const icons = { atlas, cellCount: 4, rowCount: 2, row: 0, sizePx: 18, nearAltitude: 1 };
  const at = (z: number) => new THREE.Vector3(0, 0, z);

  it('gives only the marks with a cell an icon, and only to a layer that asks', () => {
    const plain = buildScreenPoints([{ position: at(101), sizePx: 5, color: 0xffffff, iconCell: 2 }]);
    expect(plain.geometry.getAttribute('iconCell')).toBeUndefined();
    expect((plain.material as THREE.ShaderMaterial).defines).not.toHaveProperty('USE_ICONS');
    const iconic = buildScreenPoints([
      { position: at(101), sizePx: 5, color: 0xffffff, iconCell: 2 },
      { position: at(102), sizePx: 5, color: 0xffffff },
    ], { icons });
    expect(Array.from(iconic.geometry.getAttribute('iconCell').array)).toEqual([2, -1]);
    expect((iconic.material as THREE.ShaderMaterial).defines).toHaveProperty('USE_ICONS');
  });

  it('switches to icons below the height asked, and keeps them through a restyle and the blend', () => {
    const marks = buildScreenPoints([{ position: at(101), sizePx: 5, color: 0xffffff, iconCell: 0 }], { icons, blend: true });
    const material = marks.material as THREE.ShaderMaterial;
    const camera = new THREE.PerspectiveCamera();
    const renderer = { getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(800, 600) } as unknown as THREE.WebGLRenderer;
    camera.position.set(0, 0, 400);
    marks.onBeforeRender(renderer, new THREE.Scene(), camera, marks.geometry, material, null as never);
    expect(material.uniforms.iconNear.value).toBe(0);
    camera.position.set(0, 0, 150);
    marks.onBeforeRender(renderer, new THREE.Scene(), camera, marks.geometry, material, null as never);
    expect(material.uniforms.iconNear.value).toBe(1);
    setScreenPointsStyle(marks, 'glow');
    expect(material.defines).toHaveProperty('USE_ICONS');
    expect(material.defines).toHaveProperty('BLEND_POSITIONS');
  });
});
