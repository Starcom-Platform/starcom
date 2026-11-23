/**
 * Marks that would cover one another: one drawn, the rest folded under it with a count (D-GV GV6, W1).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  declutterGlyphs, declutterSprites, DECLUTTER_ENTER_GAP_PX, DECLUTTER_RADIUS_FRACTION, type DeclutterCircle,
} from '../glyphDeclutter';
import { badgeCellOf, buildGlyphSprites, disposeIntelSprites, INTEL_BADGE_TYPE, type GlyphSpriteMark } from '../intelReportSprites';
import { visibleHits } from '../pickRadius';
import { holdForCapture, releaseMotion, stillMotion } from '../../../globe-engine/captureClock';

const at = (x: number, y = 0, radius = 15): DeclutterCircle => ({ x, y, radius });

describe('declutterGlyphs', () => {
  it('draws marks apart, and folds one that touches under the more important', () => {
    expect(declutterGlyphs([at(0), at(100)], [0, 1])).toEqual({ shown: [true, true], under: [-1, -1] });
    expect(declutterGlyphs([at(0), at(20)], [1, 0])).toEqual({ shown: [false, true], under: [1, -1] });
  });

  it('takes the earlier mark on a tie, and leaves a mark off screen out of it', () => {
    expect(declutterGlyphs([at(0), at(10)], [0, 0]).shown).toEqual([true, false]);
    expect(declutterGlyphs([null, at(0)], [0, 1])).toEqual({ shown: [false, true], under: [-1, -1] });
  });

  it('keeps a drawn mark until it touches, and draws a hidden one again only with a clear gap', () => {
    // 31 px apart, two radii of 15: a pixel clear, less than the gap a hidden mark needs.
    const close = [at(0), at(31)];
    expect(declutterGlyphs(close, [0, 1]).shown).toEqual([true, false]);
    expect(declutterGlyphs(close, [0, 1], [true, true]).shown).toEqual([true, true]);
    expect(declutterGlyphs([at(0), at(29)], [0, 1], [true, true]).shown).toEqual([true, false]);
    expect(declutterGlyphs([at(0), at(30 + DECLUTTER_ENTER_GAP_PX)], [0, 1], [true, false]).shown).toEqual([true, true]);
  });

  it('folds a mark under the most important one it touches', () => {
    // A and B are clear of each other; C, between them, touches both.
    const { shown, under } = declutterGlyphs([at(0), at(40), at(20)], [1, 0, 2]);
    expect(shown).toEqual([true, true, false]);
    expect(under[2]).toBe(1);
  });

  it('never draws two marks over each other, and each hidden one touches the mark it is under', () => {
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
    const circles = Array.from({ length: 400 }, () => at(random() * 600, random() * 400, 8 + random() * 12));
    const priority = circles.map(() => Math.floor(random() * 5));
    const { shown, under } = declutterGlyphs(circles, priority);
    const drawn = circles.map((c, i) => ({ c, i })).filter(({ i }) => shown[i]);
    for (const a of drawn) {
      for (const b of drawn) {
        if (a.i >= b.i) continue;
        expect(Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y)).toBeGreaterThanOrEqual(a.c.radius + b.c.radius + DECLUTTER_ENTER_GAP_PX);
      }
    }
    circles.forEach((c, i) => {
      if (shown[i]) return;
      const top = circles[under[i]];
      expect(shown[under[i]]).toBe(true);
      expect(Math.hypot(c.x - top.x, c.y - top.y)).toBeLessThan(c.radius + top.radius + DECLUTTER_ENTER_GAP_PX);
      expect(priority[under[i]]).toBeLessThanOrEqual(priority[i]);
    });
  });
});

describe('declutterSprites', () => {
  afterEach(() => { releaseMotion(); });

  const renderer = { getSize: (v: THREE.Vector2) => v.set(800, 600), getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer;
  const cameraAt = (distance: number) => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 1, 10_000);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    return camera;
  };
  /** A mark on a globe of radius 100, `degrees` east of the point facing the camera. */
  const mark = (degrees: number, tooltip: string): GlyphSpriteMark => {
    const r = (degrees * Math.PI) / 180;
    return { position: new THREE.Vector3(101 * Math.sin(r), 0, 101 * Math.cos(r)), sizePx: 35, cell: 0, row: 0, tooltip };
  };
  const draw = (points: THREE.Points, camera: THREE.Camera) => {
    points.updateMatrixWorld(true);
    points.onBeforeRender(renderer, new THREE.Scene(), camera, points.geometry, points.material as THREE.Material, null as never);
  };
  const shownOf = (points: THREE.Points) => Array.from((points.geometry.getAttribute('markShown') as THREE.BufferAttribute).array);
  const badgeOf = (points: THREE.Points) => points.children.find((c) => c.userData.type === INTEL_BADGE_TYPE) as THREE.Points;

  /** Two marks two degrees apart, and one on the far side of the planet. */
  const build = () => {
    const points = buildGlyphSprites([mark(0, 'A'), mark(2, 'B'), mark(180, 'far')], new THREE.Texture(), { cellCount: 1, rowCount: 1, type: 'test' })!;
    declutterSprites(points, {
      priority: [1, 0, 2],
      counts: [3, 1, 1],
      badges: new THREE.Texture(),
      pileOf: (top, under) => ({ tooltip: `${top} over ${under.join(',')}`, opens: { heading: 'pile', notes: [{ title: 'n' } as never] } }),
    });
    return points;
  };

  it('folds the nearer mark under the more important one from far away, and draws both from close', () => {
    const points = build();
    draw(points, cameraAt(1200));
    expect(shownOf(points)).toEqual([0, 1, 0]);
    expect(points.userData.marksUnderOthers).toBe(1);
    // Close up the two degrees are far apart on screen. A live globe fades, so the step is a capture's.
    stillMotion(0);
    draw(points, cameraAt(140));
    expect(shownOf(points)).toEqual([1, 1, 0]);
    expect(points.userData.marksUnderOthers).toBe(0);
    disposeIntelSprites(points);
  });

  it('counts what falls under a drawn mark on its badge, and draws none for a mark of one', () => {
    const points = build();
    draw(points, cameraAt(1200));
    const cells = Array.from((badgeOf(points).geometry.getAttribute('badgeCell') as THREE.BufferAttribute).array);
    expect(cells).toEqual([-1, badgeCellOf(4), -1]);
    stillMotion(0);
    draw(points, cameraAt(140));
    expect(Array.from((badgeOf(points).geometry.getAttribute('badgeCell') as THREE.BufferAttribute).array)).toEqual([badgeCellOf(3), -1, -1]);
  });

  it('has the drawn mark hover and open its pile, and gives each back its own when the pile goes', () => {
    const points = build();
    draw(points, cameraAt(1200));
    expect(points.userData.tooltips).toEqual(['A', '1 over 0', 'far']);
    expect(points.userData.opens[1]).toMatchObject({ heading: 'pile' });
    stillMotion(0);
    draw(points, cameraAt(140));
    expect(points.userData.tooltips).toEqual(['A', 'B', 'far']);
    expect(points.userData.opens[1]).toBeNull();
  });

  it('never answers a pick on a folded mark', () => {
    const points = build();
    draw(points, cameraAt(1200));
    const camera = cameraAt(1200);
    const hit = (index: number) => ({ object: points, index, point: new THREE.Vector3(0, 0, 101), distance: 1 }) as unknown as THREE.Intersection;
    expect(visibleHits([hit(0), hit(1)], camera.position, 100).map((h) => h.index)).toEqual([1]);
  });

  it('places a still card afresh, so the same shot makes the same picture whatever came before', () => {
    // Two marks a hair clear of each other on screen: kept if drawn before, not drawn if hidden before.
    const camera = cameraAt(400);
    const pxPerDegree = (() => {
      const a = mark(0, '').position.clone().project(camera);
      const b = mark(1, '').position.clone().project(camera);
      return ((b.x - a.x) / 2) * 800;
    })();
    const radius = 35 * DECLUTTER_RADIUS_FRACTION;
    const degrees = (2 * radius + 1) / pxPerDegree;
    const points = buildGlyphSprites([mark(0, 'A'), mark(degrees, 'B')], new THREE.Texture(), { cellCount: 1, rowCount: 1, type: 'test' })!;
    declutterSprites(points, { priority: [0, 1], counts: [1, 1] });
    // From close, both drawn; back to the shot's view, the live globe keeps B.
    draw(points, cameraAt(140));
    draw(points, camera);
    expect(shownOf(points)[1]).toBeGreaterThan(0);
    // A card at that view places afresh: B needs its gap.
    stillMotion(0);
    draw(points, camera);
    expect(shownOf(points)).toEqual([1, 0]);
    // A clip's frames follow on from each other: from close again, B is kept.
    releaseMotion();
    const release = holdForCapture();
    stillMotion(0);
    draw(points, cameraAt(140));
    draw(points, camera);
    expect(shownOf(points)).toEqual([1, 1]);
    release();
  });

  it('leaves a layer that does not declutter drawing every mark', () => {
    const points = buildGlyphSprites([mark(0, 'A'), mark(0.5, 'B')], new THREE.Texture(), { cellCount: 1, rowCount: 1, type: 'test' })!;
    draw(points, cameraAt(1200));
    expect(shownOf(points)).toEqual([1, 1]);
    expect(points.children).toHaveLength(0);
  });
});

describe('rings and pings on the drawn marks (W4)', () => {
  afterEach(() => { releaseMotion(); });
  const renderer = { getSize: (v: THREE.Vector2) => v.set(800, 600), getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer;
  const cameraAt = (distance: number) => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 1, 10_000);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    return camera;
  };
  const mark = (degrees: number): GlyphSpriteMark => {
    const r = (degrees * Math.PI) / 180;
    return { position: new THREE.Vector3(101 * Math.sin(r), 0, 101 * Math.cos(r)), sizePx: 35, cell: 0, row: 0 };
  };
  const draw = (points: THREE.Points, camera: THREE.Camera) => {
    points.updateMatrixWorld(true);
    points.onBeforeRender(renderer, new THREE.Scene(), camera, points.geometry, points.material as THREE.Material, null as never);
  };
  const childOf = (points: THREE.Points, type: string) => points.children.find((c) => c.userData.type === type) as THREE.Mesh;
  const firstOfQuad = (mesh: THREE.Mesh, name: string) => {
    const a = mesh.geometry.getAttribute(name) as THREE.BufferAttribute;
    return Array.from({ length: a.count / 4 }, (_, i) => a.getX(i * 4));
  };

  it('sizes a ring by the square root of its figure, draws none under its minimum, and caps the widest', async () => {
    const { ringRadiusPx, RING_MAX_PX } = await import('../glyphOverlays');
    expect(ringRadiusPx(100, 3, 20)).toBe(30);
    expect(ringRadiusPx(400, 3, 20)).toBe(60);
    expect(ringRadiusPx(25, 3, 20)).toBe(0);
    expect(ringRadiusPx(0, 3, 20)).toBe(0);
    expect(ringRadiusPx(1_000_000, 3, 20)).toBe(RING_MAX_PX);
  });

  it("rings a pile by the largest figure in it, never the sum, pings it from its newest, and draws neither on a folded mark", async () => {
    const { MARK_RINGS_TYPE, MARK_PINGS_TYPE } = await import('../glyphOverlays');
    const points = buildGlyphSprites([mark(0), mark(2), mark(180)], new THREE.Texture(), { cellCount: 1, rowCount: 1, type: 'test' })!;
    declutterSprites(points, {
      priority: [1, 0, 2],
      counts: [1, 1, 1],
      rings: { values: [400, 100, 900], color: new THREE.Color(1, 0, 0), pxPerRoot: 3, minPx: 20 },
      pings: { since: [12, -1, 5], color: new THREE.Color(1, 1, 1), clock: () => 13 },
    });
    // From far away, the first mark folds under the second: the drawn one rings for 400 (60 px), not 500.
    draw(points, cameraAt(1200));
    const rings = childOf(points, MARK_RINGS_TYPE);
    expect(firstOfQuad(rings, 'radiusPx').slice(0, 2)).toEqual([0, 60]);
    expect(firstOfQuad(rings, 'level').slice(0, 2)).toEqual([0, 1]);
    // The far mark is behind the planet: not drawn, so no ring.
    expect(firstOfQuad(rings, 'level')[2]).toBe(0);
    const pings = childOf(points, MARK_PINGS_TYPE);
    expect(firstOfQuad(pings, 'since').slice(0, 2)).toEqual([-1, 12]);
    expect((pings.material as THREE.ShaderMaterial).uniforms.time.value).toBe(13);
  });

  it('hides the pings in a capture, and draws the rings in it', async () => {
    const { MARK_RINGS_TYPE, MARK_PINGS_TYPE } = await import('../glyphOverlays');
    const points = buildGlyphSprites([mark(0)], new THREE.Texture(), { cellCount: 1, rowCount: 1, type: 'test' })!;
    declutterSprites(points, {
      priority: [0], counts: [1],
      rings: { values: [400], color: new THREE.Color(1, 0, 0), pxPerRoot: 3, minPx: 20 },
      pings: { since: [1], color: new THREE.Color(1, 1, 1), clock: () => 2 },
    });
    stillMotion(0);
    draw(points, cameraAt(400));
    expect((childOf(points, MARK_PINGS_TYPE).material as THREE.ShaderMaterial).uniforms.hidden.value).toBe(1);
    expect(firstOfQuad(childOf(points, MARK_RINGS_TYPE), 'radiusPx')).toEqual([60]);
    releaseMotion();
    draw(points, cameraAt(400));
    expect((childOf(points, MARK_PINGS_TYPE).material as THREE.ShaderMaterial).uniforms.hidden.value).toBe(0);
    disposeIntelSprites(points);
  });
});
