import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { latLngToGlobeWorld } from '../../../../utils/globeCoordinates';
import type { GlobeNoteSet } from '../../noteDetail/globeNoteStore';
import { distanceKm, findMarkByNoteId, relatedMarks, relatedRadiusKm } from '../relatedMarks';

const note = (id: string, timeMs: number | null = null): GlobeNoteSet => ({
  heading: id, notes: [{ id, kind: 'test', title: id, text: '', timeMs, sources: [] }],
});

/** Marks as a glyph layer builds them: one Points, positions in the scene's frame, words and notes in point order. */
function marks(layer: string, items: Array<{ id: string; lat: number; lng: number; timeMs?: number }>, timed = false): THREE.Group {
  const group = new THREE.Group();
  const positions = new Float32Array(items.length * 3);
  items.forEach((it, i) => latLngToGlobeWorld(it.lat, it.lng, 101).toArray(positions, i * 3));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const base = timed ? Math.min(...items.map((it) => it.timeMs ?? Infinity)) : 0;
  if (timed) geometry.setAttribute('markTime', new THREE.BufferAttribute(new Float32Array(items.map((it) => (it.timeMs === undefined ? -1e9 : (it.timeMs - base) / 1000))), 1));
  const points = new THREE.Points(geometry);
  points.userData = { layer, timeBaseMs: base, tooltips: items.map((it) => `${it.id}\nmore words`), opens: items.map((it) => note(it.id, it.timeMs ?? null)) };
  group.add(points);
  return group;
}

describe("the inspector's related marks (critique-2026-11-01, OR22; plan A5)", () => {
  it('reaches about a tenth of the ground in view, between 25 and 2,000 km', () => {
    expect(relatedRadiusKm(0)).toBe(25);
    // Close in, the field of view bounds it: 637 km up, about 70 km.
    expect(relatedRadiusKm(0.1)).toBeGreaterThan(50);
    expect(relatedRadiusKm(0.1)).toBeLessThan(100);
    // Far out, the horizon: the whole face in view, about 1,600 km.
    expect(relatedRadiusKm(2.5)).toBeGreaterThan(1500);
    expect(relatedRadiusKm(2.5)).toBeLessThan(1800);
    expect(relatedRadiusKm(1000)).toBeLessThanOrEqual(2000);
  });

  it('lists what is drawn within the radius, nearest first, never the item itself, with its layer and first line', () => {
    const groups = [
      marks('Conflict Zones', [{ id: 'self', lat: 50, lng: 30 }, { id: 'near', lat: 50.5, lng: 30 }, { id: 'far', lat: 40, lng: 30 }]),
      marks('Diplomacy', [{ id: 'nearer', lat: 50.2, lng: 30 }]),
    ];
    const found = relatedMarks(groups, { at: { lat: 50, lng: 30 }, radiusKm: 200, window: null, self: note('self') });
    expect(found.map((f) => f.title)).toEqual(['nearer', 'near']);
    expect(found[0].layer).toBe('Diplomacy');
    expect(found[0].distanceKm).toBeCloseTo(distanceKm({ lat: 50, lng: 30 }, { lat: 50.2, lng: 30 }), 0);
    expect(found[1].opens?.notes[0].id).toBe('near');
  });

  it('keeps to the window shown, by each mark time, and skips hidden layers', () => {
    const day = Date.UTC(2026, 10, 1);
    const timed = marks('War & Conflict', [
      { id: 'in', lat: 10, lng: 10.1, timeMs: day + 3_600_000 },
      { id: 'before', lat: 10, lng: 10.2, timeMs: day - 86_400_000 },
    ], true);
    const hidden = marks('Hidden', [{ id: 'hidden', lat: 10, lng: 10.05 }]);
    hidden.visible = false;
    const found = relatedMarks([timed, hidden], { at: { lat: 10, lng: 10 }, radiusKm: 100, window: { start: day, end: day + 86_400_000 } });
    expect(found.map((f) => f.title)).toEqual(['in']);
    expect(found[0].timeMs).toBe(day + 3_600_000);
  });

  it("finds a link's item by its note id, at its own place", () => {
    const groups = [marks('Conflict Zones', [{ id: 'a', lat: 0, lng: 0 }, { id: 'gdelt:123', lat: -33.9, lng: 18.4 }])];
    const hit = findMarkByNoteId(groups, 'gdelt:123')!;
    expect(hit.opens.notes[0].id).toBe('gdelt:123');
    expect(hit.at.lat).toBeCloseTo(-33.9, 3);
    expect(hit.at.lng).toBeCloseTo(18.4, 3);
    expect(findMarkByNoteId(groups, 'missing')).toBeNull();
  });
});
