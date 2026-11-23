import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { batchedLines, lineBatchData } from '../geometry/lineBatches';
import { territoryBatchData } from '../geometry/territoryBatch';
import { nationalTerritoriesService } from '../services/NationalTerritoriesService';
import { isTerritoryFillMaterial } from '../theme/territoryFillMaterial';
import { TERRITORY_FILL_COLOR } from '../theme/materialTheme';
import { fillColourOf } from '../theme/territoryStyles';
import { latLonToVector3 } from '../utils/latLonToVector3';
import * as countryDirectoryModule from '../utils/countryDirectory';
import * as countryCentroidsModule from '../utils/countryCentroids';

const baseConfig: any = {
  borderVisibility: 80,
  borderThickness: 1,
  territoryColors: { opacity: 40, colorScheme: 'default', useCustomColors: false },
  showDisputedTerritories: true
};

describe('NationalTerritoriesService loading + building', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Several tests below share the same LOD (and thus the same cache keys) with
    // different mocked manifests/parts — without clearing the cache, a later test
    // silently gets the previous test's cached (stale) baked/legacy resolution.
    nationalTerritoriesService.clearCache();
  });

  it('prefers topology for loadBordersLOD and maps arc indices', async () => {
    const topo = {
      quantization: 1,
      arcs: [ [[0,0],[1,1]] ],
      lods: { lod0: { features: [ { id: 1, arcIndices: [0], classification: 'disputed' } ] } }
    };
    (global as any).fetch = vi.fn(async (url: string) => {
      if (url.includes('world-borders.topology')) return new Response(JSON.stringify(topo), { status: 200 });
      return new Response('nf', { status: 404 });
    });
  const features = await nationalTerritoriesService.loadBordersLOD(0) as any[];
  expect(features.length).toBe(1);
  expect(features[0].classification).toBe('disputed');
  });

  it('fetches the border topology once for every level of detail it serves (D-GV GV0.2)', async () => {
    const topo = {
      quantization: 1,
      arcs: [ [[0,0],[1,1]] ],
      lods: {
        lod0: { features: [ { id: 1, arcIndices: [0], classification: 'international' } ] },
        lod1: { features: [ { id: 2, arcIndices: [0], classification: 'international' } ] },
        lod2: { features: [ { id: 3, arcIndices: [0], classification: 'international' } ] },
      },
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('world-borders.topology')) return new Response(JSON.stringify(topo), { status: 200 });
      return new Response('nf', { status: 404 });
    });
    (global as any).fetch = fetchMock;
    const levels = await Promise.all([0, 1, 2, 1, 0].map((lod) => nationalTerritoriesService.loadBordersLOD(lod as 0 | 1 | 2)));
    expect(levels.map((f) => (f as any[])[0].id)).toEqual(['1', '2', '3', '2', '1']);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('world-borders.topology'))).toHaveLength(1);
  });

  it('reads the shipped topology, whose levels are lists, for every level (D-GV GV0.2)', async () => {
    // The bake writes each level as the list itself; reading `.features` of it threw, and every level fell back.
    const fs = await import('node:fs');
    const shipped = fs.readFileSync('public/geopolitical/topology/world-borders.topology.json', 'utf8');
    const fetchMock = vi.fn(async (url: string) => url.includes('world-borders.topology')
      ? new Response(shipped, { status: 200 })
      : new Response('a fallback was asked for', { status: 500 }));
    (global as any).fetch = fetchMock;
    for (const lod of [0, 1, 2] as const) {
      const features = await nationalTerritoriesService.loadBordersLOD(lod) as any[];
      expect(features.length).toBe(364);
      expect(features.every((f) => f.coordinates.length >= 2)).toBe(true);
    }
    expect(fetchMock.mock.calls.map(([url]) => String(url)).every((url) => url.includes('world-borders.topology'))).toBe(true);
  });

  it('asks for the topology again after a failed read', async () => {
    const topo = { quantization: 1, arcs: [ [[0,0],[1,1]] ], lods: { lod0: { features: [ { id: 1, arcIndices: [0] } ] } } };
    let fail = true;
    (global as any).fetch = vi.fn(async (url: string) => {
      if (url.includes('world-borders.topology')) return fail ? new Response('down', { status: 503 }) : new Response(JSON.stringify(topo), { status: 200 });
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    });
    await nationalTerritoriesService.loadBordersLOD(0);
    nationalTerritoriesService.clearCache();
    fail = false;
    // The cache of levels is cleared above; the failed topology read was never kept in the first place.
    const features = await nationalTerritoriesService.loadBordersLOD(0) as any[];
    expect(features[0].id).toBe('1');
  });

  it('falls back to normalized when topology missing', async () => {
    const normalized = { features: [ { id: 'x', coordinates: [[0,0],[10,5]], classification: 'line_of_control' } ] };
    (global as any).fetch = vi.fn(async (url: string) => {
      if (url.includes('topology')) return new Response('nf', { status: 404 });
      if (url.includes('normalized')) return new Response(JSON.stringify(normalized), { status: 200 });
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    });
  const features = await nationalTerritoriesService.loadBordersLOD(1) as any[];
  expect(features[0].classification).toBe('line_of_control');
  });

  it('falls back to raw borders when both topology & normalized missing', async () => {
    const rawGeo = { features: [ { id: 'A', properties: { FEATURECLA: 'Indefinite' }, geometry: { type: 'LineString', coordinates: [[0,0],[1,1]] } } ] } as any;
    (global as any).fetch = vi.fn(async (url: string) => {
      if (url.includes('topology')) return new Response('nf', { status: 404 });
      if (url.includes('normalized')) return new Response('nf', { status: 404 });
      if (url.includes('world-borders-lod2')) return new Response(JSON.stringify(rawGeo), { status: 200 });
      return new Response('nf', { status: 404 });
    });
  const features = await nationalTerritoriesService.loadBordersLOD(2) as any[];
  expect(features[0].classification).toBe('indefinite');
  });

  it('buildBorders filters disputed set when showDisputedTerritories=false', () => {
    const features: any = [
      { id: 'i', coordinates: [[0,0],[1,1]], classification: 'international' },
      { id: 'd', coordinates: [[2,0],[3,1]], classification: 'disputed' },
      { id: 'lc', coordinates: [[4,0],[5,1]], classification: 'line_of_control' },
      { id: 'ind', coordinates: [[6,0],[7,1]], classification: 'indefinite' }
    ];
    const g = nationalTerritoriesService.buildBorders(features, { ...baseConfig, showDisputedTerritories: false });
    expect(batchedLines(g).map((l) => l.id)).toEqual(['i']);
  });

  it('builds borders from a normalized file whose feature ids are numbers', async () => {
    // Regression: the normalized loader passed numeric ids through, the border batch
    // handed one to the colour hash, which reads it as a string, and the whole layer
    // failed to build in the running app. Every other test here used string ids.
    const normalized = { features: [
      { id: 1, coordinates: [[0, 0], [10, 5]], classification: 'International' },
      { id: 2, coordinates: [[20, 0], [30, 5]], classification: 'Disputed' }
    ] };
    (global as any).fetch = vi.fn(async (url: string) => {
      if (url.includes('topology')) return new Response('nf', { status: 404 });
      if (url.includes('normalized')) return new Response(JSON.stringify(normalized), { status: 200 });
      return new Response('nf', { status: 404 });
    });
    const features = await nationalTerritoriesService.loadBordersLOD(0);
    expect(features.map((f) => f.id)).toEqual(['1', '2']);
    const g = nationalTerritoriesService.buildBorders(features, baseConfig);
    expect(batchedLines(g).map((l) => l.id)).toEqual(['1', '2']);
  });

  it('buildBorders draws disputed borders in a dashed batch above a solid one for international', () => {
    const features: any = [
      { id: 'i', coordinates: [[0, 0], [1, 1]], classification: 'international' },
      { id: 'd', coordinates: [[2, 0], [3, 1]], classification: 'disputed' }
    ];
    const g = nationalTerritoriesService.buildBorders(features, baseConfig);

    const batchOf = (id: string) => g.children.find((c) => lineBatchData(c)?.lines.some((l) => l.id === id)) as THREE.Mesh;
    const international = batchOf('i');
    const disputed = batchOf('d');
    expect(international).not.toBe(disputed);
    expect(international.material).toBeInstanceOf(LineMaterial);
    expect((international.material as LineMaterial).dashed).toBe(false);
    expect((disputed.material as LineMaterial).dashed).toBe(true);
    expect((disputed.material as LineMaterial).depthWrite).toBe(false);
    expect(disputed.renderOrder).toBeGreaterThan(international.renderOrder);
    expect(lineBatchData(disputed)!.lines[0].classification).toBe('disputed');
  });

  it('buildTerritories batches every polygon part, including a MultiPolygon split, into one mesh', async () => {
    const geo = { features: [
      { id: 'T1', geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] } },
      { id: 'T2', geometry: { type: 'MultiPolygon', coordinates: [
        [[[2,0],[3,0],[3,1],[2,1],[2,0]]],
        [[[4,0],[5,0],[5,1],[4,1],[4,0]]]
      ] } }
    ] };
    (global as any).fetch = vi.fn(async (url: string) => new Response(JSON.stringify(geo), { status: 200 }));
    const terr = await nationalTerritoriesService.loadTerritories();
    expect(terr.length).toBe(3); // 1 + 2 from multipolygon
    const group = nationalTerritoriesService.buildTerritories(terr, baseConfig);
    expect(group.children.length).toBe(1);
    expect(group.children[0]).toBeInstanceOf(THREE.Mesh);
    expect(territoryBatchData(group.children[0])!.parts).toHaveLength(3);
  });

  describe('country info userData', () => {
    it('buildTerritoriesFromBaked carries countryCode and name for the info panel', () => {
      const parts: any = [{
        id: 'RUS:1-0',
        countryCode: 'RUS',
        name: 'Russia',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
        qa: { maxEdgeToMedianEdgeRatio: 5, minTriangleArea: 0.01, status: 'pass' }
      }];
      const group = nationalTerritoriesService.buildTerritoriesFromBaked(parts, baseConfig);
      const [part] = territoryBatchData(group.children[0])!.parts;
      expect(part.countryCode).toBe('RUS');
      expect(part.name).toBe('Russia');
    });

    it('buildTerritories (legacy) carries a clean countryCode stripped of any :part suffix', async () => {
      const geo = { features: [
        { id: 'T2', geometry: { type: 'MultiPolygon', coordinates: [
          [[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]],
          [[[4, 0], [5, 0], [5, 1], [4, 1], [4, 0]]]
        ] } }
      ] };
      (global as any).fetch = vi.fn(async () => new Response(JSON.stringify(geo), { status: 200 }));
      const terr = await nationalTerritoriesService.loadTerritories();
      const group = nationalTerritoriesService.buildTerritories(terr, baseConfig);
      const parts = territoryBatchData(group.children[0])!.parts;
      expect(parts).toHaveLength(2);
      parts.forEach((part) => expect(part.countryCode).toBe('T2'));
    });

    it('buildTerritories (legacy) also carries a name when the source feature has one — regression: this path used to set only countryCode, silently degrading the hover/select popup to an ISO3 code for any country resolved via the legacy fallback', async () => {
      const geo = { features: [
        {
          id: 'T3',
          properties: { ADM0_A3: 'ZWE', NAME: 'Zimbabwe' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
        },
        {
          id: 'T4',
          properties: { ADM0_A3: 'XYZ' }, // no NAME property at all
          geometry: { type: 'Polygon', coordinates: [[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]] }
        }
      ] };
      (global as any).fetch = vi.fn(async () => new Response(JSON.stringify(geo), { status: 200 }));
      const terr = await nationalTerritoriesService.loadTerritories();
      const group = nationalTerritoriesService.buildTerritories(terr, baseConfig);

      const parts = territoryBatchData(group.children[0])!.parts;
      expect(parts.find((p) => p.countryCode === 'ZWE')!.name).toBe('Zimbabwe');
      expect(parts.find((p) => p.countryCode === 'XYZ')!.name).toBeUndefined();
    });
  });

  // The fallback used to be hardcoded to a single part ID (RUS:1-0, from
  // Russia's pre-CDT-fix baked mesh). It's now keyed on qa.failureReason
  // === 'ratio', so any country's part can trigger it. These four tests
  // (fires on ANY id, not just Russia's old id; does NOT fire for a
  // non-ratio failure reason; does NOT fire when nothing failed) prove that
  // generality directly, rather than just no longer referencing 'RUS:1-0'.
  function bakedFixture(opts: { packageId: string; topologyHash: string; partId: string; countryCode: string; qa: Record<string, unknown> }) {
    return {
      manifest: {
        version: 'territories-bake-v1',
        packageId: opts.packageId,
        topology: { topologyGraphHash: opts.topologyHash },
        lods: { '2': { parts: 1 } }
      },
      mesh: {
        contract: {
          manifestVersion: 'territories-bake-v1',
          packageId: opts.packageId,
          topologyGraphHash: opts.topologyHash
        },
        parts: [
          {
            id: opts.partId,
            countryCode: opts.countryCode,
            positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            indices: [0, 1, 2],
            qa: opts.qa
          }
        ]
      }
    };
  }

  const legacyTerritories = {
    features: [
      {
        id: 'LEGACY',
        properties: { ADM0_A3: 'LEG', NAME: 'Legacy Land' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        }
      }
    ]
  };

  it('falls back to legacy territories when a baked part not named Russia has a ratio-based QA failure', async () => {
    const fixture = bakedFixture({
      packageId: 'pkg-1',
      topologyHash: 'hash-1',
      partId: 'CHL:0-0',
      countryCode: 'CHL',
      qa: { maxEdgeToMedianEdgeRatio: 76.4467, minTriangleArea: 0.001, status: 'fail', failureReason: 'ratio' }
    });

    (global as any).fetch = vi.fn(async (url: string) => {
      if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(fixture.manifest), { status: 200 });
      if (url.includes('/territories-baked/lod2/parts-mesh.json')) return new Response(JSON.stringify(fixture.mesh), { status: 200 });
      if (url.includes('/world-territories-lod2.geojson')) return new Response(JSON.stringify(legacyTerritories), { status: 200 });
      return new Response('nf', { status: 404 });
    });

    const result = await nationalTerritoriesService.loadTerritoriesLODResolved(2);
    expect(result.kind).toBe('legacy');
    if (result.kind === 'legacy') {
      expect(result.features.length).toBe(1);
      expect(result.features[0].id).toContain('LEG');
    }
  });

  it('does NOT fall back for a non-ratio QA failure (e.g. minTriangleArea) — the runtime path can\'t fix that', async () => {
    const fixture = bakedFixture({
      packageId: 'pkg-2',
      topologyHash: 'hash-2',
      partId: 'CHL:0-0',
      countryCode: 'CHL',
      qa: { maxEdgeToMedianEdgeRatio: 5, minTriangleArea: 1e-9, status: 'fail', failureReason: 'area' }
    });

    (global as any).fetch = vi.fn(async (url: string) => {
      if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(fixture.manifest), { status: 200 });
      if (url.includes('/territories-baked/lod2/parts-mesh.json')) return new Response(JSON.stringify(fixture.mesh), { status: 200 });
      if (url.includes('/world-territories-lod2.geojson')) return new Response('should-not-use-legacy', { status: 500 });
      return new Response('nf', { status: 404 });
    });

    const result = await nationalTerritoriesService.loadTerritoriesLODResolved(2);
    expect(result.kind).toBe('baked');
    if (result.kind === 'baked') {
      expect(result.parts[0].id).toBe('CHL:0-0');
    }
  });

  it('uses baked territories when no part has a ratio-based QA failure', async () => {
    const fixture = bakedFixture({
      packageId: 'pkg-3',
      topologyHash: 'hash-3',
      partId: 'RUS:1-0',
      countryCode: 'RUS',
      qa: { maxEdgeToMedianEdgeRatio: 15, minTriangleArea: 0.001, status: 'pass' }
    });

    (global as any).fetch = vi.fn(async (url: string) => {
      if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(fixture.manifest), { status: 200 });
      if (url.includes('/territories-baked/lod2/parts-mesh.json')) return new Response(JSON.stringify(fixture.mesh), { status: 200 });
      if (url.includes('/world-territories-lod2.geojson')) return new Response('should-not-use-legacy', { status: 500 });
      return new Response('nf', { status: 404 });
    });

    const result = await nationalTerritoriesService.loadTerritoriesLODResolved(2);
    expect(result.kind).toBe('baked');
    if (result.kind === 'baked') {
      expect(result.parts.length).toBe(1);
      expect(result.parts[0].id).toBe('RUS:1-0');
    }
  });

  describe('territory fill material wiring', () => {
    afterEach(() => {
      window.history.pushState({}, '', '/');
    });

    const bakedParts = (): any[] => [
      {
        id: 'AAA:0-0',
        countryCode: 'AAA',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
        qa: { maxEdgeToMedianEdgeRatio: 5, minTriangleArea: 0.01, status: 'pass' }
      },
      {
        id: 'BBB:0-0',
        countryCode: 'BBB',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
        qa: { maxEdgeToMedianEdgeRatio: 25, minTriangleArea: 0.01, status: 'warn' }
      }
    ];

    it('buildTerritoriesFromBaked attaches the territory fill material, not MeshBasicMaterial', () => {
      const group = nationalTerritoriesService.buildTerritoriesFromBaked(bakedParts(), baseConfig);
      const mesh = group.children[0] as THREE.Mesh;
      expect(mesh.material).not.toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(isTerritoryFillMaterial(mesh.material)).toBe(true);
    });

    it('buildTerritories (legacy path) also attaches the territory fill material to every child mesh', async () => {
      const geo = { features: [
        { id: 'T1', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } }
      ] };
      (global as any).fetch = vi.fn(async () => new Response(JSON.stringify(geo), { status: 200 }));
      const terr = await nationalTerritoriesService.loadTerritories();
      const group = nationalTerritoriesService.buildTerritories(terr, baseConfig);
      group.children.forEach((child) => {
        expect(isTerritoryFillMaterial((child as THREE.Mesh).material)).toBe(true);
      });
    });

    /*
     * This once asserted that different colour schemes gave the same country
     * different fills: a hash of the id into a palette, which encoded nothing
     * (gone 2026-09-19, decision D-F). Then it pinned one quiet tone on every
     * vertex. Since K5 each part carries its territory's Classic colour, no two
     * neighbours alike, and Quiet's one tone is the material's, switched by a
     * uniform so a card can be drawn in another style than the screen's.
     */
    it('gives each part its territory\'s Classic colour, and the material Quiet\'s one tone', () => {
      const group = nationalTerritoriesService.buildTerritoriesFromBaked(bakedParts(), baseConfig);
      const mesh = group.children[0] as THREE.Mesh;
      const colors = mesh.geometry.getAttribute('aBaseColor');
      const parts = territoryBatchData(mesh)!.parts;

      expect(parts.length).toBeGreaterThan(1);
      for (const part of parts) {
        const expected = new THREE.Color(fillColourOf('classic', part.countryCode));
        const v = part.vertexStart;
        expect([colors.getX(v), colors.getY(v), colors.getZ(v)])
          .toEqual([expected.r, expected.g, expected.b].map((c) => expect.closeTo(c, 5)));
      }
      const material = mesh.material as THREE.ShaderMaterial;
      expect((material.uniforms.uBaseColor.value as THREE.Color).getHex()).toBe(TERRITORY_FILL_COLOR);
    });

    it('draws every part in the quiet tone where the style is Quiet, and each in its own where it is Classic', () => {
      const oneColour = (style: 'classic' | 'quiet') => {
        const group = nationalTerritoriesService.buildTerritoriesFromBaked(bakedParts(), { ...baseConfig, style });
        return ((group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uOneColour.value;
      };
      expect(oneColour('quiet')).toBe(1);
      expect(oneColour('classic')).toBe(0);
    });

    // A part's QA tint rides on its vertices too: [r, g, b, strength].
    const tintStrengthOfPart = (group: THREE.Group, index: number) => {
      const mesh = group.children[0] as THREE.Mesh;
      const part = territoryBatchData(mesh)!.parts[index];
      return mesh.geometry.getAttribute('aQaTint').getW(part.vertexStart);
    };

    it('applies a QA tint when ?geoQaOverlay=1 is present and the part has a warn/fail status', () => {
      window.history.pushState({}, '', '/?geoQaOverlay=1');
      const group = nationalTerritoriesService.buildTerritoriesFromBaked(bakedParts(), baseConfig);
      expect(tintStrengthOfPart(group, 0)).toBe(0); // AAA, status pass
      expect(tintStrengthOfPart(group, 1)).toBeGreaterThan(0); // BBB, status warn
    });

    it('does NOT apply a QA tint when the ?geoQaOverlay flag is absent, even for a warn/fail part', () => {
      const group = nationalTerritoriesService.buildTerritoriesFromBaked(bakedParts(), baseConfig);
      expect(tintStrengthOfPart(group, 1)).toBe(0);
    });

    it('draws every part with one material that reads per-part state from its batch\'s texture', () => {
      const group = nationalTerritoriesService.buildTerritoriesFromBaked(bakedParts(), baseConfig);
      const mesh = group.children[0] as THREE.Mesh;
      const material = mesh.material as THREE.ShaderMaterial;
      expect(group.children).toHaveLength(1);
      expect(material.defines.TERRITORY_PARTS).toBeDefined();
      expect(material.uniforms.uPartState.value).toBe(territoryBatchData(mesh)!.motion.texture);
    });

    it('frees the state texture when the batch\'s geometry is disposed', () => {
      const group = nationalTerritoriesService.buildTerritoriesFromBaked(bakedParts(), baseConfig);
      const mesh = group.children[0] as THREE.Mesh;
      let disposed = false;
      territoryBatchData(mesh)!.motion.texture.addEventListener('dispose', () => { disposed = true; });
      mesh.geometry.dispose();
      expect(disposed).toBe(true);
    });
  });

  describe('getCountryCentroids', () => {
    function bakedPoint(lat: number, lon: number): number[] {
      const v = latLonToVector3(lat, lon, { radius: 100, elevation: 0.5, invertX: false });
      return [v.x, v.y, -v.z];
    }

    function lod0Fixture() {
      return {
        manifest: {
          version: 'territories-bake-v1',
          packageId: 'centroid-pkg',
          topology: { topologyGraphHash: 'centroid-hash' },
          lods: { '0': { parts: 1 } }
        },
        mesh: {
          contract: { manifestVersion: 'territories-bake-v1', packageId: 'centroid-pkg', topologyGraphHash: 'centroid-hash' },
          parts: [
            {
              id: 'ZZZ:0-0',
              countryCode: 'ZZZ',
              positions: [
                ...bakedPoint(10.1, 20), ...bakedPoint(9.9, 19.9), ...bakedPoint(9.9, 20.1)
              ],
              indices: [0, 1, 2],
              qa: { maxEdgeToMedianEdgeRatio: 5, minTriangleArea: 0.01, status: 'pass' }
            }
          ]
        }
      };
    }

    it('resolves a country centroid from LOD0 baked geometry', async () => {
      const fixture = lod0Fixture();
      (global as any).fetch = vi.fn(async (url: string) => {
        if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(fixture.manifest), { status: 200 });
        if (url.includes('/territories-baked/lod0/parts-mesh.json')) return new Response(JSON.stringify(fixture.mesh), { status: 200 });
        return new Response('nf', { status: 404 });
      });

      const centroids = await nationalTerritoriesService.getCountryCentroids();
      const zzz = centroids.get('ZZZ');
      expect(zzz).toBeDefined();
      expect(zzz!.lat).toBeCloseTo(10, 0);
      expect(zzz!.lng).toBeCloseTo(20, 0);
    });

    it('memoizes — a second call does not re-fetch', async () => {
      const fixture = lod0Fixture();
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(fixture.manifest), { status: 200 });
        if (url.includes('/territories-baked/lod0/parts-mesh.json')) return new Response(JSON.stringify(fixture.mesh), { status: 200 });
        return new Response('nf', { status: 404 });
      });
      (global as any).fetch = fetchMock;

      await nationalTerritoriesService.getCountryCentroids();
      const callCountAfterFirst = fetchMock.mock.calls.length;
      await nationalTerritoriesService.getCountryCentroids();
      expect(fetchMock.mock.calls.length).toBe(callCountAfterFirst);
    });

    it('clearCache() forces recomputation on the next call', async () => {
      const fixture = lod0Fixture();
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(fixture.manifest), { status: 200 });
        if (url.includes('/territories-baked/lod0/parts-mesh.json')) return new Response(JSON.stringify(fixture.mesh), { status: 200 });
        return new Response('nf', { status: 404 });
      });
      (global as any).fetch = fetchMock;

      await nationalTerritoriesService.getCountryCentroids();
      const callCountAfterFirst = fetchMock.mock.calls.length;
      nationalTerritoriesService.clearCache();
      await nationalTerritoriesService.getCountryCentroids();
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
    });

    it('resolves an empty map when no baked LOD0 data is available', async () => {
      (global as any).fetch = vi.fn(async () => new Response('nf', { status: 404 }));
      const centroids = await nationalTerritoriesService.getCountryCentroids();
      expect(centroids.size).toBe(0);
    });

    it('excludes a QA-status "fail" part from centroid computation, but still includes a "warn" part', async () => {
      const manifest = {
        version: 'territories-bake-v1',
        packageId: 'centroid-pkg-qa',
        topology: { topologyGraphHash: 'centroid-hash-qa' },
        lods: { '0': { parts: 2 } }
      };
      const mesh = {
        contract: { manifestVersion: 'territories-bake-v1', packageId: 'centroid-pkg-qa', topologyGraphHash: 'centroid-hash-qa' },
        parts: [
          {
            id: 'BAD:0-0',
            countryCode: 'BAD',
            positions: [...bakedPoint(10.1, 20), ...bakedPoint(9.9, 19.9), ...bakedPoint(9.9, 20.1)],
            indices: [0, 1, 2],
            qa: { maxEdgeToMedianEdgeRatio: 999, minTriangleArea: 1e-9, status: 'fail' }
          },
          {
            id: 'WRN:0-0',
            countryCode: 'WRN',
            positions: [...bakedPoint(-10.1, -20), ...bakedPoint(-9.9, -19.9), ...bakedPoint(-9.9, -20.1)],
            indices: [0, 1, 2],
            qa: { maxEdgeToMedianEdgeRatio: 15, minTriangleArea: 0.01, status: 'warn' }
          }
        ]
      };
      (global as any).fetch = vi.fn(async (url: string) => {
        if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(manifest), { status: 200 });
        if (url.includes('/territories-baked/lod0/parts-mesh.json')) return new Response(JSON.stringify(mesh), { status: 200 });
        return new Response('nf', { status: 404 });
      });

      const centroids = await nationalTerritoriesService.getCountryCentroids();
      expect(centroids.has('BAD')).toBe(false);
      expect(centroids.has('WRN')).toBe(true);
    });
  });

  describe('concurrent request deduplication', () => {
    function bakedPoint(lat: number, lon: number): number[] {
      const v = latLonToVector3(lat, lon, { radius: 100, elevation: 0.5, invertX: false });
      return [v.x, v.y, -v.z];
    }

    it('three concurrent callers reaching the same LOD0 baked data only hit the network once each', async () => {
      const manifest = {
        version: 'territories-bake-v1',
        packageId: 'concurrent-pkg',
        topology: { topologyGraphHash: 'concurrent-hash' },
        lods: { '0': { parts: 1 } }
      };
      const mesh = {
        contract: { manifestVersion: 'territories-bake-v1', packageId: 'concurrent-pkg', topologyGraphHash: 'concurrent-hash' },
        parts: [
          {
            id: 'CCC:0-0',
            countryCode: 'CCC',
            positions: [...bakedPoint(10.1, 20), ...bakedPoint(9.9, 19.9), ...bakedPoint(9.9, 20.1)],
            indices: [0, 1, 2],
            qa: { maxEdgeToMedianEdgeRatio: 5, minTriangleArea: 0.01, status: 'pass' }
          }
        ]
      };
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(manifest), { status: 200 });
        if (url.includes('/territories-baked/lod0/parts-mesh.json')) return new Response(JSON.stringify(mesh), { status: 200 });
        return new Response('nf', { status: 404 });
      });
      (global as any).fetch = fetchMock;

      // Mirrors the real reachable race: useResourceZones3D calls
      // loadTerritoriesLODResolved(0) directly, while useDiplomaticEvents3D
      // and GlobalHeader call getCountryCentroids()/getCountryDirectory() —
      // all three can land in the same tick on GeoPolitical mode's initial
      // load, before any of them has populated the shared cache.
      await Promise.all([
        nationalTerritoriesService.getCountryCentroids(),
        nationalTerritoriesService.getCountryDirectory(),
        nationalTerritoriesService.loadTerritoriesLODResolved(0)
      ]);

      const manifestCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/territories-baked/manifest.json'));
      const meshCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/territories-baked/lod0/parts-mesh.json'));
      expect(manifestCalls.length).toBe(1);
      expect(meshCalls.length).toBe(1);
    });
  });

  describe('getCountryDirectory', () => {
    function bakedPoint(lat: number, lon: number): number[] {
      const v = latLonToVector3(lat, lon, { radius: 100, elevation: 0.5, invertX: false });
      return [v.x, v.y, -v.z];
    }

    function lod0Fixture() {
      return {
        manifest: {
          version: 'territories-bake-v1',
          packageId: 'directory-pkg',
          topology: { topologyGraphHash: 'directory-hash' },
          lods: { '0': { parts: 2 } }
        },
        mesh: {
          contract: { manifestVersion: 'territories-bake-v1', packageId: 'directory-pkg', topologyGraphHash: 'directory-hash' },
          parts: [
            {
              id: 'ZZZ:0-0',
              countryCode: 'ZZZ',
              name: 'Zeeland',
              positions: [...bakedPoint(10.1, 20), ...bakedPoint(9.9, 19.9), ...bakedPoint(9.9, 20.1)],
              indices: [0, 1, 2],
              qa: { maxEdgeToMedianEdgeRatio: 5, minTriangleArea: 0.01, status: 'pass' }
            },
            {
              id: 'AAA:0-0',
              countryCode: 'AAA',
              name: 'Aland',
              positions: [...bakedPoint(-5, -30), ...bakedPoint(-5.1, -30.1), ...bakedPoint(-4.9, -29.9)],
              indices: [0, 1, 2],
              qa: { maxEdgeToMedianEdgeRatio: 5, minTriangleArea: 0.01, status: 'pass' }
            }
          ]
        }
      };
    }

    it('resolves a name-sorted directory from LOD0 baked geometry', async () => {
      const fixture = lod0Fixture();
      (global as any).fetch = vi.fn(async (url: string) => {
        if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(fixture.manifest), { status: 200 });
        if (url.includes('/territories-baked/lod0/parts-mesh.json')) return new Response(JSON.stringify(fixture.mesh), { status: 200 });
        return new Response('nf', { status: 404 });
      });

      const directory = await nationalTerritoriesService.getCountryDirectory();
      expect(directory.map((e) => e.name)).toEqual(['Aland', 'Zeeland']);
      const zzz = directory.find((e) => e.countryCode === 'ZZZ');
      expect(zzz).toBeDefined();
      expect(zzz!.lat).toBeCloseTo(10, 0);
      expect(zzz!.lng).toBeCloseTo(20, 0);
    });

    it('memoizes — a second call does not recompute the directory', async () => {
      // fetch-call-count alone can't distinguish this: tryLoadBakedTerritoriesLOD
      // has its own lower-level cache keyed on the parts-mesh URL, so a second
      // fetch is already suppressed regardless of whether getCountryDirectory's
      // own countryDirectoryCache field does anything. Spy on
      // combineCentroidsAndNames itself — the function getCountryDirectory
      // actually calls to assemble its result — to exercise that field directly.
      const fixture = lod0Fixture();
      (global as any).fetch = vi.fn(async (url: string) => {
        if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(fixture.manifest), { status: 200 });
        if (url.includes('/territories-baked/lod0/parts-mesh.json')) return new Response(JSON.stringify(fixture.mesh), { status: 200 });
        return new Response('nf', { status: 404 });
      });
      const combineSpy = vi.spyOn(countryDirectoryModule, 'combineCentroidsAndNames');

      await nationalTerritoriesService.getCountryDirectory();
      expect(combineSpy).toHaveBeenCalledTimes(1);
      await nationalTerritoriesService.getCountryDirectory();
      expect(combineSpy).toHaveBeenCalledTimes(1);
    });

    it('reuses getCountryCentroids()\'s memoized map instead of recomputing centroids a second time (optimization: both are called independently in the same session by Piece 4/5 and GlobalHeader)', async () => {
      const fixture = lod0Fixture();
      (global as any).fetch = vi.fn(async (url: string) => {
        if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(fixture.manifest), { status: 200 });
        if (url.includes('/territories-baked/lod0/parts-mesh.json')) return new Response(JSON.stringify(fixture.mesh), { status: 200 });
        return new Response('nf', { status: 404 });
      });
      const computeSpy = vi.spyOn(countryCentroidsModule, 'computeCountryCentroids');

      // Before this optimization, getCountryDirectory() called
      // buildCountryDirectory(), which ran computeCountryCentroids() a SECOND
      // time internally — this proves it now runs exactly once total across
      // both calls, regardless of which is called first.
      await nationalTerritoriesService.getCountryCentroids();
      await nationalTerritoriesService.getCountryDirectory();
      expect(computeSpy).toHaveBeenCalledTimes(1);
    });

    it('clearCache() forces recomputation on the next call', async () => {
      const fixture = lod0Fixture();
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(fixture.manifest), { status: 200 });
        if (url.includes('/territories-baked/lod0/parts-mesh.json')) return new Response(JSON.stringify(fixture.mesh), { status: 200 });
        return new Response('nf', { status: 404 });
      });
      (global as any).fetch = fetchMock;

      await nationalTerritoriesService.getCountryDirectory();
      const callCountAfterFirst = fetchMock.mock.calls.length;
      nationalTerritoriesService.clearCache();
      await nationalTerritoriesService.getCountryDirectory();
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
    });

    it('resolves an empty array when no baked LOD0 data is available', async () => {
      (global as any).fetch = vi.fn(async () => new Response('nf', { status: 404 }));
      const directory = await nationalTerritoriesService.getCountryDirectory();
      expect(directory).toEqual([]);
    });

    it('excludes a QA-status "fail" part from the directory, but still includes a "warn" part', async () => {
      const manifest = {
        version: 'territories-bake-v1',
        packageId: 'directory-pkg-qa',
        topology: { topologyGraphHash: 'directory-hash-qa' },
        lods: { '0': { parts: 2 } }
      };
      const mesh = {
        contract: { manifestVersion: 'territories-bake-v1', packageId: 'directory-pkg-qa', topologyGraphHash: 'directory-hash-qa' },
        parts: [
          {
            id: 'BAD:0-0',
            countryCode: 'BAD',
            name: 'Badland',
            positions: [...bakedPoint(10.1, 20), ...bakedPoint(9.9, 19.9), ...bakedPoint(9.9, 20.1)],
            indices: [0, 1, 2],
            qa: { maxEdgeToMedianEdgeRatio: 999, minTriangleArea: 1e-9, status: 'fail' }
          },
          {
            id: 'WRN:0-0',
            countryCode: 'WRN',
            name: 'Warnland',
            positions: [...bakedPoint(-10.1, -20), ...bakedPoint(-9.9, -19.9), ...bakedPoint(-9.9, -20.1)],
            indices: [0, 1, 2],
            qa: { maxEdgeToMedianEdgeRatio: 15, minTriangleArea: 0.01, status: 'warn' }
          }
        ]
      };
      (global as any).fetch = vi.fn(async (url: string) => {
        if (url.includes('/territories-baked/manifest.json')) return new Response(JSON.stringify(manifest), { status: 200 });
        if (url.includes('/territories-baked/lod0/parts-mesh.json')) return new Response(JSON.stringify(mesh), { status: 200 });
        return new Response('nf', { status: 404 });
      });

      const directory = await nationalTerritoriesService.getCountryDirectory();
      expect(directory.some((e) => e.countryCode === 'BAD')).toBe(false);
      expect(directory.some((e) => e.countryCode === 'WRN')).toBe(true);
    });
  });
});

describe('the topology loader, on a class it cannot read (D-F step 16)', () => {
  beforeEach(() => nationalTerritoriesService.clearCache());

  /*
   * It returned 'international' for anything it did not recognise, while the
   * normalized loader returned 'unknown' — so which of two loaders happened to
   * run decided whether an unreadable boundary was drawn as settled.
   */
  it('calls it unknown, as the normalized loader does, not international', async () => {
    const topo = {
      quantization: 1,
      arcs: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]],
      lods: { lod0: { features: [
        { id: 1, arcIndices: [0], classification: 'SomethingNew' },
        { id: 2, arcIndices: [1], classification: 'International' },
      ] } },
    };
    (global as any).fetch = vi.fn(async (url: string) =>
      url.includes('world-borders.topology') ? new Response(JSON.stringify(topo), { status: 200 }) : new Response('nf', { status: 404 }));

    const features = await nationalTerritoriesService.loadBordersLOD(0) as any[];

    expect(features.map((f) => f.classification)).toEqual(['unknown', 'international']);
  });
});
