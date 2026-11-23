/**
 * Reports whose subject is a territory, drawn as that territory.
 *
 * A report can name a jurisdiction without carrying a coordinate — a funding
 * pattern across a country, a rule that applies statewide. Until now those
 * were refused at ingest, and the interchange spec records that gap as ours.
 * They are now kept, and this is what shows them.
 *
 * ─── WHY A BOUNDARY AND NOT A PIN ──────────────────────────────────────────
 *
 * The publisher said "this country", not "this point". A pin would answer a
 * question nobody asked and would sit somewhere nothing was reported — the
 * error D-F 17 removed when a polygon stopped standing on its first vertex,
 * and the reason `option C` refuses a case a location of its own.
 *
 * ─── AND WHY NOT A FILL ────────────────────────────────────────────────────
 *
 * A filled country reads as "this whole area is the subject", which is a
 * stronger claim than a jurisdiction tag makes, and at global zoom a few
 * filled countries dominate a map whose other marks are a few pixels wide.
 * The boundary says "this territory is what the report is about" and leaves
 * the interior alone.
 *
 * The one exception is the featured report's territory (BA3), which is filled,
 * faintly, while it is featured: there the card says in words that the report
 * is about the place as a whole, so the fill claims no more than the card, and
 * a featured territory is meant to stand out. It was first lit as a lighter
 * cyan line over its outline, and in the app it could not be found: one pixel
 * wide, the hue of every other outline, under the cloud shell, and on the
 * Cyber-Earth skin cyan on cyan. Lit now reads at a glance on either skin.
 *
 * Drawn in the intel layer's colour but dimmer than a report outline, because
 * a whole country is a much larger mark than a district and would otherwise
 * shout over everything drawn inside it.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import type { TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import type { PolygonGeometry } from '../../../services/geoint/pointInPolygon';
import { GeometryFactory, type LineFeature, type PolygonFeature } from '../../../geopolitical/geometry/geometryFactory';
import { buildBorderLineBatches } from '../../../geopolitical/geometry/fatBorderLines';
import type { LineLook } from '../../../geopolitical/geometry/lineBatches';
import {
  LIT_EDGE_COLOR, LIT_EDGE_ELEVATION, LIT_EDGE_LOOK, LIT_FILL_COLOR, LIT_FILL_ELEVATION, LIT_FILL_OPACITY, ringsOf,
} from '../litTerritory';
import { CLOUDS, SURFACE_LINES } from '../globeAltitudes';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { nostrStarcomIntelIngest } from '../../../services/intel/NostrStarcomIntelIngest';
import { collectGeometryStats } from '../../../utils/threeResourceMetrics';
import { loadUsStates, US_STATE_CODE, type UsStates } from '../../../services/raverWatch/usStates';
import { areaCodeOf } from '../../../features/globe/areas/areaRegistry';
import { loadAreaShapes, type AreaShapes } from '../../../features/globe/areas/areaShapes';
import { getLitArea, markLitAreaDrawn, subscribeLitArea } from '../../../features/globe/areas/litArea';
import {
  featuredTerritoryFor, territoryResolver, territoryShareReports, type TerritoryResolver,
} from '../../../features/globe/capture/territoryReports';
import type { FeaturedReport, ShareReportInfo } from '../../../features/globe/capture/shareReports';
import { territoryGroupIndex } from '../territoryGroups';
import type { ReportGroup } from '../placeMenu';
import { visualizationResourceMonitor } from '../../../services/visualization/VisualizationResourceMonitor';
import { ridesShell } from '../../../globe-engine/shellLift';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const MODE_KEY = 'CyberCommand.IntelReports' as const;
const GLOBE_RADIUS_UNITS = 100;
/*
 * Over the cloud shell, with the lines that follow the surface (BA11).
 *
 * This stood at 0.3, "above the borders at 0.2 so a subject territory reads
 * over the base map". The borders have since moved to 1.2 units and draw at 100
 * and a priority, and the clouds went to 0.4 — so every outline stood under the
 * clouds, veiled wherever there was cloud, and under the borders, which painted
 * over it wherever the two ran together. Drawn after the borders now, and
 * before the lit edge of a featured territory, which goes over it.
 */
const ELEVATION = (SURFACE_LINES - 1) * GLOBE_RADIUS_UNITS;
/**
 * After the borders (100 and a priority up to 3), before a featured territory's
 * lit edge (120). Written as `renderOrder: N`, the shape the screen points'
 * order check reads from source.
 */
const OUTLINE_ORDER = { renderOrder: 110 } as const;
/** The intel layer's cyan, so a subject territory reads as intel and not as a border. */
const COLOR = 0x00d8ff;
/**
 * Brighter than the base borders, not dimmer.
 *
 * This was 0.38, on the reasoning that a whole country is a large mark and
 * should not shout — but the base borders render at 0.85, so the highlight was
 * fainter than the lines it sat on, and a mark nobody can distinguish is not a
 * subtle mark but an absent one.
 *
 * It was raised while chasing a layer that could not be found on the globe, and
 * that was not the whole fault: the marks were also 90° of longitude from the
 * country named (see makeRegionGroup). Both were real, only the second made the
 * layer wrong, and the tests passed throughout — they assert that geometry
 * exists in the scene, not that it is where the report says.
 */
const OPACITY = 0.95;
const toColor = (css: string) => parseInt(css.slice(1), 16);
export interface RegionMarks {
  /** Territories named by at least one report, as drawable boundaries. */
  features: LineFeature[];
  /** Jurisdictions stated that matched no territory — almost always sub-national. */
  unmatched: string[];
}

/**
 * Exported for direct testing: the rendering needs a globe, the selection does
 * not, and the selection is where the judgement is.
 */
export function regionMarksFor(
  reports: readonly IntelReportUI[],
  territories: TerritoryIndex | undefined,
  states?: UsStates,
  areas?: AreaShapes,
): RegionMarks {
  if (!territories && !states && !areas) return { features: [], unmatched: [] };
  // A country from the territory index, a US state from Starcom's own state lines (BA3), an area from its baked shape (BA16).
  const resolve = territoryResolver(territories, states, areas);

  const features: LineFeature[] = [];
  const drawn = new Set<string>();
  const unmatched = new Set<string>();

  for (const report of reports) {
    // Only reports WITHOUT a coordinate. One that has a point is already drawn
    // where it says it is; outlining its whole country as well would restate
    // the same report at a resolution it did not claim.
    if (typeof report.latitude === 'number' && typeof report.longitude === 'number') continue;

    for (const code of report.jurisdictions ?? []) {
      const territory = resolve(code);
      if (!territory) { unmatched.add(code); continue; }
      if (drawn.has(territory.name)) continue;
      drawn.add(territory.name);

      features.push(...ringsOf(territory.geometry, territory.name, 2));
    }
  }

  return { features, unmatched: [...unmatched] };
}

/**
 * Every ring of a territory, as lines: each part's edge and each hole's. A
 * hole is where the territory is not, and an outline without it claims that
 * place too: the European Union drawn round Switzerland, South Africa round
 * Lesotho. A part keeps the id its edge always had; a hole is named after it.
 */
/** The featured report's territories, to light (BA3): each part's edge, and its shape to fill. */
export function featuredRegionFeatures(
  reports: readonly IntelReportUI[],
  featuredId: string | null | undefined,
  resolve: TerritoryResolver,
): { edges: LineFeature[]; fills: PolygonFeature[] } {
  const edges: LineFeature[] = [];
  const fills: PolygonFeature[] = [];
  const report = featuredId ? reports.find((r) => r.id === featuredId) : undefined;
  if (!report || (typeof report.latitude === 'number' && typeof report.longitude === 'number')) return { edges, fills };
  const lit = new Set<string>();
  for (const code of report.jurisdictions ?? []) {
    const territory = resolve(code);
    if (!territory || lit.has(territory.name)) continue;
    lit.add(territory.name);
    const polygons = territory.geometry.type === 'Polygon' ? [territory.geometry.coordinates] : territory.geometry.coordinates;
    polygons.forEach((rings, i) => {
      if (!rings[0] || rings[0].length < 3) return;
      // Ids of the lit fill's own: GeometryFactory caches a fill by id, in the colour it was first built in.
      fills.push({ id: `lit-fill:${territory.name}#${i}`, rings: rings as [number, number][][] });
    });
    edges.push(...ringsOf(territory.geometry, territory.name, 3, 'lit:'));
  }
  return { edges, fills };
}

/** About a territory as a whole: it names one, and has no point of its own. */
const isRegional = (report: IntelReportUI) => (report.jurisdictions?.length ?? 0) > 0 && typeof report.latitude !== 'number';

/**
 * The reports this layer draws, which no other globe surface can see.
 *
 * They carry no coordinate, so reportToMarker returns null for every one of
 * them and they never enter the marker set the rest of the globe reads. Taking
 * them from the marker array — which was the first version of this — draws
 * nothing, forever, while looking correct.
 *
 * From the ingest, what it already holds and then what arrives, and from
 * storage, which keeps what earlier sessions received. Storage alone was how
 * the ones received this session arrived: the live feed misses what the ingest
 * took before the globe subscribed, and storage takes each report it holds one
 * write at a time. Measured on the built app against The Record (BA3): 11 of
 * the 140 listed when the share handle's whenReady answered, all of them some
 * 85 seconds later, while the glyphs had all theirs at once.
 */
export function useRegionSubjectReports(): IntelReportUI[] {
  return useLatestReports(isRegional);
}

/**
 * Every report `keep` accepts, by the same two roads: what the ingest holds and
 * what arrives, and what storage keeps. The Zones' panel reads it for the reports
 * placed in a Sector or naming it. `keep` must be one function for the hook's life.
 */
export function useLatestReports(keep: (report: IntelReportUI) => boolean): IntelReportUI[] {
  const [stored, setStored] = useState<IntelReportUI[]>([]);
  /*
   * The network's latest version of each report the ingest has handed over,
   * which wins over the stored copy. REPLACED on an id match rather than
   * keeping what was there: an addressable note's id is its address, so a peer
   * republishing it — to close a thread, or to retract it — arrives under the
   * same id, and keeping the old one would leave the withdrawn version outlined
   * on the globe. A later version that no longer names a jurisdiction drops out
   * of this layer entirely, which is correct: it no longer claims one. Only
   * whether such a version is regional is kept, not the report.
   */
  const [latest, setLatest] = useState<ReadonlyMap<string, IntelReportUI | null>>(() => new Map());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const all = await intelReportService.listReports();
        if (alive) setStored(all.filter(keep));
      } catch {
        if (alive) setStored([]);
      }
    };
    void load();
    const offStore = intelReportService.onChange(() => void load());
    const held = new Map<string, IntelReportUI | null>();
    nostrStarcomIntelIngest.replayAccepted((report) => { held.set(report.id, keep(report) ? report : null); });
    setLatest(held);
    const offIngest = nostrStarcomIntelIngest.subscribe((report) => {
      setLatest((prev) => new Map(prev).set(report.id, keep(report) ? report : null));
    });
    return () => { alive = false; offStore(); offIngest(); };
  }, [keep]);

  return useMemo(() => {
    const byId = new Map<string, IntelReportUI>();
    for (const report of stored) if (!latest.has(report.id)) byId.set(report.id, report);
    for (const [id, report] of latest) if (report) byId.set(id, report);
    return [...byId.values()];
  }, [stored, latest]);
}

/**
 * Turned into the scene's frame, for the reason useGlobeIntelOutlines gives at
 * length: GeometryFactory builds in the globe mesh's frame, this group hangs
 * off the scene, and three-globe puts -90° about y between them. Without it a
 * subject territory is outlined 90° of longitude from the country named — and
 * because a country outline drawn over the wrong country is still a plausible
 * country outline, this is far harder to notice here than it was for a ring
 * that missed its own pin.
 */
function makeRegionGroup(): THREE.Group {
  const group = ridesShell(new THREE.Group());
  group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
  return group;
}

/**
 * What the layer drew, and what it could not.
 *
 * It returned nothing at all, so the `unmatched` list regionMarksFor has
 * always produced had no consumer — a report whose only stated place was
 * `us-tx` was absent from the globe with no mark, no count and no sentence.
 * A reader could not tell that from nobody having published anything.
 */
export interface RegionMarkState {
  /** Territories drawn. */
  drawn: number;
  /** Jurisdictions named that match no outline here. */
  unmatched: string[];
  /** Each report about a territory this layer places, as the share handle lists it (BA3). */
  reports: ShareReportInfo[];
  /** What a card says of the featured report, when it is one of these. */
  featured: FeaturedReport | null;
  /**
   * The outlined territories containing a point, the smallest first, each with
   * the reports about it: what a click there opens (BA9). Null when none is
   * outlined, or the layer is hidden.
   */
  groupsAt: ((lat: number, lng: number) => ReportGroup[]) | null;
}

export function useGlobeRegionMarks(
  globeRef: React.MutableRefObject<GlobeMethods | undefined>,
  reports: readonly IntelReportUI[],
  territories: TerritoryIndex | undefined,
  visible: boolean,
  featuredId: string | null = null,
): RegionMarkState {
  const groupRef = useRef<THREE.Group>(makeRegionGroup());

  // Starcom's own state lines, loaded only when a report names a US state (BA3), once.
  const [states, setStates] = useState<UsStates | undefined>(undefined);
  const namesAState = useMemo(() => reports.some((r) => (r.jurisdictions ?? []).some((code) => US_STATE_CODE.test(code.trim().toLowerCase()))), [reports]);
  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('IntelReports', groupRef.current);
  useEffect(() => {
    if (!namesAState || states) return;
    let live = true;
    void loadUsStates().then((loaded) => { if (live && loaded) setStates(loaded); });
    return () => { live = false; };
  }, [namesAState, states]);
  // The area lit with no report naming it (BA23, BA24): a card about it while it is made, or a person's search.
  const litArea = useSyncExternalStore(subscribeLitArea, getLitArea, getLitArea);
  // The areas' baked shapes, loaded only when a report names an area (BA16), or one is lit, once.
  const [areas, setAreas] = useState<AreaShapes | undefined>(undefined);
  const namesAnArea = useMemo(
    () => litArea !== null || reports.some((r) => (r.jurisdictions ?? []).some((code) => areaCodeOf(code) !== null)),
    [reports, litArea],
  );
  useEffect(() => {
    if (!namesAnArea || areas) return;
    let live = true;
    void loadAreaShapes().then((loaded) => { if (live && loaded) setAreas(loaded); });
    return () => { live = false; };
  }, [namesAnArea, areas]);
  const resolve = useMemo(() => territoryResolver(territories, states, areas), [territories, states, areas]);

  useEffect(() => {
    if (!globeRef.current) return;
    const globeObj = globeRef.current as unknown as { scene: () => THREE.Scene };
    const scene = globeObj?.scene();
    const group = groupRef.current;
    if (!scene || !group) return;

    const clearGroup = () => {
      group.traverse((obj) => {
        const drawn = obj as THREE.Mesh | THREE.Line;
        if ((drawn as THREE.Mesh).isMesh || (drawn as THREE.Line).isLine) {
          drawn.geometry?.dispose();
          const material = drawn.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose();
        }
      });
      group.clear();
    };

    const teardown = () => {
      clearGroup();
      if (scene.children.includes(group)) scene.remove(group);
    };

    if (!visible) {
      teardown();
      return;
    }

    const { features } = regionMarksFor(reports, territories, states, areas);
    clearGroup();
    if (!scene.children.includes(group)) scene.add(group);
    if (features.length === 0) return;

    const outlines = GeometryFactory.buildBorderLines(features, {
      elevation: ELEVATION, color: COLOR, opacity: OPACITY,
    });
    outlines.children.forEach((line) => { line.renderOrder = OUTLINE_ORDER.renderOrder; });
    group.add(outlines);
    // The featured report's territory, lit over its outline (BA3).
    const lit = featuredRegionFeatures(reports, featuredId, resolve);
    if (lit.edges.length) {
      const fill = GeometryFactory.buildTerritoryPolygons(lit.fills, { color: LIT_FILL_COLOR, opacity: LIT_FILL_OPACITY, elevation: LIT_FILL_ELEVATION });
      fill.children.forEach((part) => { part.userData.lit = 'fill'; });
      const edge = buildBorderLineBatches(lit.edges, () => ({ color: LIT_EDGE_COLOR, look: LIT_EDGE_LOOK }), { elevation: LIT_EDGE_ELEVATION });
      edge.children.forEach((batch) => { batch.userData.lit = 'edge'; });
      group.add(fill, edge);
    }
    visualizationResourceMonitor.recordGeometry(MODE_KEY, collectGeometryStats(group));

    return () => { teardown(); };
  }, [globeRef, reports, territories, states, areas, resolve, visible, featuredId]);

  /*
   * The lit area, drawn as a featured territory is lit, in a group of its own:
   * whether or not Intel Reports are shown, since a person may find an area in
   * the search from any layer. It says what it has drawn, which a card waits for.
   */
  const litGroupRef = useRef<THREE.Group>(makeRegionGroup());
  useEffect(() => {
    const scene = (globeRef.current as unknown as { scene?: () => THREE.Scene } | undefined)?.scene?.();
    const group = litGroupRef.current;
    const shape = litArea ? areas?.get(litArea) : undefined;
    if (!scene || !group || !litArea || !shape) {
      markLitAreaDrawn(null);
      return;
    }
    const polygons = shape.geometry.type === 'Polygon' ? [shape.geometry.coordinates] : shape.geometry.coordinates;
    const fill = GeometryFactory.buildTerritoryPolygons(
      polygons.map((rings, i) => ({ id: `area-lit-fill:${litArea}#${i}`, rings: rings as [number, number][][] })),
      { color: LIT_FILL_COLOR, opacity: LIT_FILL_OPACITY, elevation: LIT_FILL_ELEVATION },
    );
    fill.children.forEach((part) => { part.userData.lit = 'area-fill'; });
    const edge = buildBorderLineBatches(ringsOf(shape.geometry, litArea, 3, 'area-lit:'), () => ({ color: LIT_EDGE_COLOR, look: LIT_EDGE_LOOK }), { elevation: LIT_EDGE_ELEVATION });
    edge.children.forEach((batch) => { batch.userData.lit = 'area-edge'; });
    group.add(fill, edge);
    scene.add(group);
    markLitAreaDrawn(litArea);
    return () => {
      group.traverse((obj) => {
        const drawn = obj as THREE.Mesh | THREE.Line;
        if ((drawn as THREE.Mesh).isMesh || (drawn as THREE.Line).isLine) {
          drawn.geometry?.dispose();
          const material = drawn.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose();
        }
      });
      group.clear();
      scene.remove(group);
      markLitAreaDrawn(null);
    };
  }, [globeRef, litArea, areas]);

  /*
   * Recomputed for the caller rather than captured from the effect: the effect
   * runs after render and may not run at all (no globe yet, layer hidden),
   * and a disclosure that appears one frame late — or never — is the failure
   * this return value exists to end.
   */
  return useMemo(() => {
    if (!visible) return { drawn: 0, unmatched: [], reports: [], featured: null, groupsAt: null };
    const { features, unmatched } = regionMarksFor(reports, territories, states, areas);
    const featuredReport = featuredId ? reports.find((r) => r.id === featuredId) : undefined;
    return {
      drawn: features.length,
      unmatched,
      reports: territoryShareReports(reports, resolve),
      featured: featuredReport ? featuredTerritoryFor(featuredReport, resolve) : null,
      groupsAt: features.length ? territoryGroupIndex(reports, resolve) : null,
    };
  }, [reports, territories, states, areas, resolve, visible, featuredId]);
}
