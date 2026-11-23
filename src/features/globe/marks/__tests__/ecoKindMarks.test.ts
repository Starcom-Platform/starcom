import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ecoKindItems, ECO_HAZARD_KIND } from '../ecoKindMarks';
import { buildQuakeDepthLines, hypocentre } from '../quakeDepthLines';
import { KINDS } from '../kindLexicon';

describe("Eco Disasters' kind marks (critique-2026-11-01, O7, OR2, OR29; plan B2)", () => {
  it('gives each hazard a kind the lexicon has', () => {
    for (const kind of Object.values(ECO_HAZARD_KIND)) expect(KINDS[kind]).toBeDefined();
  });

  it("makes each event a mark of its hazard's kind, severity as brightness, its time kept", () => {
    const [quake, fire, wave] = ecoKindItems([
      { id: 'us7000', lat: 38.3, lng: 142.4, hazardType: 'earthquake', magnitude: 6.8, severityBucket: 'major', timestamp: '2026-11-01T06:15:00Z' },
      { id: 'eonet-1', lat: 34.1, lng: -118.2, hazardType: 'wildfire', acres: 12_000, severityBucket: 'minor', timestamp: null },
      { id: 'us7001', lat: -20, lng: -70, hazardType: 'earthquake', magnitude: 7.9, tsunami: true, severityBucket: 'catastrophic' },
    ]);
    expect(quake).toMatchObject({ kind: 'earth:geo:earthquake', magnitude: 6.8, severity: 0.7, timeMs: Date.UTC(2026, 10, 1, 6, 15) });
    // A fire's acres stand for its size; it keeps no time here.
    expect(fire).toMatchObject({ kind: 'earth:fire:wildfire', magnitude: 12_000, severity: 0.35, timeMs: null });
    // A quake with a tsunami flag is drawn as the tsunami it warned of.
    expect(wave).toMatchObject({ kind: 'earth:geo:tsunami', severity: 1 });
  });
});

describe("a quake's depth, drawn (OR29)", () => {
  it('reaches down to where the quake began, at its true depth on the globe', () => {
    const at = hypocentre({ id: 'q', lat: 0, lng: 0, depthKm: 637.1 });
    expect(at.length()).toBeCloseTo(90, 3);
  });

  it('draws a line for each quake with a depth, and folds the ones facing away from the camera', () => {
    const lines = buildQuakeDepthLines([
      { id: 'near', lat: 0, lng: 0, depthKm: 100 },
      { id: 'far', lat: 0, lng: 180, depthKm: 100 },
      { id: 'none', lat: 10, lng: 10, depthKm: 0 },
    ])!;
    expect(lines.userData.quakes).toBe(2);
    const camera = new THREE.PerspectiveCamera();
    // The scene's frame puts the prime meridian on +z: a camera there faces the near quake.
    camera.position.set(0, 0, 400);
    lines.onBeforeRender({} as THREE.WebGLRenderer, new THREE.Scene(), camera, lines.geometry, lines.material as THREE.Material, null as never);
    const p = lines.geometry.getAttribute('position');
    const length = (i: number) => new THREE.Vector3().fromBufferAttribute(p, i * 2).distanceTo(new THREE.Vector3().fromBufferAttribute(p, i * 2 + 1));
    expect(length(0)).toBeGreaterThan(1);
    expect(length(1)).toBe(0);
  });
});
