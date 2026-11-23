/**
 * What is in the picture, in numbers an agent can put in a caption
 * (decision D-F, section 18, item 6; Mecha Jono's `describeView`).
 *
 * Counted from the marks actually drawn, projected through the camera that
 * takes the picture, inside the crop a card is cut from. A caption that says
 * "42 conflict events" has to be true of the image it is posted with.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { describeScene, keyedLayers, markPositions } from '../describeView';
import { rememberNamedNote } from '../../../../services/intel/namesPeople';
import { latLngToGlobeWorld } from '../../../../utils/globeCoordinates';
import type { LayerLegend } from '../../../../services/globe/globeLegendStore';

const RADIUS = 100;
const FRAME = { width: 1400, height: 800 };
const FULL = { x: 0, y: 0, width: 1400, height: 800 };

const camera = () => {
  const cam = new THREE.PerspectiveCamera(50, FRAME.width / FRAME.height, 0.1, 10000);
  cam.position.copy(latLngToGlobeWorld(0, 0, RADIUS * 3));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
};

/** A drawn point layer: positions, sizes, hover labels, and the name it says it is. */
const layer = (name: string, marks: Array<{ lat: number; lng: number; label: string; size?: number }>, extra: Record<string, unknown> = {}) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    marks.flatMap((m) => latLngToGlobeWorld(m.lat, m.lng, RADIUS * 1.01).toArray()), 3));
  geometry.setAttribute('pointSize', new THREE.Float32BufferAttribute(marks.map((m) => m.size ?? 10), 1));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial());
  points.userData = { layer: name, tooltips: marks.map((m) => m.label), ...extra };
  return points;
};

const describe_ = (objects: THREE.Object3D[], legends: LayerLegend[] = [], crop = FULL) => {
  const scene = new THREE.Scene();
  for (const o of objects) scene.add(o);
  return describeScene({ scene, camera: camera(), frame: FRAME, crop, legends });
};

describe('describeScene', () => {
  it('counts the marks in the picture, and not the ones on the far side', () => {
    const d = describe_([layer('Conflict Zones', [
      { lat: 0, lng: 0, label: 'Sudan' },
      { lat: 10, lng: 10, label: 'Chad' },
      { lat: 0, lng: 180, label: 'far side' },
    ])]);
    const conflict = d.layers.find((l) => l.layer === 'Conflict Zones')!;
    expect(conflict.inFrame).toBe(2);
    expect(conflict.drawn).toBe(3);
    expect(conflict.items.map((i) => i.label)).not.toContain('far side');
  });

  it('counts a satellite beside the limb, which the planet does not hide', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(latLngToGlobeWorld(0, 90, 175).toArray(), 3));
    const sat = new THREE.Points(geometry, new THREE.PointsMaterial());
    sat.userData = { layer: 'Satellites', tooltips: ['GEO relay'] };
    // And one straight behind the planet, which it does.
    const behind = new THREE.BufferGeometry();
    behind.setAttribute('position', new THREE.Float32BufferAttribute(latLngToGlobeWorld(0, 180, 175).toArray(), 3));
    const hidden = new THREE.Points(behind, new THREE.PointsMaterial());
    hidden.userData = { layer: 'Satellites', tooltips: ['behind'] };

    const d = describe_([sat, hidden]);
    expect(d.layers[0].items.map((i) => i.label)).toEqual(['GEO relay']);
  });

  it('counts only what the card keeps, when it is cut narrower than the frame', () => {
    const d = describe_([layer('Diplomacy', [
      { lat: 0, lng: 0, label: 'centre' },
      { lat: 0, lng: 40, label: 'east edge' },
    ])], [], { x: 500, y: 200, width: 400, height: 400 });
    expect(d.layers[0].inFrame).toBe(1);
    expect(d.layers[0].items[0].label).toBe('centre');
  });

  it('ranks by size only where the layer says size means something', () => {
    const marks = [
      { lat: 0, lng: 20, label: 'big, off centre', size: 30 },
      { lat: 0, lng: 0, label: 'small, centred', size: 8 },
    ];
    const sized = describe_([layer('Conflict Zones', marks)], [
      { layerId: 'c', layer: 'Conflict Zones', sizeMeans: 'events in that country', swatches: [] },
    ]);
    expect(sized.layers[0].items[0].label).toBe('big, off centre');
    expect(sized.layers[0].rankedBy).toBe('size: events in that country');

    const unsized = describe_([layer('Satellites', marks)]);
    expect(unsized.layers[0].items[0].label).toBe('small, centred');
    expect(unsized.layers[0].rankedBy).toBe('nearest the centre of the picture');
  });

  it('ranks by the value a size stands for, where sizes are capped and tie', () => {
    // Israel at 626 events and Saudi Arabia at 142 both draw at the cap; seen on
    // the first real run, where pixels put Israel third.
    const capped = layer('Conflict Zones', [
      { lat: 0, lng: 0, label: 'SAU: 142 events', size: 22 },
      { lat: 5, lng: 5, label: 'ISR: 626 events', size: 22 },
    ], { magnitudes: [142, 626] });
    const d = describe_([capped], [{ layerId: 'c', layer: 'Conflict Zones', sizeMeans: 'events in that country', swatches: [] }]);
    expect(d.layers[0].items.map((i) => i.label)).toEqual(['ISR: 626 events', 'SAU: 142 events']);
    expect(d.layers[0].items[0].magnitude).toBe(626);
  });

  it('lists at most five, and says how many there are beyond them', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ lat: i * 2, lng: 0, label: `m${i}` }));
    const d = describe_([layer('Water gauges', many)]);
    expect(d.layers[0].items).toHaveLength(5);
    expect(d.layers[0].inFrame).toBe(9);
  });

  it('counts a mark once when a bloom and the mark over it answer with the same words', () => {
    const mark = layer('Cyber Threats', [{ lat: 0, lng: 0, label: 'Russia: 40 indicators' }]);
    const bloom = layer('Cyber Threats', [{ lat: 0, lng: 0, label: 'Russia: 40 indicators' }]);
    const d = describe_([mark, bloom]);
    expect(d.layers[0].inFrame).toBe(1);
  });

  it('never describes a person: RLSH is neither counted nor named', () => {
    const sprites = layer('Intel Reports', [
      { lat: 0, lng: 0, label: 'A report' },
      { lat: 5, lng: 5, label: 'Captain Somebody' },
    ], { layers: ['Intel Reports', 'RLSH'] });
    const d = describe_([sprites, layer('RLSH', [{ lat: 1, lng: 1, label: 'Another person' }])]);
    expect(d.layers.map((l) => l.layer)).toEqual(['Intel Reports']);
    expect(d.layers[0].inFrame).toBe(1);
    expect(JSON.stringify(d)).not.toMatch(/Captain|Another person/);
  });

  it('skips marks nobody can hover, and what is hidden', () => {
    const noLabels = layer('Cyber Threats', [{ lat: 0, lng: 0, label: 'x' }]);
    delete noLabels.userData.tooltips;
    const hidden = layer('Satellites', [{ lat: 0, lng: 0, label: 'ISS' }]);
    hidden.visible = false;
    expect(describe_([noLabels, hidden]).layers).toEqual([]);
  });

  it('names layers drawn as lines or areas, which it does not count', () => {
    const d = describe_([layer('Diplomacy', [{ lat: 0, lng: 0, label: 'x' }])], [
      { layerId: 'b', layer: 'Borders', swatches: [] },
      { layerId: 'd', layer: 'Diplomacy', swatches: [] },
      { layerId: 'r', layer: 'RLSH', swatches: [] },
    ]);
    expect(d.notCounted).toEqual(['Borders']);
  });
});

/*
 * The card's key names only the layers in its picture (decision IM12). Marks are
 * counted; lines and areas are not, so a layer that draws them is keyed whenever
 * it draws: a key that misses a colour on the picture is worse than one naming a
 * colour the picture happens to lack.
 */
describe('the layers a card keys', () => {
  const marks = (layer: string, inFrame: number) => ({ layer, inFrame, drawn: inFrame + 3, items: [], rankedBy: '' });
  const swatch = (shape?: string) => ({ color: '#fff', label: 'x', ...(shape ? { shape } : {}) });

  it('keys a layer with marks in the picture, and not one whose marks are all elsewhere', () => {
    const legends: LayerLegend[] = [
      { layerId: 'a', layer: 'Eco Disasters', swatches: [swatch()] },
      { layerId: 'b', layer: 'Raver Watch', swatches: [swatch()] },
    ];
    expect(keyedLayers({ layers: [marks('Eco Disasters', 2), marks('Raver Watch', 0)], notCounted: [] }, legends))
      .toEqual(['Eco Disasters']);
  });

  it('keys every layer drawn only as lines or areas', () => {
    expect(keyedLayers({ layers: [], notCounted: ['Borders'] }, [])).toEqual(['Borders']);
  });

  it('keys a layer that draws areas or lines as well as marks, with none of its marks in the picture', () => {
    const legends: LayerLegend[] = [
      { layerId: 'w', layer: 'War & Conflict', swatches: [swatch(), swatch('area')] },
      { layerId: 'b', layer: 'Fronts', swatches: [swatch(), swatch('dashed')] },
      { layerId: 'c', layer: 'Pipelines', swatches: [swatch('line')] },
      { layerId: 'd', layer: 'Raver Watch', swatches: [swatch('ring')] },
      // Hatched countries are areas too (theatre-lens.md, TL5).
      { layerId: 'e', layer: 'Outer countries', swatches: [swatch(), swatch('hatch')] },
      // And arcs are lines (TL6).
      { layerId: 'f', layer: 'Forces', swatches: [swatch(), swatch('arc')] },
    ];
    const described = { layers: ['War & Conflict', 'Fronts', 'Pipelines', 'Raver Watch', 'Outer countries', 'Forces'].map((l) => marks(l, 0)), notCounted: [] };
    expect(keyedLayers(described, legends)).toEqual(['War & Conflict', 'Fronts', 'Pipelines', 'Outer countries', 'Forces']);
  });

  it('names each layer once', () => {
    expect(keyedLayers({ layers: [marks('Borders', 1)], notCounted: ['Borders'] }, [])).toEqual(['Borders']);
  });
});

/*
 * Where the picture's marks are, for a close-up inset to keep clear of (IM35):
 * the marks describeScene counts, through the same camera, by position.
 */
describe('where the marks in the picture are', () => {
  const positions = (objects: THREE.Object3D[], crop = FULL) => {
    const scene = new THREE.Scene();
    for (const o of objects) scene.add(o);
    return markPositions({ scene, camera: camera(), frame: FRAME, crop });
  };

  it('each mark on the near side, in the frame\'s pixels, the centre of the view at the centre', () => {
    const at = positions([layer('Conflict Zones', [
      { lat: 0, lng: 0, label: 'Sudan' },
      { lat: 10, lng: 10, label: 'Chad' },
      { lat: 0, lng: 180, label: 'far side' },
    ])]);
    expect(at).toHaveLength(2);
    expect(at[0].x).toBeCloseTo(FRAME.width / 2, 3);
    expect(at[0].y).toBeCloseTo(FRAME.height / 2, 3);
    // North and east of the centre: up and to the right.
    expect(at[1].x).toBeGreaterThan(FRAME.width / 2);
    expect(at[1].y).toBeLessThan(FRAME.height / 2);
  });

  it('only inside the crop, never RLSH\'s, and none of a layer hidden or unlabelled', () => {
    const right = { x: 700, y: 0, width: 700, height: 800 };
    expect(positions([layer('Conflict Zones', [{ lat: 0, lng: -10, label: 'west' }, { lat: 0, lng: 10, label: 'east' }])], right)).toHaveLength(1);
    expect(positions([layer('RLSH', [{ lat: 0, lng: 0, label: 'a person' }])])).toEqual([]);
    const hidden = layer('Conflict Zones', [{ lat: 0, lng: 0, label: 'Sudan' }]);
    hidden.visible = false;
    expect(positions([hidden])).toEqual([]);
    const unlabelled = layer('Conflict Zones', [{ lat: 0, lng: 0, label: '' }]);
    expect(positions([unlabelled])).toEqual([]);
  });
});

describe('a note that names a person (D-NP, NP2)', () => {
  it('is left out of the description an agent may print, a pile quoting it with it; the rest stay', () => {
    rememberNamedNote('n1', 'Minister Jane Roe visits the front', '');
    const d = describe_([layer('War & Conflict', [
      { lat: 0, lng: 0, label: 'Minister Jane Roe visits the front' },
      { lat: 5, lng: 5, label: 'Shelling in the east; Minister Jane Roe visits the front' },
      { lat: 10, lng: 10, label: 'Shelling in the east' },
    ])]);
    const war = d.layers.find((l) => l.layer === 'War & Conflict')!;
    expect(war.items.map((i) => i.label)).toEqual(['Shelling in the east']);
  });
});
