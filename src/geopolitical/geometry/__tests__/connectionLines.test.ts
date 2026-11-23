import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { buildConnectionLines, type ConnectionSpec } from '../connectionLines';
import { batchedLines } from '../lineBatches';

const onlyBatch = (group: THREE.Group) => group.children[0] as LineSegments2;

describe('buildConnectionLines', () => {
  it('draws every connection in one batch, keeping each connection\'s id', () => {
    const connections: ConnectionSpec[] = [
      { id: 'A', from: { lat: 0, lng: 0 }, to: { lat: 10, lng: 10 } },
      { id: 'B', from: { lat: 20, lng: -30 }, to: { lat: -20, lng: 40 } }
    ];
    const group = buildConnectionLines(connections);

    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toBeInstanceOf(LineSegments2);
    expect(batchedLines(group).map((l) => l.id)).toEqual(['A', 'B']);
  });

  it('returns an empty group for an empty connections array', () => {
    const group = buildConnectionLines([]);
    expect(group.children.length).toBe(0);
  });

  it('carries colour and dashing onto the batch\'s material', () => {
    const connections: ConnectionSpec[] = [{ id: 'A', from: { lat: 0, lng: 0 }, to: { lat: 40, lng: 40 } }];
    const material = onlyBatch(buildConnectionLines(connections, { dashed: true, color: 0x123456 })).material as LineMaterial;
    expect(material.dashed).toBe(true);
    expect(material.color.getHex()).toBe(0x123456);
  });

  it('writes line distances (required for dashing to render correctly)', () => {
    const connections: ConnectionSpec[] = [{ id: 'A', from: { lat: 0, lng: 0 }, to: { lat: 40, lng: 40 } }];
    const batch = onlyBatch(buildConnectionLines(connections, { dashed: true }));
    expect(batch.geometry.getAttribute('instanceDistanceStart')).toBeDefined();
  });

  it('places both endpoints on the sphere at the given radius', () => {
    const connections: ConnectionSpec[] = [{ id: 'A', from: { lat: 10, lng: 20 }, to: { lat: -30, lng: 50 } }];
    const batch = onlyBatch(buildConnectionLines(connections, { radius: 80, arcHeight: 15, segments: 10 }));
    const posAttr = batch.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    const firstPoint = new THREE.Vector3(posAttr.getX(0), posAttr.getY(0), posAttr.getZ(0));
    expect(firstPoint.length()).toBeCloseTo(80, 3);
  });

  it('lifts the arc above the base radius at its midpoint (not a flat chord)', () => {
    const connections: ConnectionSpec[] = [{ id: 'A', from: { lat: 0, lng: -60 }, to: { lat: 0, lng: 60 } }];
    const batch = onlyBatch(buildConnectionLines(connections, { radius: 100, arcHeight: 20, segments: 20 }));
    // LineSegmentsGeometry stores N-1 instanced start/end pairs for N points —
    // the geometric midpoint (segments/2) is instance (segments/2)'s start.
    const startAttr = batch.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    const midIdx = 10; // segments/2
    const midPoint = new THREE.Vector3(startAttr.getX(midIdx), startAttr.getY(midIdx), startAttr.getZ(midIdx));
    expect(midPoint.length()).toBeCloseTo(120, 1); // radius + arcHeight at t=0.5 (sin(pi*0.5)=1)
  });

  it('degenerates gracefully when from and to coincide (no NaN positions)', () => {
    const connections: ConnectionSpec[] = [{ id: 'A', from: { lat: 15, lng: 15 }, to: { lat: 15, lng: 15 } }];
    const batch = onlyBatch(buildConnectionLines(connections, { segments: 8 }));
    const startAttr = batch.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    for (let i = 0; i < startAttr.count; i++) {
      expect(Number.isFinite(startAttr.getX(i))).toBe(true);
      expect(Number.isFinite(startAttr.getY(i))).toBe(true);
      expect(Number.isFinite(startAttr.getZ(i))).toBe(true);
    }
  });
});
