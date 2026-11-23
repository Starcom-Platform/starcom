import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveInstancedTooltip, resolvePointOpens, isDrawn } from '../useGlobePointTooltips';
import { buildScreenPoints } from '../../screenPoints';
import { buildGlyphSprites, type GlyphSpriteMark } from '../../intelReportSprites';
import type { GlobeNoteSet } from '../../../../features/globe/noteDetail/globeNoteStore';

function makeInstancedMesh(points: Array<{ tooltip?: string }> | undefined): THREE.InstancedMesh {
  const geom = new THREE.SphereGeometry(1, 4, 4);
  const mat = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geom, mat, Math.max(1, points?.length ?? 1));
  if (points) mesh.userData = { type: 'test', points };
  return mesh;
}

describe('resolveInstancedTooltip', () => {
  it('returns the real tooltip string for a hit InstancedMesh instance', () => {
    const mesh = makeInstancedMesh([{ tooltip: 'A' }, { tooltip: 'B' }]);
    const intersection = { object: mesh, instanceId: 1 } as unknown as THREE.Intersection;
    expect(resolveInstancedTooltip(intersection)).toBe('B');
  });

  it('returns null for a hit on a non-InstancedMesh object (e.g. the base globe sphere)', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1));
    const intersection = { object: mesh, instanceId: undefined } as unknown as THREE.Intersection;
    expect(resolveInstancedTooltip(intersection)).toBeNull();
  });

  it('returns null when the InstancedMesh has no real userData.points (a layer that never opted in)', () => {
    const mesh = makeInstancedMesh(undefined);
    const intersection = { object: mesh, instanceId: 0 } as unknown as THREE.Intersection;
    expect(resolveInstancedTooltip(intersection)).toBeNull();
  });

  it('returns null when instanceId is missing (a non-instanced hit reported by the raycaster)', () => {
    const mesh = makeInstancedMesh([{ tooltip: 'A' }]);
    const intersection = { object: mesh, instanceId: undefined } as unknown as THREE.Intersection;
    expect(resolveInstancedTooltip(intersection)).toBeNull();
  });

  it('returns null when the specific real instance has no tooltip set', () => {
    const mesh = makeInstancedMesh([{ tooltip: 'A' }, {}]);
    const intersection = { object: mesh, instanceId: 1 } as unknown as THREE.Intersection;
    expect(resolveInstancedTooltip(intersection)).toBeNull();
  });
});

/**
 * A screenPoints layer is ONE THREE.Points object with its tooltips in point order, and
 * nothing resolved them until now — which is how converting the space-weather samples
 * from react-globe.gl points to screen points quietly took away the hover label
 * pointLabel had been giving them for free.
 */
describe('resolveInstancedTooltip — screen-point layers', () => {
  const points = (tooltips: Array<string | undefined>) => buildScreenPoints(
    tooltips.map((tooltip, i) => ({
      position: new THREE.Vector3(100 + i, 0, 0), sizePx: 8, color: 0xffffff, tooltip,
    })),
  );

  it('returns the tooltip of the point that was hit, by index', () => {
    const hit = { object: points(['first', 'second']), index: 1 } as unknown as THREE.Intersection;
    expect(resolveInstancedTooltip(hit)).toBe('second');
  });

  it('returns null for a layer that publishes no tooltips at all', () => {
    const hit = { object: points([undefined, undefined]), index: 0 } as unknown as THREE.Intersection;
    expect(resolveInstancedTooltip(hit)).toBeNull();
  });

  it('returns null when the raycaster reported no index', () => {
    const hit = { object: points(['first']) } as unknown as THREE.Intersection;
    expect(resolveInstancedTooltip(hit)).toBeNull();
  });

  it('returns null for a point beyond the tooltips it has', () => {
    const hit = { object: points(['only']), index: 7 } as unknown as THREE.Intersection;
    expect(resolveInstancedTooltip(hit)).toBeNull();
  });

  it('keeps every point\'s tooltip in the order the points were given', () => {
    const object = points(['a', 'b', 'c']);
    expect(object.userData.tooltips).toEqual(['a', 'b', 'c']);
  });
});

describe('a field that covers the planet (decision D-W)', () => {
  it('answers with its reading at the point the ray met it', () => {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(100.1, 8, 8), new THREE.MeshBasicMaterial());
    shell.userData.readAt = (p: THREE.Vector3) => `read at ${p.x},${p.y},${p.z}`;
    const hit = { object: shell, point: new THREE.Vector3(1, 2, 3) } as unknown as THREE.Intersection;
    expect(resolveInstancedTooltip(hit)).toBe('read at 1,2,3');
  });
});

describe('isDrawn', () => {
  // Block G, item 1: what cannot be seen is not there to point at.
  it('does not let a mark faded all but away answer a hover', () => {
    const mark = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: { zoomFade: { value: 0 } } }));
    expect(isDrawn(mark)).toBe(false);
    (mark.material as THREE.ShaderMaterial).uniforms.zoomFade.value = 1;
    expect(isDrawn(mark)).toBe(true);
  });

  it('lets only what is shown answer a hover: a hidden mark, or a mark in a hidden group, does not', () => {
    const group = new THREE.Group();
    const mark = new THREE.Mesh();
    group.add(mark);
    expect(isDrawn(mark)).toBe(true);
    mark.visible = false;
    expect(isDrawn(mark)).toBe(false);
    mark.visible = true;
    group.visible = false;
    expect(isDrawn(mark)).toBe(false);
  });
});

/**
 * A click on a mark opens what its hover names (D-CT, CT3): a glyph layer hangs a note set on
 * each mark beside its tooltip, collected in point order as the tooltips are.
 */
describe('resolvePointOpens', () => {
  const layout = { cellCount: 1, rowCount: 1, type: 'test-glyphs', shapes: { fills: [new THREE.Color(1, 1, 1)], outline: new THREE.Color(0, 0, 0) } };
  const set = (title: string): GlobeNoteSet => ({
    heading: 'AI Watch',
    notes: [{ id: title, kind: 'AI Watch note', title, text: '', timeMs: null, sources: ['https://example.org/a'] }],
  });
  const mark = (x: number, over: Partial<GlyphSpriteMark> = {}): GlyphSpriteMark => ({
    position: new THREE.Vector3(100 + x, 0, 0), sizePx: 20, cell: 0, row: 0, tooltip: `mark ${x}`, ...over,
  });

  it('opens the notes of the mark that was hit, by index, beside its tooltip', () => {
    const object = buildGlyphSprites([mark(0, { opens: set('first') }), mark(1), mark(2, { opens: set('third') })], null, layout, { animate: false })!;
    const opens = (index: number) => resolvePointOpens({ object, index } as unknown as THREE.Intersection);
    expect(opens(0)?.notes[0].title).toBe('first');
    expect(opens(1)).toBeNull();
    expect(opens(2)?.notes[0].title).toBe('third');
    expect(resolveInstancedTooltip({ object, index: 2 } as unknown as THREE.Intersection)).toBe('mark 2');
  });

  it('opens nothing for a layer that hangs no notes, an empty set, or a hit with no index', () => {
    const plain = buildGlyphSprites([mark(0)], null, layout, { animate: false })!;
    expect(plain.userData.opens).toBeUndefined();
    expect(resolvePointOpens({ object: plain, index: 0 } as unknown as THREE.Intersection)).toBeNull();
    const empty = buildGlyphSprites([mark(0, { opens: { heading: 'x', notes: [] } })], null, layout, { animate: false })!;
    expect(resolvePointOpens({ object: empty, index: 0 } as unknown as THREE.Intersection)).toBeNull();
    const withSet = buildGlyphSprites([mark(0, { opens: set('a') })], null, layout, { animate: false })!;
    expect(resolvePointOpens({ object: withSet } as unknown as THREE.Intersection)).toBeNull();
    expect(resolvePointOpens({ object: new THREE.Mesh(), index: 0 } as unknown as THREE.Intersection)).toBeNull();
  });
});

describe('lines and fills that answer (D-GV GV0.4)', () => {
  const notes = (heading: string): GlobeNoteSet => ({ heading, notes: [{ title: heading } as never] });
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 1, 1000);
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const rayAt = (ndcX: number, ndcY: number) => {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    (raycaster.params as { Line2?: { threshold: number } }).Line2 = { threshold: 4 };
    return raycaster;
  };

  it('names the line whose segment the ray met, and opens its notes', async () => {
    const { buildLineBatch } = await import('../../../../geopolitical/geometry/lineBatches');
    const batch = buildLineBatch([
      { id: 'low', color: 0xff0000, positions: [-10, -5, 0, 10, -5, 0], tooltip: 'The low edge', opens: notes('Low') },
      { id: 'high', color: 0xff0000, positions: [-10, 5, 0, 0, 5, 0, 10, 5, 0], tooltip: 'The high edge', opens: notes('High') },
      { id: 'mute', color: 0xff0000, positions: [-10, 0, 0, 10, 0, 0] },
    ], { opacity: 1, linewidth: 1.25, dashed: false, dashSize: 1, gapSize: 0, dashScale: 1, renderOrder: 0 })!;
    (batch.material as unknown as { resolution: THREE.Vector2 }).resolution.set(800, 600);
    batch.updateMatrixWorld(true);
    // Straight at the high edge's second segment: y = 5 at distance 50 is ndc ≈ 0.214 on a 50° camera.
    const yHigh = 5 / (50 * Math.tan((25 * Math.PI) / 180));
    const [hit] = rayAt(0.3, yHigh).intersectObject(batch);
    expect(hit.faceIndex).toBe(2);
    expect(resolveInstancedTooltip(hit)).toBe('The high edge');
    expect(resolvePointOpens(hit)?.heading).toBe('High');
    // A line given no words says nothing and opens nothing.
    const [mute] = rayAt(0.1, 0).intersectObject(batch);
    expect(resolveInstancedTooltip(mute)).toBeNull();
    expect(resolvePointOpens(mute)).toBeNull();
  });

  it("answers by a fill's own words, and a fill with none says nothing", () => {
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial());
    fill.userData = { tooltip: 'Russia–Ukraine war', opens: notes('The war') };
    fill.updateMatrixWorld(true);
    const [hit] = rayAt(0, 0).intersectObject(fill);
    expect(resolveInstancedTooltip(hit)).toBe('Russia–Ukraine war');
    expect(resolvePointOpens(hit)?.heading).toBe('The war');
    const quiet = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial());
    quiet.updateMatrixWorld(true);
    expect(resolveInstancedTooltip(rayAt(0, 0).intersectObject(quiet)[0])).toBeNull();
  });
});

describe('clippedAt (D-PW, PW73)', () => {
  it('says a hit lies in the half its material\'s planes clip away, and none clip a material without planes', async () => {
    const { clippedAt } = await import('../useGlobePointTooltips');
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    expect(clippedAt({ object: mesh, point: new THREE.Vector3(-5, 0, 0) })).toBe(false);
    material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)];
    expect(clippedAt({ object: mesh, point: new THREE.Vector3(-5, 0, 0) })).toBe(true);
    expect(clippedAt({ object: mesh, point: new THREE.Vector3(5, 0, 0) })).toBe(false);
  });
});
