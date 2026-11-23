// NationalTerritoriesService: loads and builds border / territory geometry
import * as THREE from 'three';
import { GeometryFactory, LineFeature, PolygonFeature } from '../geometry/geometryFactory';
import { buildBorderLineBatches } from '../geometry/fatBorderLines';
import { createPartMotion, mergeTerritoryParts, type TerritoryBatchData, type TerritoryPartSource } from '../geometry/territoryBatch';
// Corrected path to GeoPoliticalConfig
import { GeoPoliticalConfig } from '../../hooks/useGeoPoliticalSettings';
import { resolveBorderMaterialConfig, borderLineLook, qaStatusTintColor, TERRITORY_FILL_COLOR, BorderClassification, type BakedPartQaStatus } from '../theme/materialTheme';
import { DEFAULT_TERRITORY_STYLE, borderColourOf, fillColourOf } from '../theme/territoryStyles';
import { createTerritoryFillMaterial, setTerritoryMaterialOneColour } from '../theme/territoryFillMaterial';
import { computeCountryCentroids, type CountryCentroid } from '../utils/countryCentroids';
import { BASE_MAP } from '../../components/Globe/globeAltitudes';
import { extractCountryNames, combineCentroidsAndNames, type CountryDirectoryEntry } from '../utils/countryDirectory';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'NationalTerritoriesService' });

export interface WorldBordersData { features: Array<{ id: string; coordinates: [number, number][] }> }
export interface WorldTerritoriesData { features: Array<{ id: string; rings: [number, number][][] }> }

export interface BakedTerritoryPart {
  id: string;
  countryCode?: string;
  name?: string;
  lod?: number;
  positions: number[];
  indices: number[];
  qa?: {
    maxEdgeToMedianEdgeRatio?: number;
    minTriangleArea?: number;
    status?: 'pass' | 'warn' | 'fail';
    failureReason?: 'ratio' | 'area' | 'empty';
  };
}

interface BakedManifestLODEntry {
  parts?: number;
  triangles?: number;
  meshFile?: string;
}

interface BakedManifest {
  version?: string;
  packageId?: string;
  topology?: {
    topologyGraphHash?: string | null;
  } | null;
  lods?: Record<string, BakedManifestLODEntry>;
}

interface BakedMeshPayload {
  lod?: number;
  contract?: {
    manifestVersion?: string;
    packageId?: string;
    topologyGraphHash?: string | null;
  };
  parts?: BakedTerritoryPart[];
}

export type TerritoriesLODLoadResult =
  | { kind: 'baked'; parts: BakedTerritoryPart[] }
  | { kind: 'legacy'; features: PolygonFeature[] };

interface ClassifiedLineFeature extends LineFeature { classification: BorderClassification }
interface MaritimeFeature extends LineFeature { classification: BorderClassification }

const GEOPOLITICAL_LONGITUDE_OFFSET_DEGREES = -90;

function normalizeLongitude(lon: number): number {
  return ((lon + 540) % 360) - 180;
}

function applyLongitudeOffset(lon: number): number {
  return normalizeLongitude(lon + GEOPOLITICAL_LONGITUDE_OFFSET_DEGREES);
}

function offsetLineCoordinates(coords: [number, number][]): [number, number][] {
  return coords.map(([lon, lat]) => [applyLongitudeOffset(lon), lat]);
}

function offsetPolygonRings(rings: [number, number][][]): [number, number][][] {
  return rings.map((ring) => ring.map(([lon, lat]) => [applyLongitudeOffset(lon), lat]));
}

// --- WS1 Normalization Scaffold ---
// Canonical normalization tokens mapped to classification categories
const FEATURE_CLA_MAP: { test: RegExp; value: BorderClassification }[] = [
  { test: /disputed/i, value: 'disputed' },
  { test: /line of control/i, value: 'line_of_control' },
  { test: /indefinite/i, value: 'indefinite' }
];

function normalizeFeatureCla(raw: string | undefined): BorderClassification {
  if (!raw) return 'international';
  for (const rule of FEATURE_CLA_MAP) {
    if (rule.test.test(raw)) return rule.value;
  }
  if (/verify/i.test(raw)) {
    // keep as international but may flag unknown later
    return 'international';
  }
  return 'international';
}

// Perspective recognition value normalization
export type PerspectiveRecognition = 'recognized' | 'unrecognized' | 'verify' | 'admin1' | 'blank';

function normalizePerspectiveValue(v: string | undefined): PerspectiveRecognition {
  if (!v) return 'blank';
  const lc = v.toLowerCase();
  if (lc.includes('international boundary')) return 'recognized';
  if (lc.includes('admin-1')) return 'admin1';
  if (lc.includes('unrecognized')) return 'unrecognized';
  if (lc.includes('verify')) return 'verify';
  return 'blank';
}

export interface RecognitionMatrixEntry {
  featureId: string;
  classification: BorderClassification;
  perspectives: Record<string, PerspectiveRecognition>;
}

type AnyGeoFeature = { id?: string; properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } };
type LineStringGeom = { type: 'LineString'; coordinates: [number, number][] };
type MultiLineStringGeom = { type: 'MultiLineString'; coordinates: [number, number][][] };
type PolygonGeom = { type: 'Polygon'; coordinates: [number, number][][] };
type MultiPolygonGeom = { type: 'MultiPolygon'; coordinates: [number, number][][][] };

function buildRecognitionMatrix(rawFeatures: AnyGeoFeature[]): RecognitionMatrixEntry[] {
  return rawFeatures.map(f => {
    const props = (f.properties || {}) as Record<string, unknown>;
    const classification = normalizeFeatureCla(typeof props.FEATURECLA === 'string' ? props.FEATURECLA : undefined);
    const perspectives: Record<string, PerspectiveRecognition> = {};
    Object.keys(props).forEach(k => {
      if (k.startsWith('FCLASS_')) {
        perspectives[k.substring('FCLASS_'.length)] = normalizePerspectiveValue(typeof props[k] === 'string' ? (props[k] as string) : undefined);
      }
    });
    const id = (typeof props.NE_ID === 'string' && props.NE_ID)
      || (typeof props.BRK_A3 === 'string' && props.BRK_A3)
      || f.id
      || 'border';
    return { featureId: String(id), classification, perspectives };
  });
}
// --- End WS1 Scaffold ---

function isDisputed(classification: BorderClassification) {
  return classification === 'disputed' || classification === 'line_of_control' || classification === 'indefinite';
}

/*
 * The baked territory mesh has its own elevation baked into its vertices: radius 100
 * plus elevation 0.5 (both recorded in each LOD's parts-mesh.json). The group is then
 * scaled to put its surface where the base map belongs.
 *
 * This was a flat 1.03 — the fills stood at 1.035 Earth radii, 223 km up, above the
 * clouds and in front of every marker any layer drew. Because they are depth-tested,
 * the Space Weather, Earth Weather and Eco Disasters layers each loaded their data,
 * drew hundreds of objects and showed a person nothing. See globeAltitudes.ts.
 *
 * The "fill elevation" slider was supposed to be this knob and did nothing on the
 * shipped path: the baked builder ignored it and used the constant. It is live now.
 */
const GLOBE_RADIUS_UNITS = 100;
const BAKED_TERRITORY_RADIUS_UNITS = 100.5;

/** Scale that puts the baked fills `elevationUnits` above the surface. */
export function territoryFillScale(elevationUnits: number | undefined): number {
  const requested = typeof elevationUnits === 'number' && Number.isFinite(elevationUnits)
    ? Math.max(0, elevationUnits)
    : (BASE_MAP - 1) * GLOBE_RADIUS_UNITS;
  return (GLOBE_RADIUS_UNITS + requested) / BAKED_TERRITORY_RADIUS_UNITS;
}
const BAKED_MANIFEST_CACHE_KEY = '__territories_baked_manifest__';

function isProductionRuntime(): boolean {
  try {
    return Boolean(import.meta.env.PROD);
  } catch {
    return false;
  }
}

function allowLegacyTerritoryFallback(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('geoAllowLegacyTerritories') === '1';
  } catch {
    return false;
  }
}

// Dev-only QA-honesty overlay toggle, same convention as ?geoPolyDiag / ?geoIdPicking.
function qaOverlayEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('geoQaOverlay') === '1';
  } catch {
    return false;
  }
}

const QA_OVERLAY_TINT_STRENGTH = 0.45;

/**
 * Every territory part as one mesh (geometry/territoryBatch.ts): one draw call for
 * the globe's fills rather than one per part. Each part carries its territory's
 * Classic colour, and the material Quiet's one tone; which is drawn is a uniform
 * (territoryFillMaterial.ts), set each render by the style drawn
 * (globe-engine/territoryLook.ts). The QA overlay's tint comes from each part's QA
 * status, as it did when each part had its own material.
 */
function buildTerritoryBatchMesh<S extends TerritoryPartSource>(
  sources: S[],
  cfg: GeoPoliticalConfig['nationalTerritories'],
  source: 'baked' | 'legacy'
): THREE.Mesh | null {
  const showQaOverlay = qaOverlayEnabled();
  const { geometry, parts } = mergeTerritoryParts(sources, {
    /*
     * The territory's Classic colour: four colours, no two neighbours alike
     * (territoryColours.ts). Before 2026-09-19 this was schemeColor(scheme, part.id),
     * a hash of the id into a four-colour palette that put neighbours alike and,
     * on two palettes, settled countries in the provisional borders' colours.
     */
    colorOf: (part) => fillColourOf('classic', part.countryCode),
    tintOf: showQaOverlay
      ? (part) => {
          const tint = qaStatusTintColor(part.qa?.status as BakedPartQaStatus | undefined);
          return tint === null ? null : { color: tint, strength: QA_OVERLAY_TINT_STRENGTH };
        }
      : undefined
  });
  if (parts.length === 0) {
    geometry.dispose();
    return null;
  }
  const motion = createPartMotion(parts.length);
  // Every path that disposes the mesh disposes its geometry; the state texture goes with it.
  geometry.addEventListener('dispose', () => motion.texture.dispose());
  const material = createTerritoryFillMaterial({
    baseColorHex: TERRITORY_FILL_COLOR,
    opacity: cfg.territoryColors.opacity / 100,
    side: THREE.DoubleSide,
    usePolygonOffset: cfg.usePolygonOffset ?? true,
    polygonOffsetFactor: cfg.polygonOffsetFactor ?? -1.5,
    polygonOffsetUnits: cfg.polygonOffsetUnits ?? -1.5,
    partState: motion.texture
  });
  setTerritoryMaterialOneColour(material, (cfg.style ?? DEFAULT_TERRITORY_STYLE) === 'quiet' ? TERRITORY_FILL_COLOR : null);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'territories';
  const data: TerritoryBatchData = { parts, motion };
  mesh.userData = { ...data, source };
  return mesh;
}

type TopologyFeature = { id: string | number; arcIndices: number[]; classification?: string };
/** A topology file as the bake writes it: shared arcs, and each level's features as indices into them. */
interface TopologyFile {
  quantization: number;
  arcs?: number[][][];
  lods?: Record<string, TopologyFeature[] | { features: TopologyFeature[] } | undefined>;
}

/**
 * A level's features. The bake writes each level as the list itself; this reader had asked for `.features` of it,
 * threw, and fell back to the normalized files for every level since the topology was made (D-GV GV0.2, found by
 * the share-session smoke). Both shapes are read.
 */
function featuresOfLevel(level: TopologyFeature[] | { features: TopologyFeature[] }): TopologyFeature[] {
  return Array.isArray(level) ? level : level.features;
}

export class NationalTerritoriesService {
  private cache: Map<string, unknown> = new Map();
  private countryCentroidsCache: Map<string, CountryCentroid> | null = null;
  private countryDirectoryCache: CountryDirectoryEntry[] | null = null;
  // In-flight request dedup for the two most contended fetches: three
  // independent callers can all reach these within the same tick on
  // GeoPolitical mode's initial load — useResourceZones3D
  // (loadTerritoriesLODResolved), useDiplomaticEvents3D/getCountryDirectory
  // (getCountryCentroids), and GlobalHeader (getCountryDirectory) — all
  // resolving to the same LOD0 baked mesh URL. Without this, each of the
  // three would see `this.cache.has(url)` as false (the synchronous check
  // races ahead of the others' still-pending `await fetch`) and issue its
  // own redundant ~1MB fetch. Only these two are deduped, not every loader
  // in this class — these are the ones this session's new code actually
  // made concurrently reachable; the rest keep their pre-existing
  // single-caller-at-a-time shape.
  private bakedManifestPromise: Promise<BakedManifest | null> | null = null;
  private bakedTerritoriesLODPromises: Map<number, Promise<BakedTerritoryPart[] | null>> = new Map();

  /**
   * Drops all cached manifests/parts/border features. Real use case: a baked
   * territories package was republished (new manifest/contract) mid-session and
   * stale cached parts need to be forced to re-fetch rather than waiting for a
   * full page reload.
   */
  clearCache(): void {
    this.cache.clear();
    this.countryCentroidsCache = null;
    this.countryDirectoryCache = null;
    this.bakedManifestPromise = null;
    this.bakedTerritoriesLODPromises.clear();
    this.topologyReads.clear();
  }

  // computeCountryCentroids/buildCountryDirectory have no QA-awareness of
  // their own — they'll happily average in a part qa-territories.ts would
  // flag as a mandatory failure (bad triangulation ratio, near-zero area).
  // In practice CI blocks a 'fail'-status part from ever being committed
  // (see geo-qa-gate.yml), but the ratio-based runtime circuit-breaker in
  // tryLoadBakedTerritoriesLOD's caller (loadTerritoriesLODResolved) exists
  // precisely because a bad package CAN still reach production — centroids/
  // directory should degrade the same way (excluding the bad part) rather
  // than silently pulling a country's search/fly-to location toward known-
  // bad geometry. 'warn' parts are left in, matching qa-territories.ts's own
  // distinction: only 'fail' blocks the gate.
  private excludeQaFailingParts(parts: BakedTerritoryPart[]): BakedTerritoryPart[] {
    return parts.filter((part) => part.qa?.status !== 'fail');
  }

  /**
   * One representative lat/lng per country, area-weighted across all of that
   * country's baked parts (see countryCentroids.ts). Feeds country search
   * fly-to and DiplomaticEvents marker/connection placement. Uses LOD0 —
   * the least detailed, cheapest-to-fetch baked tier — since a centroid
   * doesn't benefit from LOD2's extra vertex density, and LOD0 may already
   * be cached from another caller. Memoized: recomputing is pure CPU work
   * over already-fetched data, but there's no reason to redo it every call.
   */
  async getCountryCentroids(): Promise<Map<string, CountryCentroid>> {
    if (this.countryCentroidsCache) return this.countryCentroidsCache;
    const parts = await this.tryLoadBakedTerritoriesLOD(0);
    const centroids = parts ? computeCountryCentroids(this.excludeQaFailingParts(parts)) : new Map<string, CountryCentroid>();
    this.countryCentroidsCache = centroids;
    return centroids;
  }

  /**
   * Flat, name-sorted list of every country with a resolvable centroid —
   * name + lat/lng in one entry, for the country-search bar (GlobalHeader.tsx)
   * to filter and fly to. Same LOD0-fetch-and-memoize shape as
   * getCountryCentroids(); reuses that method's own memoized centroids map
   * (via combineCentroidsAndNames) instead of recomputing the area-weighted
   * average a second time — Piece 4/5 already call getCountryCentroids() in
   * the same session GlobalHeader calls this, so without this reuse every
   * country's centroid math ran twice per session.
   */
  async getCountryDirectory(): Promise<CountryDirectoryEntry[]> {
    if (this.countryDirectoryCache) return this.countryDirectoryCache;
    // Sequenced, not Promise.all: getCountryCentroids() populates the
    // underlying LOD0 fetch cache first, so the tryLoadBakedTerritoriesLOD
    // call below is guaranteed a cache hit rather than racing it into a
    // second concurrent fetch of the same URL.
    const centroids = await this.getCountryCentroids();
    const parts = await this.tryLoadBakedTerritoriesLOD(0);
    const names = parts ? extractCountryNames(this.excludeQaFailingParts(parts)) : new Map<string, string>();
    const directory = combineCentroidsAndNames(centroids, names);
    this.countryDirectoryCache = directory;
    return directory;
  }

  // Runtime circuit-breaker for a baked package that made it to production with
  // a genuine triangulation-quality defect (the bake pipeline's own QA gate was
  // bypassed, or a rebake regressed) — not scoped to any specific country.
  // Deliberately keyed on failureReason === 'ratio' specifically, not any
  // status==='fail': the legacy/runtime path re-triangulates with the exact
  // same algorithm on the exact same source data, so it can only plausibly
  // help for a ratio (triangulation-quality) failure — a part that fails on
  // minTriangleArea or has an empty index buffer would come out identically
  // bad either way, making the fallback a wasted full-LOD rebuild for those.
  private findRatioFailingBakedParts(parts: BakedTerritoryPart[]): BakedTerritoryPart[] {
    return parts.filter((part) => part.qa?.failureReason === 'ratio');
  }

  private borderFileForLOD(lod: 0 | 1 | 2) { return `/geopolitical/world-borders-lod${lod}.geojson`; }
  private normalizedBorderFileForLOD(lod: 0 | 1 | 2) { return `/geopolitical/normalized/world-borders-lod${lod}.normalized.json`; }
  private territoryFileForLOD(lod: 0 | 1 | 2) { return `/geopolitical/world-territories-lod${lod}.geojson`; }
  private bakedManifestFile() { return '/geopolitical/territories-baked/manifest.json'; }
  private bakedTerritoryFileForLOD(lod: 0 | 1 | 2) { return `/geopolitical/territories-baked/lod${lod}/parts-mesh.json`; }
  private topologyFile() { return '/geopolitical/topology/world-borders.topology.json'; }
  private maritimeTopologyFile() { return '/geopolitical/maritime/topology/eez.topology.json'; }

  private async loadBakedManifest(): Promise<BakedManifest | null> {
    if (this.cache.has(BAKED_MANIFEST_CACHE_KEY)) {
      return this.cache.get(BAKED_MANIFEST_CACHE_KEY) as BakedManifest;
    }
    if (this.bakedManifestPromise) return this.bakedManifestPromise;
    this.bakedManifestPromise = (async () => {
      try {
        const res = await fetch(this.bakedManifestFile(), { cache: 'no-cache' });
        if (!res.ok) return null;
        const manifest = await res.json() as BakedManifest;
        if (!manifest || typeof manifest.version !== 'string' || !manifest.version.length) return null;
        if (!manifest.lods || typeof manifest.lods !== 'object') return null;
        this.cache.set(BAKED_MANIFEST_CACHE_KEY, manifest);
        return manifest;
      } catch {
        return null;
      } finally {
        // Cleared unconditionally (not just on failure): once settled, a
        // *new* caller should hit the this.cache.has(...) fast path above
        // on success, or start a fresh attempt on failure — neither should
        // keep piggybacking on this now-resolved promise.
        this.bakedManifestPromise = null;
      }
    })();
    return this.bakedManifestPromise;
  }

  private async tryLoadBakedTerritoriesLOD(lod: 0 | 1 | 2): Promise<BakedTerritoryPart[] | null> {
    const url = this.bakedTerritoryFileForLOD(lod);
    if (this.cache.has(url)) return this.cache.get(url) as BakedTerritoryPart[];
    const inflight = this.bakedTerritoriesLODPromises.get(lod);
    if (inflight) return inflight;

    const promise = (async () => {
      try {
        const manifest = await this.loadBakedManifest();
        if (!manifest) return null;
        const topologyHash = typeof manifest.topology?.topologyGraphHash === 'string'
          ? manifest.topology.topologyGraphHash
          : null;
        const expectedVersion = typeof manifest.version === 'string' ? manifest.version : null;
        const expectedPackageId = typeof manifest.packageId === 'string' ? manifest.packageId : null;

        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) return null;
        const json = await res.json() as BakedMeshPayload;
        if (!json || !Array.isArray(json.parts)) return null;
        // Backward-compatible contract validation:
        // - New format: validate strict contract fields when manifest declares them.
        // - Legacy format: no contract block present; allow as long as parts payload is valid.
        const contract = json.contract;
        if (expectedVersion && contract?.manifestVersion && contract.manifestVersion !== expectedVersion) return null;
        if (expectedPackageId && contract?.packageId && contract.packageId !== expectedPackageId) return null;
        if (topologyHash && contract?.topologyGraphHash && contract.topologyGraphHash !== topologyHash) return null;

        const parts = (json.parts as BakedTerritoryPart[])
          .filter((part) => Array.isArray(part.positions) && Array.isArray(part.indices))
          .filter((part) => part.positions.length >= 9 && part.indices.length >= 3)
          .filter((part) => part.positions.length % 3 === 0 && part.indices.length % 3 === 0);
        if (!parts.length) return null;
        this.cache.set(url, parts);
        return parts;
      } catch {
        return null;
      } finally {
        this.bakedTerritoriesLODPromises.delete(lod);
      }
    })();
    this.bakedTerritoriesLODPromises.set(lod, promise);
    return promise;
  }

  // Attempt to load pre-normalized artifact (WS1). Falls back silently if missing or malformed.
  private async tryLoadNormalizedBorders(lod: 0 | 1 | 2): Promise<ClassifiedLineFeature[] | null> {
    const url = this.normalizedBorderFileForLOD(lod);
    if (this.cache.has(url)) return this.cache.get(url) as ClassifiedLineFeature[];
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json || !Array.isArray(json.features)) return null;
      const mapClass = (c: string | undefined): BorderClassification => {
        switch ((c || '').toLowerCase()) {
          case 'international': return 'international';
          case 'disputed': return 'disputed';
          case 'lineofcontrol':
          case 'line_of_control': return 'line_of_control';
          case 'indefinite': return 'indefinite';
          default: return 'unknown';
        }
      };
  // The normalized files number their features, so the id is made the string the type promises.
  const features: ClassifiedLineFeature[] = json.features.map((f: { id: string | number; coordinates: [number, number][]; classification?: string }) => ({
        id: String(f.id),
        coordinates: f.coordinates,
        classification: mapClass(f.classification)
      }));
      this.cache.set(url, features);
      return features;
    } catch {
      return null;
    }
  }

  /**
   * A topology file, fetched and parsed once a session (D-GV GV0.2). Each level of detail is read from it; each used
   * to fetch the whole file again with `cache: 'no-cache'` (594 KB for the borders), so a level change near a
   * boundary parsed it once per rebuild. The service worker already rechecks it once per build. A failed read is
   * not kept, so the next asks again.
   */
  private topologyReads = new Map<string, Promise<TopologyFile | null>>();
  private topology(url: string): Promise<TopologyFile | null> {
    let read = this.topologyReads.get(url);
    if (!read) {
      read = fetch(url).then((res) => (res.ok ? (res.json() as Promise<TopologyFile>) : null));
      read.then((t) => { if (!t) this.topologyReads.delete(url); }, () => this.topologyReads.delete(url));
      this.topologyReads.set(url, read);
    }
    return read;
  }

  private async tryLoadTopologyLOD(lod: 0|1|2): Promise<ClassifiedLineFeature[] | null> {
    const topoUrl = this.topologyFile();
    const cacheKey = `${topoUrl}::lod${lod}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) as ClassifiedLineFeature[];
    try {
      const topo = await this.topology(topoUrl);
      if (!topo || !topo.lods || !topo.arcs) return null;
      const lodKey = `lod${lod}`;
      const lodData = topo.lods[lodKey];
      if (!lodData) return null;
      const arcs: number[][][] = topo.arcs;
  const features: ClassifiedLineFeature[] = featuresOfLevel(lodData).map((f) => {
        const arcCoords = f.arcIndices.flatMap((ai: number) => arcs[ai]?.map((p: number[]) => {
          const lon = (p[0] / topo.quantization) * 360 - 180;
          const lat = (p[1] / topo.quantization) * 180 - 90;
          return [applyLongitudeOffset(lon), lat] as [number, number];
        }) || []);
        return {
          id: f.id.toString(),
          coordinates: arcCoords,
          classification: ((): BorderClassification => {
            const c = (f.classification || '').toLowerCase();
            if (c === 'international') return 'international';
            if (c === 'disputed') return 'disputed';
            if (c === 'lineofcontrol' || c === 'line_of_control') return 'line_of_control';
            if (c === 'indefinite') return 'indefinite';
            // Unrecognised is UNKNOWN — drawn as unclassified — never settled. This
            // returned 'international', unlike the normalized path's mapClass, so the
            // two loaders disagreed about a class neither could read (D-F step 16).
            return 'unknown';
          })()
        };
      });
      this.cache.set(cacheKey, features);
      return features;
    } catch {
      return null;
    }
  }

  private async tryLoadMaritimeTopologyLOD(lod:0|1|2): Promise<MaritimeFeature[] | null> {
    const topoUrl = this.maritimeTopologyFile();
    const cacheKey = `${topoUrl}::lod${lod}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) as MaritimeFeature[];
    try {
      const topo = await this.topology(topoUrl);
      if (!topo || !topo.lods || !topo.arcs) return null;
      const lodKey = `lod${lod}`;
      const lodData = topo.lods[lodKey];
      if (!lodData) return null;
      const arcs: number[][][] = topo.arcs;
  const features: MaritimeFeature[] = featuresOfLevel(lodData).map((f) => {
        const arcCoords = f.arcIndices.flatMap((ai: number) => arcs[ai]?.map((p: number[]) => {
          const lon = (p[0] / topo.quantization) * 360 - 180;
          const lat = (p[1] / topo.quantization) * 180 - 90;
          return [applyLongitudeOffset(lon), lat] as [number, number];
        }) || []);
        const clsRaw = (f.classification || '').toLowerCase();
        const classification: BorderClassification = clsRaw === 'maritimeoverlap' || clsRaw === 'maritime_overlap' ? 'maritime_overlap' : 'maritime_eez';
        return { id: f.id.toString(), coordinates: arcCoords, classification };
      });
      this.cache.set(cacheKey, features);
      return features;
    } catch { return null; }
  }

  async loadBorders(url = '/geopolitical/world-borders.geojson'): Promise<ClassifiedLineFeature[]> {
    if (this.cache.has(url)) return this.cache.get(url) as ClassifiedLineFeature[];
    const res = await fetch(url);
    const geo = await res.json();
    // Build recognition matrix (cached internally for future analytics)
    const matrix = buildRecognitionMatrix(geo.features || []);
    this.cache.set(`${url}::matrix`, matrix);

    const features: ClassifiedLineFeature[] = (geo.features || [])
      .filter((f: AnyGeoFeature) => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString')
      .flatMap((f: AnyGeoFeature) => {
        const props = (f.properties || {}) as Record<string, unknown>;
        const baseId = (typeof props.BRK_A3 === 'string' && props.BRK_A3) || f.id || 'border';
        const classification = normalizeFeatureCla(typeof props.FEATURECLA === 'string' ? props.FEATURECLA : undefined);
        const build = (coords: [number, number][], idx?: number): ClassifiedLineFeature => ({
          id: idx !== undefined ? `${baseId}:${idx}` : String(baseId),
          coordinates: offsetLineCoordinates(coords),
          classification
        });
        if (f.geometry?.type === 'LineString') {
          const g = f.geometry as LineStringGeom;
          return [build(g.coordinates)];
        }
        if (f.geometry?.type === 'MultiLineString') {
          const g = f.geometry as MultiLineStringGeom;
          return g.coordinates.map((coords, idx) => build(coords, idx));
        }
        return [];
      });
    this.cache.set(url, features);
    return features;
  }

  getRecognitionMatrix(url = '/geopolitical/world-borders.geojson'): RecognitionMatrixEntry[] | undefined {
    return this.cache.get(`${url}::matrix`) as RecognitionMatrixEntry[] | undefined;
  }

  async loadBordersLOD(lod: 0 | 1 | 2): Promise<ClassifiedLineFeature[]> {
    // Prefer topology -> normalized -> raw
    const topo = await this.tryLoadTopologyLOD(lod);
    if (topo) return topo;
    const normalized = await this.tryLoadNormalizedBorders(lod);
    if (normalized) return normalized;
    return this.loadBorders(this.borderFileForLOD(lod));
  }

  async loadTerritories(url = '/geopolitical/world-territories.geojson'): Promise<PolygonFeature[]> {
    if (this.cache.has(url)) return this.cache.get(url) as PolygonFeature[];
    const res = await fetch(url);
    const geo = await res.json();
    const features: PolygonFeature[] = (geo.features || [])
      .filter((f: AnyGeoFeature) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')
      .flatMap((f: AnyGeoFeature) => {
        const props = (f.properties || {}) as Record<string, unknown>;
        const idBase = (typeof props.ADM0_A3 === 'string' && props.ADM0_A3) || f.id || 'territory';
        // The raw source (world-territories.geojson, Natural Earth-derived)
        // carries a NAME property that was previously discarded here — see
        // buildTerritories, which needs it to avoid the legacy runtime-fallback
        // path silently showing only an ISO3 code in the hover/select popup.
        const name = typeof props.NAME === 'string' && props.NAME ? props.NAME : undefined;
        if (f.geometry?.type === 'Polygon') {
          const g = f.geometry as PolygonGeom;
          return [{ id: String(idBase), rings: offsetPolygonRings(g.coordinates), name }];
        }
        if (f.geometry?.type === 'MultiPolygon') {
          const g = f.geometry as MultiPolygonGeom;
          return g.coordinates.map((poly, idx) => ({ id: `${String(idBase)}:${idx}`, rings: offsetPolygonRings(poly), name }));
        }
        return [];
      });
    this.cache.set(url, features);
    return features;
  }

  async loadTerritoriesLOD(lod: 0 | 1 | 2): Promise<PolygonFeature[]> {
    return this.loadTerritories(this.territoryFileForLOD(lod));
  }

  async loadTerritoriesLODResolved(lod: 0 | 1 | 2): Promise<TerritoriesLODLoadResult> {
    const baked = await this.tryLoadBakedTerritoriesLOD(lod);
    let bakedIntegrityFallbackRequired = false;
    if (baked) {
      const ratioFailingParts = this.findRatioFailingBakedParts(baked);
      if (ratioFailingParts.length === 0) {
        return { kind: 'baked', parts: baked };
      }
      bakedIntegrityFallbackRequired = true;
      log.warn('[NationalTerritories] baked integrity fallback engaged (ratio-based triangulation failure detected); using legacy territory source for this LOD', {
        lod,
        partIds: ratioFailingParts.map((part) => part.id)
      });
    }
    if (isProductionRuntime() && !allowLegacyTerritoryFallback() && !bakedIntegrityFallbackRequired) {
      throw new Error('Baked territory artifacts are unavailable or invalid; runtime fallback is disabled in production.');
    }
    const features = await this.loadTerritoriesLOD(lod);
    return { kind: 'legacy', features };
  }

  async loadMaritimeBordersLOD(lod:0|1|2): Promise<MaritimeFeature[] | null> {
    return this.tryLoadMaritimeTopologyLOD(lod);
  }

  buildBorders(features: ClassifiedLineFeature[], cfg: GeoPoliticalConfig['nationalTerritories']): THREE.Group {
    const filtered = cfg.showDisputedTerritories ? features : features.filter(f => !isDisputed(f.classification));
    // One draw call per look, not one per border: see geometry/lineBatches.ts.
    return buildBorderLineBatches(filtered, (f) => {
      const classification = (f.classification || 'international') as BorderClassification;
      const priority = classification === 'disputed' ? 3
        : classification === 'line_of_control' ? 3
        : classification === 'maritime_overlap' ? 2
        : classification === 'maritime_eez' ? 1
        : 0;
      const params = resolveBorderMaterialConfig(cfg, f.id, classification);
      // Base 100, layered within borders. Line materials never write depth.
      // The style's colour (green for a settled border in Classic); recoloured in place when the style drawn changes.
      const color = borderColourOf(cfg.style ?? DEFAULT_TERRITORY_STYLE, classification);
      return { color, classification, look: { ...borderLineLook(params), renderOrder: 100 + priority } };
    }, { radius: 101 });
  }

  buildTerritories(features: PolygonFeature[], cfg: GeoPoliticalConfig['nationalTerritories']): THREE.Group {
    // f.id exactly matches the featureId recovered below from mesh.name (see
    // GeometryFactory.buildTerritoryPolygons's `territory:${f.id}...` naming) —
    // used to restore the name this path previously discarded entirely.
    const namesById = new Map(features.map((f) => [f.id, f.name]));

    // Apply config-driven rendering flags
    const polygons = GeometryFactory.buildTerritoryPolygons(features, {
      radius: 101,
      color: 0x0044ff,
      opacity: cfg.territoryColors.opacity / 100,
      // If user did not specify, let GeometryFactory apply dynamic default (0.5% radius)
      elevation: typeof cfg.fillElevationEpsilon === 'number' ? cfg.fillElevationEpsilon : undefined,
      side: THREE.DoubleSide,
      usePolygonOffset: cfg.usePolygonOffset ?? true,
      polygonOffsetFactor: cfg.polygonOffsetFactor ?? -1.5,
      polygonOffsetUnits: cfg.polygonOffsetUnits ?? -1.5
    });

    // GeometryFactory builds a mesh per polygon part and may hand back geometry
    // its cache (GeometryCacheLRU) still holds. Each part's vertices are copied
    // into the batch instead, so this fallback draws as one mesh like the baked
    // path, and nothing here disposes geometry the cache may reuse. The feature,
    // not the part, picks the colour, as it did per mesh. The clean countryCode
    // and name mirror the baked parts' (id "RUS:1-0", countryCode "RUS", name
    // "Russia"), so hover/select info reads the same whichever source built it.
    const sources: TerritoryPartSource[] = [];
    polygons.children.forEach((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const position = child.geometry.getAttribute('position');
      if (!position) return;
      const featureId = child.name.replace(/^territory:/, '').replace(/:(part\d+|cache)$/, '');
      const index = child.geometry.index;
      sources.push({
        id: featureId,
        countryCode: featureId.split(':')[0],
        name: namesById.get(featureId),
        positions: position.array as ArrayLike<number>,
        indices: index ? index.array : Array.from({ length: position.count }, (_, i) => i)
      });
    });

    const group = new THREE.Group();
    const mesh = buildTerritoryBatchMesh(sources, cfg, 'legacy');
    if (mesh) group.add(mesh);

    const legacyScale = territoryFillScale(cfg.fillElevationEpsilon);
    group.scale.setScalar(legacyScale);
    group.userData = {
      ...(group.userData || {}),
      territoryRadiusScale: legacyScale,
      source: 'legacy'
    };

    return group;
  }

  buildTerritoriesFromBaked(parts: BakedTerritoryPart[], cfg: GeoPoliticalConfig['nationalTerritories']): THREE.Group {
    const group = new THREE.Group();
    const mesh = buildTerritoryBatchMesh(parts, cfg, 'baked');
    if (mesh) group.add(mesh);

    const bakedScale = territoryFillScale(cfg.fillElevationEpsilon);
    group.scale.setScalar(bakedScale);
    group.userData = {
      ...(group.userData || {}),
      territoryRadiusScale: bakedScale,
      source: 'baked'
    };

    return group;
  }

  buildMaritimeBorders(features: MaritimeFeature[], cfg: GeoPoliticalConfig['nationalTerritories']): THREE.Group {
    const group = buildBorderLineBatches(features, (f) => {
      const classification = (f.classification || 'maritime_eez') as BorderClassification;
      const params = resolveBorderMaterialConfig(cfg, f.id || 'maritime', classification);
      const priority = classification === 'maritime_overlap' ? 2 : 1;
      // Maritime base below borders base.
      const color = borderColourOf(cfg.style ?? DEFAULT_TERRITORY_STYLE, classification);
      return { color, classification, look: { ...borderLineLook(params), renderOrder: 98 + priority } };
    }, { radius: 101 });
    group.userData.maritime = true;
    return group;
  }
}

export const nationalTerritoriesService = new NationalTerritoriesService();
