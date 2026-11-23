/**
 * Intel Report marks as billboarded sprites (decision D-F, step 6, part 4).
 *
 * ─── WHAT CAN AND CANNOT BE TESTED HERE ────────────────────────────────────
 *
 * jsdom has no 2D canvas — the `canvas` package is not installed — so nothing
 * here rasterises. What IS checked is everything that decides what gets
 * rasterised: the artwork each variant carries, the atlas layout the shader
 * indexes into, the per-point attributes, the clock that drives motion, and the
 * refusal to draw at all without a baked atlas. The glyphs themselves are
 * verified by looking at the running app, which is the only place a glyph can
 * be judged anyway.
 *
 * ─── WHY SPRITES REPLACE A MODEL ───────────────────────────────────────────
 *
 * Not because 182 triangles are heavy. The GLB's cost is per mark — a mesh, a
 * raycast target and a draw call each, which useGlobeRLSH already records
 * beside thirteen models stacked in Seattle where one is visible. One batched
 * THREE.Points is one draw call for every mark on the globe.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  intelVariantSvg, atlasCellOf, bakeIntelSpriteAtlas, buildIntelSprites,
  intelSpriteIndexAt, setIntelSpriteHovered, intelReportAtHits,
  INTEL_SPRITE_TYPE, SPRITE_GLYPHS, type IntelSpriteMark,
  styledGlyphSvg, atlasRowOf, SPRITE_BACKINGS,
  BADGE_LABELS, badgeCellOf, bakeBadgeAtlas, buildPlaceBadges, INTEL_BADGE_TYPE, BADGE_OFFSET_PX,
  MOTION_AT_REST,
  EMBLEM_SYMBOLS, emblemCellOf, emblemMaskSvg, emblemPageCellOf, styledPageSvg, buildGlyphSprites,
  spriteGlyphFill, reportGlyphSvg, spriteGlyphMotion,
} from '../intelReportSprites';
import { INTEL_CATEGORIES, INTEL_CATEGORY_SYMBOLS, GENERIC_CATEGORY_SYMBOL } from '../../../symbols/symbolRegistry';
import { ROLES } from '../../../styles/tokens';
import { stillMotion, releaseMotion } from '../../../globe-engine/captureClock';
import { MARKER_STYLES } from '../markerStyles';
import { INTEL_VARIANTS } from '../intelVariant';

const marks: IntelSpriteMark[] = [
  { position: new THREE.Vector3(0, 0, 100), sizePx: 22, variant: 'raw', tooltip: 'A raw report' },
  { position: new THREE.Vector3(0, 100, 0), sizePx: 26, variant: 'critical', tooltip: 'A critical report' },
  { position: new THREE.Vector3(100, 0, 0), sizePx: 22, variant: 'actionable' },
];

const atlas = () => new THREE.Texture();

describe('the artwork', () => {
  it('draws something for every glyph', () => {
    for (const variant of SPRITE_GLYPHS) {
      const svg = intelVariantSvg(variant);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('</svg>');
    }
  });

  /*
   * Shape has to separate them, not only colour: the globe runs from bright
   * green land to dark ocean to a night terminator, and a reader who cannot
   * rely on a hue still has to tell a critical report from a raw one.
   */
  it('gives each glyph different artwork', () => {
    const drawn = SPRITE_GLYPHS.map(intelVariantSvg);

    expect(new Set(drawn).size).toBe(SPRITE_GLYPHS.length);
  });

  /*
   * RLSH is a person, not one of the four documents. It shares this layer
   * because RLSH entities have no other mark, so the shape is the only thing
   * separating "someone filed a report here" from "a person is here".
   */
  it('draws RLSH as something other than a document', () => {
    const person = intelVariantSvg('rlsh');

    expect(person).toContain('<circle');
    for (const variant of INTEL_VARIANTS) {
      expect(person).not.toBe(intelVariantSvg(variant));
    }
  });

  /*
   * These are baked through an Image, and the app runs under an enforced CSP.
   * A glyph that reached for an external resource would fail there and nowhere
   * else.
   */
  it('reaches for nothing outside itself', () => {
    for (const variant of SPRITE_GLYPHS) {
      const svg = intelVariantSvg(variant);
      expect(svg).not.toMatch(/<image\b/i);
      expect(svg).not.toMatch(/href\s*=/i);
      expect(svg).not.toMatch(/url\(/i);
      expect(svg).not.toMatch(/<script/i);
    }
  });
});

describe('the atlas', () => {
  it('gives every glyph its own cell, in the vocabulary order', () => {
    const cells = SPRITE_GLYPHS.map(atlasCellOf);

    expect(cells).toEqual(SPRITE_GLYPHS.map((_, i) => i));
    expect(new Set(cells).size).toBe(SPRITE_GLYPHS.length);
  });

  /*
   * The report variants keep the cells they had, so RLSH is an addition rather
   * than a renumbering.
   */
  it('leaves the report variants where they were', () => {
    expect(INTEL_VARIANTS.map(atlasCellOf)).toEqual(INTEL_VARIANTS.map((_, i) => i));
    expect(atlasCellOf('rlsh')).toBe(INTEL_VARIANTS.length);
  });

  /*
   * jsdom returns null from getContext('2d'). The globe must still draw its
   * reports — as it did before sprites existed — rather than throwing on a
   * machine or a test runner that cannot rasterise.
   */
  it('refuses to invent a texture when it cannot rasterise', async () => {
    await expect(bakeIntelSpriteAtlas()).resolves.toBeNull();
  });
});

/*
 * A glyph takes its layer's chosen style (decision D-F, section 18, item 1.1).
 *
 * Mecha Jono called setMarkerStyle('IntelReports', 'disc') and the image did
 * not change: the style reached the purple pins under the glyphs and never the
 * glyphs. Each style is now a row of the atlas, drawn BEHIND the glyph, so the
 * choice changes what a reader sees and the glyph's shape still says which
 * variant it is.
 */
describe('a glyph in each style', () => {
  it('has a row for every style the switcher offers, and no other', () => {
    expect([...SPRITE_BACKINGS].sort()).toEqual([...MARKER_STYLES].sort());
    expect(SPRITE_BACKINGS.map(atlasRowOf)).toEqual(SPRITE_BACKINGS.map((_, i) => i));
  });

  it('keeps the glyph and puts something different behind it in each style', () => {
    for (const glyph of SPRITE_GLYPHS) {
      const drawn = SPRITE_BACKINGS.map((style) => styledGlyphSvg(glyph, style));
      expect(new Set(drawn).size).toBe(SPRITE_BACKINGS.length);
      for (const svg of drawn) {
        expect(svg).not.toBe(intelVariantSvg(glyph));
        // The same page artwork, scaled inside its backing.
        expect(svg).toContain('scale(0.75)');
      }
    }
  });

  it('draws what each style is named for behind the glyph', () => {
    // A dark disc edged in the glyph's colour.
    expect(styledGlyphSvg('critical', 'disc')).toMatch(/<circle[^>]*r="29"[^>]*fill="#08121a"[^>]*stroke="#ff4d4f"/);
    // A bloom: a gradient in the glyph's colour, fading to nothing.
    expect(styledGlyphSvg('critical', 'glow')).toMatch(/<radialGradient[\s\S]*stop-color="#ff4d4f"[\s\S]*stop-opacity="0"/);
    // A ring: an unfilled circle in the glyph's colour over a dark one.
    const ring = styledGlyphSvg('critical', 'ring');
    expect(ring).toMatch(/<circle[^>]*fill="none"[^>]*stroke="#08121a"/);
    expect(ring).toMatch(/<circle[^>]*fill="none"[^>]*stroke="#ff4d4f"/);
    // Each backing is drawn first, so the glyph sits on it.
    for (const style of SPRITE_BACKINGS) {
      const svg = styledGlyphSvg('critical', style);
      // Every backing circle before the glyph (critical's page has none of its own).
      expect(svg.lastIndexOf('<circle')).toBeLessThan(svg.indexOf('<g transform'));
    }
  });

  it('colours each backing with its own glyph, so the edge says the variant too', () => {
    expect(styledGlyphSvg('critical', 'disc')).toContain('#ff4d4f');
    expect(styledGlyphSvg('standard', 'ring')).toContain('#4fd1ff');
    expect(styledGlyphSvg('critical', 'disc')).not.toContain('#4fd1ff');
  });

  it('reaches for nothing outside itself; a glow may name its own gradient', () => {
    for (const glyph of SPRITE_GLYPHS) {
      for (const style of SPRITE_BACKINGS) {
        const svg = styledGlyphSvg(glyph, style);
        expect(svg).not.toMatch(/<image\b/i);
        expect(svg).not.toMatch(/href\s*=/i);
        expect(svg).not.toMatch(/<script/i);
        // url() only to a fragment inside this same image.
        expect(svg.replace(/url\(#[\w-]+\)/g, '')).not.toMatch(/url\(/i);
      }
    }
  });

  it('tells the shader which row each mark uses, disc when none is given', () => {
    const styled: IntelSpriteMark[] = [
      { ...marks[0], style: 'ring' },
      { ...marks[1], style: 'glow' },
      { ...marks[2] },
    ];
    const row = buildIntelSprites(styled, atlas())!.geometry.getAttribute('atlasRow');

    expect(row.getX(0)).toBe(atlasRowOf('ring'));
    expect(row.getX(1)).toBe(atlasRowOf('glow'));
    expect(row.getX(2)).toBe(atlasRowOf('disc'));
  });

  it('tells the shader how many rows the atlas has', () => {
    const material = buildIntelSprites(marks, atlas())!.material as THREE.ShaderMaterial;
    expect(material.uniforms.rowCount.value).toBe(SPRITE_BACKINGS.length);
    expect(material.fragmentShader).toMatch(/vAtlasRow/);
  });
});

/*
 * How many reports share a place, drawn beside its one glyph (decision D-F,
 * section 18, item 1.2). The pin under the glyph used to say it with its size;
 * the pin is gone, so the glyph says it with a number.
 */
describe('the count badge', () => {
  it('draws nothing for a place holding one report', () => {
    expect(badgeCellOf(1)).toBeNull();
    expect(badgeCellOf(0)).toBeNull();
    expect(badgeCellOf(Number.NaN)).toBeNull();
  });

  it('names the count up to nine, and more than nine as 9+', () => {
    expect(BADGE_LABELS[badgeCellOf(2)!]).toBe('2');
    expect(BADGE_LABELS[badgeCellOf(9)!]).toBe('9');
    expect(BADGE_LABELS[badgeCellOf(10)!]).toBe('9+');
    expect(BADGE_LABELS[badgeCellOf(140)!]).toBe('9+');
  });

  it('refuses to invent a texture when it cannot rasterise', async () => {
    await expect(bakeBadgeAtlas()).resolves.toBeNull();
  });

  it('draws one badge per crowded place, in one object, with its count cell', () => {
    const badges = buildPlaceBadges([
      { position: new THREE.Vector3(0, 0, 100), count: 3 },
      { position: new THREE.Vector3(0, 100, 0), count: 1 },
      { position: new THREE.Vector3(100, 0, 0), count: 12, opacity: 0.45 },
    ], atlas())!;

    expect(badges.userData.type).toBe(INTEL_BADGE_TYPE);
    const cell = badges.geometry.getAttribute('badgeCell');
    expect(cell.count).toBe(2);
    expect(BADGE_LABELS[cell.getX(0)]).toBe('3');
    expect(BADGE_LABELS[cell.getX(1)]).toBe('9+');
    expect(badges.geometry.getAttribute('markOpacity').getX(1)).toBeCloseTo(0.45, 5);
  });

  /*
   * Beside the glyph, not on it: a point sprite cannot draw outside its own
   * quad, so the badge is its own point, moved on screen by a fixed number of
   * pixels. Moved in clip space, never on the globe, so it stays beside the
   * glyph at any zoom.
   */
  it('sits up and to the right of the glyph, by pixels', () => {
    const badges = buildPlaceBadges([{ position: new THREE.Vector3(0, 0, 100), count: 2 }], atlas())!;
    const material = badges.material as THREE.ShaderMaterial;
    expect(material.uniforms.offsetPx.value.toArray()).toEqual([BADGE_OFFSET_PX, BADGE_OFFSET_PX]);
    expect(material.vertexShader).toMatch(/offsetPx/);

    const renderer = {
      getPixelRatio: () => 2,
      getSize: (target: THREE.Vector2) => target.set(1280, 720),
    } as unknown as THREE.WebGLRenderer;
    badges.onBeforeRender(renderer, null as never, null as never, null as never, material, null as never);
    expect(material.uniforms.viewport.value.toArray()).toEqual([1280, 720]);
  });

  it('draws nothing when no place is crowded, or without an atlas', () => {
    expect(buildPlaceBadges([{ position: new THREE.Vector3(), count: 1 }], atlas())).toBeNull();
    expect(buildPlaceBadges([{ position: new THREE.Vector3(), count: 4 }], null)).toBeNull();
  });
});

describe('the sprite layer', () => {
  it('draws every mark in one object', () => {
    const points = buildIntelSprites(marks, atlas())!;

    expect(points).toBeInstanceOf(THREE.Points);
    expect(points.geometry.getAttribute('position').count).toBe(3);
  });

  it('tells the shader which cell each mark uses', () => {
    const cell = buildIntelSprites(marks, atlas())!.geometry.getAttribute('atlasCell');

    expect(cell.getX(0)).toBe(atlasCellOf('raw'));
    expect(cell.getX(1)).toBe(atlasCellOf('critical'));
    expect(cell.getX(2)).toBe(atlasCellOf('actionable'));
  });

  it('carries the on-screen size each mark asked for', () => {
    const size = buildIntelSprites(marks, atlas())!.geometry.getAttribute('pointSize');

    expect(size.getX(0)).toBe(22);
    expect(size.getX(1)).toBe(26);
  });

  /*
   * Motion is the third channel the variants differ in, and it is per variant
   * rather than global: a globe where every mark pulses is a globe where the
   * pulse says nothing.
   */
  it('moves only the variants that are meant to move', () => {
    const motion = buildIntelSprites(marks, atlas())!.geometry.getAttribute('motion');

    expect(motion.getX(1)).toBeGreaterThan(0);  // critical pulses
    expect(motion.getX(0)).toBe(0);             // raw is still
  });

  /*
   * The clock. three.js calls onBeforeRender before drawing the object, which
   * is where screenPoints already reads the pixel ratio — so motion costs no
   * animation loop, no React state and nothing at all while the layer is off
   * screen.
   */
  it('advances its clock as it is drawn, without an animation loop', () => {
    const points = buildIntelSprites(marks, atlas())!;
    const material = points.material as THREE.ShaderMaterial;
    const renderer = { getPixelRatio: () => 2 } as unknown as THREE.WebGLRenderer;

    expect(material.uniforms.time.value).toBe(0);
    points.onBeforeRender(renderer, null as never, null as never, null as never, material, null as never);

    expect(material.uniforms.time.value).toBeGreaterThan(0);
    expect(material.uniforms.pixelRatio.value).toBe(2);
  });

  // IM23: a capture stills motion, so the same shot makes the same picture.
  it('holds its glows at rest while a capture stills motion, and moves again after', () => {
    const points = buildIntelSprites(marks, atlas())!;
    const material = points.material as THREE.ShaderMaterial;
    const renderer = { getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer;
    stillMotion(1_790_967_291_000);
    points.onBeforeRender(renderer, null as never, null as never, null as never, material, null as never);
    expect(material.uniforms.time.value).toBe(MOTION_AT_REST);
    releaseMotion();
    points.onBeforeRender(renderer, null as never, null as never, null as never, material, null as never);
    expect(material.uniforms.time.value).not.toBe(MOTION_AT_REST);
  });

  it('can be found by a probe, a test, or the picking code', () => {
    expect(buildIntelSprites(marks, atlas())!.userData.type).toBe(INTEL_SPRITE_TYPE);
  });

  /*
   * Hoverable through the same registry every screen-point layer uses: the
   * tooltips are an array indexed by point.
   */
  it('answers a hover with the report under the pointer', () => {
    const points = buildIntelSprites(marks, atlas())!;

    expect((points.userData as { tooltips: string[] }).tooltips[1]).toBe('A critical report');
  });

  /*
   * Marks move — the globe rotates and the temporal cursor rebuilds them — and
   * a bounding sphere computed once would cull marks that are on screen. Same
   * reason screenPoints sets this.
   */
  it('is not frustum culled', () => {
    expect(buildIntelSprites(marks, atlas())!.frustumCulled).toBe(false);
  });

  it('draws plain shapes without an atlas, in the glyphs\' colours, wearing no emblem', () => {
    // Marks that would wear an emblem, with the emblems' masks at hand: still none is worn.
    const withEmblems = marks.map((mark) => ({ ...mark, emblem: INTEL_CATEGORY_SYMBOLS.conflict }));
    const points = buildIntelSprites(withEmblems, null, { emblems: atlas() })!;
    const material = points.material as THREE.ShaderMaterial;
    expect(material.defines).toHaveProperty('DRAW_SHAPES');
    expect(material.fragmentShader).toContain('plainShape');
    const fills = material.uniforms.shapeFills.value as THREE.Color[];
    expect(fills.map((c) => `#${c.getHexString()}`)).toEqual(SPRITE_GLYPHS.map((g) => spriteGlyphFill(g)));
    expect(Array.from(points.geometry.getAttribute('emblemCell').array)).toEqual([-1, -1, -1]);
    // Still the layer the interaction layer picks.
    expect(points.userData.type).toBe(INTEL_SPRITE_TYPE);
  });

  it('draws the artwork, with no shapes branch, when there is an atlas', () => {
    const material = buildIntelSprites(marks, atlas())!.material as THREE.ShaderMaterial;
    expect(material.defines ?? {}).not.toHaveProperty('DRAW_SHAPES');
  });

  it('leaves a layer that gives no shapes drawing nothing without its atlas, as Raver Watch and War & Conflict expect', () => {
    expect(buildGlyphSprites([{ position: new THREE.Vector3(0, 0, 100), sizePx: 20, cell: 0, row: 0 }], null, { cellCount: 1, rowCount: 1, type: 'other' })).toBeNull();
  });

  it('draws nothing when there are no marks', () => {
    expect(buildIntelSprites([], atlas())).toBeNull();
  });
});

/*
 * Two independent reasons not to move, both honoured. The app has its own
 * enableAnimations setting, and the machine's owner may have asked the OS for
 * reduced motion; neither overrides the other.
 */
describe('when nothing should move', () => {
  it('stills every mark when asked not to animate', () => {
    const motion = buildIntelSprites(marks, atlas(), { animate: false })!
      .geometry.getAttribute('motion');

    for (let i = 0; i < motion.count; i += 1) {
      expect(motion.getX(i)).toBe(0);
    }
  });

  it('stills every mark when the machine asks for reduced motion', () => {
    const original = window.matchMedia;
    // jsdom does not implement matchMedia, so this both stubs it and stands in
    // for a real user preference.
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

    try {
      const motion = buildIntelSprites(marks, atlas())!.geometry.getAttribute('motion');
      for (let i = 0; i < motion.count; i += 1) {
        expect(motion.getX(i)).toBe(0);
      }
    } finally {
      window.matchMedia = original;
    }
  });

  /*
   * And it must not throw where matchMedia does not exist at all, which is the
   * suite's own environment.
   */
  it('draws normally where the preference cannot be read', () => {
    const motion = buildIntelSprites(marks, atlas())!.geometry.getAttribute('motion');

    expect(motion.getX(1)).toBeGreaterThan(0);
  });
});

/*
 * Picking. The sprite layer is what a person clicks now, so it has to be able
 * to say which mark a raycast hit — and to say nothing when the hit was some
 * other layer's, because the globe raycasts several at once.
 */
describe('which mark was hit', () => {
  const hitOn = (object: THREE.Object3D, index?: number) =>
    ({ object, index, distance: 1, point: new THREE.Vector3() }) as unknown as THREE.Intersection;

  it('reads the index off a hit on its own layer', () => {
    const points = buildIntelSprites(marks, atlas())!;

    expect(intelSpriteIndexAt(hitOn(points, 2))).toBe(2);
    expect(intelSpriteIndexAt(hitOn(points, 0))).toBe(0);
  });

  /*
   * The case that keeps this from claiming another layer's hit: every screen
   * mark on the globe is a THREE.Points, so the type tag is the only thing
   * separating them.
   */
  it('says nothing about a hit on another layer', () => {
    const someoneElse = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    someoneElse.userData = { type: 'spaceWeatherPoints' };

    expect(intelSpriteIndexAt(hitOn(someoneElse, 1))).toBeNull();
    expect(intelSpriteIndexAt(hitOn(new THREE.Mesh(), 1))).toBeNull();
  });

  /*
   * A Mesh hit carries no index. Reading one anyway would resolve to mark 0 and
   * open the wrong report — silently, and always the same one.
   */
  it('says nothing when the hit carries no index', () => {
    const points = buildIntelSprites(marks, atlas())!;

    expect(intelSpriteIndexAt(hitOn(points, undefined))).toBeNull();
  });
});

describe('the mark under the pointer', () => {
  it('grows the hovered mark and nothing else', () => {
    const points = buildIntelSprites(marks, atlas())!;
    const material = points.material as THREE.ShaderMaterial;

    expect(material.uniforms.hoveredIndex.value).toBe(-1);
    setIntelSpriteHovered(points, 1);
    expect(material.uniforms.hoveredIndex.value).toBe(1);
  });

  it('lets the hover go', () => {
    const points = buildIntelSprites(marks, atlas())!;
    setIntelSpriteHovered(points, 1);

    setIntelSpriteHovered(points, null);

    expect((points.material as THREE.ShaderMaterial).uniforms.hoveredIndex.value).toBe(-1);
  });

  /*
   * Each mark carries its own index, or the shader could not tell which one the
   * uniform names.
   */
  it('gives every mark its own index', () => {
    const idx = buildIntelSprites(marks, atlas())!.geometry.getAttribute('markIndex');

    expect([idx.getX(0), idx.getX(1), idx.getX(2)]).toEqual([0, 1, 2]);
  });

  /*
   * A hover must not rebuild anything: this runs from a mousemove handler.
   */
  it('costs a uniform, not a rebuild', () => {
    const points = buildIntelSprites(marks, atlas())!;
    const geometry = points.geometry;

    setIntelSpriteHovered(points, 2);

    expect(points.geometry).toBe(geometry);
  });
});

/*
 * Turning a set of raycast hits into the report a person meant.
 *
 * Extracted from the mousemove handler so the decision can be tested at all:
 * the handler lives in a 1300-line component whose own test file has been
 * skipped for long enough to reference a hook that no longer exists.
 */
describe('which report a set of hits means', () => {
  const hitOn = (object: THREE.Object3D, index?: number) =>
    ({ object, index, distance: 1, point: new THREE.Vector3() }) as unknown as THREE.Intersection;
  const reports = ['first', 'second', 'third'];
  const reportAt = (i: number) => reports[i] ?? null;

  it('reads the report under the pointer', () => {
    const points = buildIntelSprites(marks, atlas())!;

    expect(intelReportAtHits([hitOn(points, 1)], reportAt)).toBe('second');
  });

  /*
   * The globe raycasts several layers at once and the NEAREST hit is often a
   * country fill or a satellite. A foreign hit has to be skipped rather than
   * ending the search, or a mark would only be clickable when nothing else sat
   * in front of it.
   */
  it('looks past hits that belong to other layers', () => {
    const points = buildIntelSprites(marks, atlas())!;
    const country = new THREE.Mesh();
    const satellite = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    satellite.userData = { type: 'satellites' };

    expect(intelReportAtHits([hitOn(country, 0), hitOn(satellite, 2), hitOn(points, 0)], reportAt))
      .toBe('first');
  });

  it('takes the nearest of its own marks, which is the first hit', () => {
    const points = buildIntelSprites(marks, atlas())!;

    expect(intelReportAtHits([hitOn(points, 2), hitOn(points, 0)], reportAt)).toBe('third');
  });

  it('says nothing when none of the hits is a mark', () => {
    expect(intelReportAtHits([hitOn(new THREE.Mesh(), 0)], reportAt)).toBeNull();
    expect(intelReportAtHits([], reportAt)).toBeNull();
  });

  /*
   * An index the layer no longer has — the reports changed between the draw and
   * the pick — must not open a report and must not end the search.
   */
  it('keeps looking when a hit resolves to no report', () => {
    const points = buildIntelSprites(marks, atlas())!;

    expect(intelReportAtHits([hitOn(points, 99), hitOn(points, 0)], reportAt)).toBe('first');
  });
});

/*
 * A mark drawn from storage is faded (decision D-F, step 4.4).
 *
 * Per MARK rather than per layer, because both kinds are in one batched object
 * and the point is to tell them apart inside a single frame — a capture may be
 * cropped away from the note that explains it, and stale intel drawn identically
 * to live intel would read as the current picture in a post.
 */
describe('how faded each mark is', () => {
  it('draws every mark solid unless asked otherwise', () => {
    const attr = buildIntelSprites(marks, atlas())!.geometry.getAttribute('markOpacity');

    for (let i = 0; i < attr.count; i += 1) expect(attr.getX(i)).toBe(1);
  });

  it('fades only the marks it was told to fade', () => {
    const mixed: IntelSpriteMark[] = [
      { ...marks[0], opacity: 0.45 },
      marks[1],
      { ...marks[2], opacity: 0.45 },
    ];

    const attr = buildIntelSprites(mixed, atlas())!.geometry.getAttribute('markOpacity');

    // Read back through a Float32Array, so 0.45 comes out as 0.44999998807907104.
    expect(attr.getX(0)).toBeCloseTo(0.45, 5);
    expect(attr.getX(1)).toBe(1);
    expect(attr.getX(2)).toBeCloseTo(0.45, 5);
  });

  /*
   * The shader has to USE it, not merely declare it.
   *
   * The first version of this asserted that the fragment shader contained
   * `vMarkOpacity`, which it still did with the multiply deleted — the varying
   * was declared and ignored. A mutation removing it from the alpha survived,
   * so every mark would have drawn solid with the whole path green. This reads
   * the line that decides the alpha.
   */
  it('uses it in the alpha it writes, not just declares it', () => {
    const material = buildIntelSprites(marks, atlas())!.material as THREE.ShaderMaterial;
    const alpha = material.fragmentShader
      .split('\n')
      .find((line) => /gl_FragColor = (sRGBTransferOETF\()?vec4\(/.test(line));

    expect(alpha).toBeDefined();
    expect(alpha).toContain('vMarkOpacity');
  });

  // D-EQ, EQ13: the atlas is decoded to linear as it is sampled, so what is written goes back to the screen's colour;
  // without it every glyph drew darker than its colour in the key.
  it('writes its colour back in the screen\'s colour space', () => {
    const material = buildIntelSprites(marks, atlas())!.material as THREE.ShaderMaterial;
    const written = material.fragmentShader.split('\n').find((line) => line.includes('gl_FragColor ='));
    expect(written).toContain('sRGBTransferOETF(');
  });

  it('carries it from the attribute into the varying', () => {
    const material = buildIntelSprites(marks, atlas())!.material as THREE.ShaderMaterial;

    expect(material.vertexShader).toContain('attribute float markOpacity');
    expect(material.vertexShader).toContain('vMarkOpacity = markOpacity');
  });
});

/*
 * A replay (decision D-F, section 18, item 5): each mark appears as the replay
 * clock passes its time, read at draw time so a frame shows exactly the moment
 * it was set to.
 */
import { setReplayMoment } from '../replayClock';

describe('marks in a replay', () => {
  const T = Date.parse('2026-09-20T00:00:00Z');
  const timed: IntelSpriteMark[] = [
    { ...marks[0], timeMs: T },
    { ...marks[1], timeMs: T + 3_600_000 },
    { ...marks[2], timeMs: null },
  ];
  const renderer = {
    getPixelRatio: () => 1,
    getSize: (v: THREE.Vector2) => v.set(1280, 720),
  } as unknown as THREE.WebGLRenderer;
  const drawOnce = (points: THREE.Points) =>
    points.onBeforeRender(renderer, null as never, null as never, null as never, points.material as THREE.Material, null as never);

  it('carries each mark\'s time, in seconds from the earliest, and marks the untimed', () => {
    const points = buildIntelSprites(timed, atlas())!;
    const time = points.geometry.getAttribute('markTime');
    expect(time.getX(0)).toBe(0);
    expect(time.getX(1)).toBe(3600);
    expect(time.getX(2)).toBeLessThan(-1e8);
    expect(points.userData.timeBaseMs).toBe(T);
  });

  it('shows everything when no replay is running', () => {
    setReplayMoment(null);
    const points = buildIntelSprites(timed, atlas())!;
    drawOnce(points);
    expect((points.material as THREE.ShaderMaterial).uniforms.revealAt.value).toBeGreaterThan(1e20);
  });

  it('reads the replay clock each time it draws, in the marks\' own units', () => {
    const points = buildIntelSprites(timed, atlas())!;
    setReplayMoment({ atMs: T + 1_800_000, fadeMs: 60_000 });
    drawOnce(points);
    const u = (points.material as THREE.ShaderMaterial).uniforms;
    expect(u.revealAt.value).toBe(1800);
    expect(u.revealFade.value).toBe(60);
    setReplayMoment(null);
    drawOnce(points);
    expect(u.revealAt.value).toBeGreaterThan(1e20);
  });

  it('reads a bounded replay\'s span too, so marks outside it stay hidden (BA2)', () => {
    const points = buildIntelSprites(timed, atlas())!;
    const u = (points.material as THREE.ShaderMaterial).uniforms;
    setReplayMoment({ atMs: T + 1_800_000, fadeMs: 60_000, fromMs: T + 600_000, untilMs: T + 7_200_000 });
    drawOnce(points);
    expect(u.revealFrom.value).toBe(600);
    expect(u.revealUntil.value).toBe(7200);
    // Unbounded, and with no replay: nothing hidden for being outside.
    setReplayMoment({ atMs: T + 1_800_000, fadeMs: 60_000 });
    drawOnce(points);
    expect(u.revealFrom.value).toBeLessThan(-1e20);
    expect(u.revealUntil.value).toBeGreaterThan(1e20);
    setReplayMoment(null);
    drawOnce(points);
    expect(u.revealFrom.value).toBeLessThan(-1e20);
    const material = points.material as THREE.ShaderMaterial;
    expect(material.vertexShader).toMatch(/step\(revealFrom, markTime\) \* step\(markTime, revealUntil\)/);
  });

  it('hides a mark whose time has not come, in the shader', () => {
    const material = buildIntelSprites(timed, atlas())!.material as THREE.ShaderMaterial;
    expect(material.vertexShader).toMatch(/revealAt/);
    expect(material.fragmentShader).toMatch(/vReveal/);
  });
});

describe('the count badges in a replay', () => {
  it('hide while a replay runs, since a count includes reports not yet shown', () => {
    const badges = buildPlaceBadges([{ position: new THREE.Vector3(0, 0, 100), count: 3 }], atlas())!;
    const material = badges.material as THREE.ShaderMaterial;
    const renderer = { getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(1280, 720) } as unknown as THREE.WebGLRenderer;
    const draw = () => badges.onBeforeRender(renderer, null as never, null as never, null as never, material, null as never);

    setReplayMoment({ atMs: 0, fadeMs: 1 });
    draw();
    expect(material.uniforms.hidden.value).toBe(1);
    setReplayMoment(null);
    draw();
    expect(material.uniforms.hidden.value).toBe(0);
    expect(material.fragmentShader).toMatch(/hidden/);
  });
});

/*
 * A category's emblem inside the glyph (BA12–BA14; plan block J, item 5). The
 * glyph keeps its colour for the assessment and takes the category's icon in
 * place of the assessment's own interior mark; a report nobody assessed is a
 * hollow page, so assessed and not assessed still differ by more than hue.
 */
describe('emblems', () => {
  it('a page cell per assessment after the glyphs, so no glyph moves', () => {
    expect(INTEL_VARIANTS.map(emblemPageCellOf)).toEqual(INTEL_VARIANTS.map((_, i) => SPRITE_GLYPHS.length + i));
    expect(SPRITE_GLYPHS.map(atlasCellOf)).toEqual(SPRITE_GLYPHS.map((_, i) => i));
  });

  it('each page plain, without the assessment\'s interior mark; not assessed a hollow page', () => {
    for (const variant of ['critical', 'actionable', 'standard'] as const) {
      const page = styledPageSvg(variant, 'disc');
      // The page and its fold, and nothing drawn inside: no bars, no bang, no chevron.
      expect(page).not.toMatch(/<rect x="19"|<rect x="28"|M25 25 L39 38/);
    }
    expect(styledPageSvg('raw', 'disc')).toContain(`fill="${ROLES.surface.panel}"`);
    expect(styledPageSvg('standard', 'disc')).not.toContain(`fill="${ROLES.surface.panel}"`);
  });

  it('one emblem a category, the generic one last, each a mask at the page\'s middle in every style', () => {
    expect(EMBLEM_SYMBOLS).toEqual([...INTEL_CATEGORIES.map((c) => INTEL_CATEGORY_SYMBOLS[c]), GENERIC_CATEGORY_SYMBOL]);
    expect(emblemCellOf(INTEL_CATEGORY_SYMBOLS.conflict)).toBe(0);
    expect(emblemCellOf(GENERIC_CATEGORY_SYMBOL)).toBe(INTEL_CATEGORIES.length);
    const mask = emblemMaskSvg(INTEL_CATEGORY_SYMBOLS.world);
    // Drawn as the glyph is inside its backing: translated 8 and scaled by three quarters.
    expect(mask).toContain('transform="translate(8 8) scale(0.75)"');
    // Opaque ink: the shader reads only where it is drawn.
    expect(mask).toMatch(/stroke="#[0-9a-f]{6}"/i);
    expect(mask).toContain('<circle cx="12" cy="12" r="10"/>');
    // Self-contained, as every glyph is: it is baked through an image under a CSP.
    for (const symbol of EMBLEM_SYMBOLS) {
      const each = emblemMaskSvg(symbol);
      expect(each).not.toMatch(/<image\b/i);
      expect(each).not.toMatch(/href\s*=/i);
      expect(each).not.toMatch(/url\(/i);
      expect(each).not.toMatch(/<script/i);
    }
  });

  it('a mark with an emblem draws its assessment\'s page and names its emblem and the ink for it', () => {
    const emblems = new THREE.Texture();
    const points = buildIntelSprites([
      { ...marks[0], emblem: INTEL_CATEGORY_SYMBOLS.charity },
      { ...marks[1], emblem: INTEL_CATEGORY_SYMBOLS.conflict },
      marks[2],
    ], atlas(), { emblems })!;
    const at = (name: string) => [0, 1, 2].map((i) => points.geometry.getAttribute(name).getX(i));
    expect(at('atlasCell')).toEqual([emblemPageCellOf('raw'), emblemPageCellOf('critical'), atlasCellOf('actionable')]);
    expect(at('emblemCell')).toEqual([emblemCellOf(INTEL_CATEGORY_SYMBOLS.charity), emblemCellOf(INTEL_CATEGORY_SYMBOLS.conflict), -1]);
    // Grey ink on the hollow page of a report nobody assessed, the outline's dark ink on a filled one.
    expect(at('emblemTone')).toEqual([1, 0, 0]);
    const material = points.material as THREE.ShaderMaterial;
    expect(material.uniforms.emblems.value).toBe(emblems);
    expect(material.uniforms.emblemCount.value).toBe(EMBLEM_SYMBOLS.length);
    expect(material.uniforms.cellCount.value).toBe(SPRITE_GLYPHS.length + INTEL_VARIANTS.length);
  });

  it('no emblem without the emblems\' atlas: the glyph as it always was', () => {
    const points = buildIntelSprites([{ ...marks[0], emblem: INTEL_CATEGORY_SYMBOLS.charity }], atlas())!;
    expect(points.geometry.getAttribute('atlasCell').getX(0)).toBe(atlasCellOf('raw'));
    expect(points.geometry.getAttribute('emblemCell').getX(0)).toBe(-1);
  });

  it('a person never wears a category', () => {
    const points = buildIntelSprites([{ ...marks[0], variant: 'rlsh', emblem: INTEL_CATEGORY_SYMBOLS.charity }], atlas(), { emblems: new THREE.Texture() })!;
    expect(points.geometry.getAttribute('atlasCell').getX(0)).toBe(atlasCellOf('rlsh'));
    expect(points.geometry.getAttribute('emblemCell').getX(0)).toBe(-1);
  });

  it('every other layer\'s glyphs carry none', () => {
    const points = buildGlyphSprites([{ position: new THREE.Vector3(), sizePx: 20, cell: 0, row: 0 }], atlas(), { cellCount: 1, rowCount: 1, type: 'x' })!;
    expect(points.geometry.getAttribute('emblemCell').getX(0)).toBe(-1);
    // And the shader still has an emblem texture to bind.
    expect((points.material as THREE.ShaderMaterial).uniforms.emblems.value).toBeInstanceOf(THREE.Texture);
  });
});

// A layer may size its marks by the view (Hero Watch's lifeboats, HW15); every other layer's stay their size.
describe('a layer\'s own size for the view', () => {
  const renderer = { getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(1400, 900) } as unknown as THREE.WebGLRenderer;
  const camera = new THREE.PerspectiveCamera(50, 1400 / 900, 1, 125000);
  camera.position.set(0, 0, 200);
  camera.updateMatrixWorld(true);
  const mark = { position: new THREE.Vector3(0, 0, 100), sizePx: 20, cell: 0, row: 0 };

  it('is whole unless the layer says otherwise, and follows what it says each frame', () => {
    const plain = buildGlyphSprites([mark], atlas(), { cellCount: 1, rowCount: 1, type: 'x' })!;
    plain.onBeforeRender(renderer, null as never, camera, null as never, plain.material as THREE.Material, null as never);
    expect((plain.material as THREE.ShaderMaterial).uniforms.sizeScale.value).toBe(1);
    const seen: THREE.Camera[] = [];
    const sized = buildGlyphSprites([mark], atlas(), { cellCount: 1, rowCount: 1, type: 'x' }, { sizeScaleFor: (_r, cam) => { seen.push(cam); return 0.4; } })!;
    sized.onBeforeRender(renderer, null as never, camera, null as never, sized.material as THREE.Material, null as never);
    expect((sized.material as THREE.ShaderMaterial).uniforms.sizeScale.value).toBe(0.4);
    expect(seen).toEqual([camera]);
    expect((sized.material as THREE.ShaderMaterial).vertexShader).toMatch(/gl_PointSize = [^;]*\* sizeScale/);
  });
});

// Block G, item 1: zoomed out, the Earth's marks no longer outgrow the Earth.
describe('the zoom-out fade', () => {
  const renderer = { getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(1400, 900) } as unknown as THREE.WebGLRenderer;
  const cameraAt = (altitude: number) => {
    const camera = new THREE.PerspectiveCamera(50, 1400 / 900, 1, 125000);
    camera.position.set(0, 0, 100 * (1 + altitude));
    camera.updateMatrixWorld(true);
    return camera;
  };
  const fadeAt = (object: THREE.Points, altitude: number) => {
    const material = object.material as THREE.ShaderMaterial;
    object.updateMatrixWorld(true);
    object.onBeforeRender(renderer, null as never, cameraAt(altitude), null as never, material, null as never);
    return material.uniforms.zoomFade.value;
  };

  it('fades report glyphs as the Earth shrinks on screen', () => {
    const points = buildIntelSprites(marks, atlas())!;
    expect(fadeAt(points, 40)).toBe(0);
    expect(fadeAt(points, 2.5)).toBe(1);
    expect((points.material as THREE.ShaderMaterial).fragmentShader).toMatch(/\* zoomFade\)/);
  });

  it('and the count badges with them', () => {
    const badges = buildPlaceBadges([{ position: new THREE.Vector3(0, 0, 100), count: 2 }], atlas())!;
    expect(fadeAt(badges, 40)).toBe(0);
    expect(fadeAt(badges, 2.5)).toBe(1);
    expect((badges.material as THREE.ShaderMaterial).fragmentShader).toMatch(/\* zoomFade\)/);
  });
});

/*
 * A report's whole mark as one SVG, for its popup and tooltip (decision of 2026-10-08:
 * SVG glyphs everywhere), drawn from the same artwork the atlas is baked from.
 */
describe("a report's glyph off the globe", () => {
  const conflict = INTEL_CATEGORY_SYMBOLS.conflict;

  it('is the styled glyph when there is no emblem, and always for a person', () => {
    expect(reportGlyphSvg('standard', 'glow', null)).toBe(styledGlyphSvg('standard', 'glow'));
    expect(reportGlyphSvg('rlsh', 'ring', conflict)).toBe(styledGlyphSvg('rlsh', 'ring'));
  });

  it("with an emblem, is the assessment's page with the emblem inked on it: dark on a filled page, grey on a page nobody assessed", () => {
    // The emblem is the icon group placed at 17.5, 22 in the page; its stroke is its ink.
    const emblemInk = (svg: string) => /translate\(17\.5 22\)[^>]*stroke="([^"]+)"/.exec(svg)?.[1];
    const filled = reportGlyphSvg('critical', 'disc', conflict);
    expect(filled.startsWith(styledPageSvg('critical', 'disc').replace(/<\/svg>$/, ''))).toBe(true);
    expect(emblemInk(filled)).toBe('#08121a');
    expect(filled.endsWith('</g></svg>')).toBe(true);
    expect(emblemInk(reportGlyphSvg('raw', 'disc', conflict))).toBe(spriteGlyphFill('raw'));
  });

  it('says how much each glyph moves, as the globe moves it: critical pulses, actionable breathes, the rest are still', () => {
    expect(SPRITE_GLYPHS.map((g) => [g, spriteGlyphMotion(g)])).toEqual([
      ['standard', 0], ['critical', 1], ['actionable', 0.45], ['raw', 0], ['rlsh', 0],
    ]);
  });
});
