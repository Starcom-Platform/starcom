import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchedLines } from '../geometry/lineBatches';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { verifyGeopoliticalAssets } from '../integrity/verifyGeopoliticalAssets';
import { nationalTerritoriesService } from '../services/NationalTerritoriesService';
import { GeometryFactory } from '../geometry/geometryFactory';

// Utility to build a simple manifest + asset fetch environment
const sampleManifest = {
  generated: new Date().toISOString(),
  algorithm: ['sha256','sha1'],
  artifacts: [
    { path: 'public/geopolitical/topology/world-borders.topology.json', bytes: 50, sha256: '', sha1: '', class: 'topology', note: 'test' }
  ],
  summary: { count: 1, totalBytes: 50 },
  notes: {}
};

// Pre-computed sha256 for the tiny test asset content below will be filled at runtime.
const testAssetContent = JSON.stringify({ arcs: [], lods: {}, quantization: 1 });

// Simple sha256 helper mirroring production
async function sha256Hex(str: string) {
  const enc = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

describe('Geopolitical Geometry / Integrity', () => {
  beforeEach(async () => {
    // Reset fetch mock each test
    (global as any).fetch = vi.fn(async (url: string) => {
      if (url.endsWith('geopolitical-manifest.json')) {
        // Fill correct hash lazily
        if (!sampleManifest.artifacts[0].sha256) {
          sampleManifest.artifacts[0].sha256 = await sha256Hex(testAssetContent);
          sampleManifest.artifacts[0].sha1 = 'dummy';
        }
        return new Response(JSON.stringify(sampleManifest), { status: 200 });
      }
      if (url.endsWith('world-borders.topology.json')) {
        // Intentionally not a real Response: in this jsdom/Node test environment,
        // Response.arrayBuffer() returns a buffer that satisfies `instanceof
        // ArrayBuffer` but crypto.subtle.digest() still rejects at runtime — a
        // cross-realm mismatch between jsdom's fetch polyfill and Node's native
        // WebCrypto. A plain object whose arrayBuffer() resolves a real
        // TextEncoder-backed buffer (same technique sha256Hex already uses below)
        // sidesteps it; verifyGeopoliticalAssets only ever calls .ok/.arrayBuffer()
        // on this response, never Response-specific methods.
        return {
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode(testAssetContent).buffer
        } as unknown as Response;
      }
      // Generic fallback minimal geojson for loadBordersLOD fallback path
      if (url.includes('world-borders-lod')) {
        return new Response(JSON.stringify({ features: [] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
  });

  it('verifies integrity manifest (topology subset)', async () => {
    const result = await verifyGeopoliticalAssets({ includeClasses: ['topology'], maxBytes: 1000 });
    expect(result.ok).toBe(true);
    expect(result.artifacts.length).toBeGreaterThan(0);
    const topo = result.artifacts.find(a => a.path.includes('world-borders.topology'));
    expect(topo?.status).toBe('verified');
  });

  it('builds border lines with classification userData', () => {
    // Provide two simple line features
    const group = GeometryFactory.buildBorderLines([
      { id: 'A', coordinates: [[0,0],[10,10]] },
      { id: 'B', coordinates: [[20,0],[30,5]] }
    ], { color: 0xffffff, opacity: 0.5 });
    // One anti-aliased batch for both (D-GV GV0.2), which still says which line is which.
    expect(group.children.length).toBe(1);
    expect(group.children[0] instanceof LineSegments2).toBe(true);
    expect(group.children[0].userData.lines.map((l: { id: string }) => l.id)).toEqual(['A', 'B']);
  });

  it('applies disputed filter when showDisputedTerritories=false via service buildBorders', () => {
    const features: any = [
      { id: 'intl1', coordinates: [[0,0],[1,1]], classification: 'international' },
      { id: 'disp1', coordinates: [[2,0],[3,1]], classification: 'disputed' }
    ];
    const cfg: any = { borderVisibility: 80, borderThickness: 1, territoryColors: { opacity: 50, colorScheme: 'default', useCustomColors: false }, showDisputedTerritories: false };
    const group = (nationalTerritoriesService as any).buildBorders(features, cfg);
    // Only international should remain
    expect(batchedLines(group).map((l) => l.id)).toEqual(['intl1']);
  });
});
