// useResourceZones3D.ts — the ResourceZones sub-mode layer. Per the approved
// plan, this reuses National Territories' rendering stack almost entirely
// rather than being a from-scratch layer: the same baked polygon geometry
// (nationalTerritoriesService.loadTerritoriesLODResolved), the same
// territoryFillMaterial shader, and the same border-classification data —
// just a different color source (resourceZoneTheme.ts's resource-type hash
// instead of materialTheme.ts's colorScheme) and a different config path
// (GeoPoliticalConfig['resourceZones'] instead of ['nationalTerritories']).
//
// Deliberately simpler than useNationalTerritories3D.ts: no adaptive LOD switching (fixed at LOD0 — cheapest to
// fetch; a supplementary color-coded overlay doesn't need LOD2's extra
// vertex density the way a hover-picked, close-zoomed territory fill does).
// Each fill says its country's figures on a hover and lists them on a click
// (resourceZoneSay; critique-2026-11-01, O9): it said nothing at all before.
// Three sub-groups — resource-type fills, conflict-zone border highlights,
// and trade-route connection arcs — are combined into one registered layer
// and rebuilt together whenever config changes, cross-faded via the same
// replaceGroupContentsWithCrossFade used by the territories layer.
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { nationalTerritoriesService, type BakedTerritoryPart } from '../services/NationalTerritoriesService';
import { GeoPoliticalConfig } from '../../hooks/useGeoPoliticalSettings';
import { createTerritoryFillMaterial } from '../theme/territoryFillMaterial';
import { buildBorderLineBatches } from '../geometry/fatBorderLines';
import { buildConnectionLines, type ConnectionSpec } from '../geometry/connectionLines';
import { useSimpleGeoOverlayLayer } from './useSimpleGeoOverlayLayer';
import { resourceTypeColor, pickRealResourceType, conflictZoneColor, type ResourceType, type CountryResourceRank } from '../theme/resourceZoneTheme';
import { useResourceZonePercentiles } from './useResourceZonePercentiles';
import { resourceLines, type ResourceFigures } from '../utils/countryBrief';
import { RESOURCE_SOURCE_LINKS, resourceLineWords } from '../utils/resourceLineWords';
import { fill, messagesNow } from '../../i18n/app/i18n';
import type { GlobeNoteSet } from '../../features/globe/noteDetail/globeNoteStore';
import { cssColorOf, publishLegend, type LegendSwatch } from '../../services/globe/globeLegendStore';
import { getRealTradeRoutes, type RealTradeRoute } from '../../services/geopolitical/UNComtradeService';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'useResourceZones3D' });

// Fixed, not adaptive — see file header. LOD0 is also the tier
// getCountryCentroids/getCountryDirectory already use for the same reason:
// cheapest to fetch, and likely already cached from another caller.
const RESOURCE_ZONE_LOD: 0 | 1 | 2 = 0;

// Slightly outside TERRITORY_RADIUS_SCALE (1.03, NationalTerritoriesService.ts)
// so resource-zone fills don't z-fight with national-territory fills when
// both overlays are pinned on simultaneously (they're independent booleans —
// see VisualizationOverlayContext.tsx — so that combination is a real case,
// not hypothetical).
const RESOURCE_ZONE_RADIUS_SCALE = 1.035;

interface UseResourceZonesParams {
  enabled: boolean;
  scene: THREE.Scene | null;
  config: GeoPoliticalConfig['resourceZones'];
}

/** The layer's name, in every language: layer names are kept in English (i18n `layers`). */
export const RESOURCE_ZONES_LABEL = 'Resource Zones';

/**
 * What a country's fill says on a hover and opens on a click: where it stands for each resource type that is on,
 * the type it is coloured for first, in the Diplomacy brief's words (resourceLineWords), each figure with its source.
 * Null when the figures name it for none of them.
 */
export function resourceZoneSay(
  countryCode: string,
  countryName: string,
  drawn: ResourceType,
  activeTypes: readonly ResourceType[],
  figures: ResourceFigures,
): { tooltip: string; opens: GlobeNoteSet } | null {
  const lines = resourceLines(countryCode, figures)
    .filter((line) => activeTypes.includes(line.kind))
    .sort((a, b) => Number(b.kind === drawn) - Number(a.kind === drawn));
  if (!lines.length) return null;
  const m = messagesNow();
  const heading = `${countryName} · ${RESOURCE_ZONES_LABEL}`;
  const said = lines.map((line) => ({ line, words: resourceLineWords(line, m.diplomacy) }));
  const tooltip = [
    heading,
    ...said.map(({ line, words }) => {
      const text = `${words.name}: ${words.rank}`;
      return line.kind === drawn ? fill(m.resourceZones.itsColour, { line: text }) : text;
    }),
  ].join('\n');
  return {
    tooltip,
    opens: {
      heading,
      notes: said.map(({ line, words }) => ({
        id: `resource-zone:${countryCode}:${line.kind}`,
        kind: m.resourceZones.noteKind,
        title: `${words.name}: ${words.rank}`,
        text: words.source,
        timeMs: null,
        when: line.year,
        sources: [RESOURCE_SOURCE_LINKS[line.source]],
      })),
    },
  };
}

export const RESOURCE_ZONES_LEGEND_ID = 'ResourceZones';
const KEY_ORDER: readonly ResourceType[] = ['oil', 'gas', 'renewable', 'minerals', 'water'];

/** The key's colours: the types a build drew, read from its fills, so the key never names one not on the globe. */
export function resourceZoneSwatches(fills: THREE.Object3D): LegendSwatch[] {
  const drawn = new Set<ResourceType>();
  fills.traverse((o) => { const t = (o.userData as { resourceType?: ResourceType }).resourceType; if (t) drawn.add(t); });
  const names = messagesNow().diplomacy.resourceNames;
  return KEY_ORDER.filter((t) => drawn.has(t)).map((t) => ({ color: cssColorOf(resourceTypeColor(t)), label: names[t] }));
}

/**
 * Colors each baked part by its real, percentile-ranked active resource type (see
 * resourceZoneTheme.ts's pickRealResourceType). Exported for direct unit testing —
 * mirrors how NationalTerritoriesService.buildTerritoriesFromBaked is tested directly
 * rather than only through the hook that calls it. A part whose country has no real
 * data for any active resource type gets no mesh at all — not a placeholder.
 */
export function buildResourceZoneFills(
  parts: BakedTerritoryPart[],
  activeTypes: ResourceType[],
  opacity: number,
  percentilesByCountry: Map<string, CountryResourceRank[]>,
  /** The figures the ranks were made from: with them, each fill answers a hover and a click (resourceZoneSay). */
  figures?: ResourceFigures | null,
): THREE.Group {
  const group = new THREE.Group();
  if (activeTypes.length === 0 || opacity <= 0) return group;
  // A country of many parts (Indonesia, Canada) says the same on each: worked out once.
  const saidOf = new Map<string, ReturnType<typeof resourceZoneSay>>();

  parts.forEach((part) => {
    const countryCode = part.countryCode || part.id;
    const resourceType = pickRealResourceType(countryCode, activeTypes, percentilesByCountry);
    if (!resourceType) return;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(part.positions), 3));
    geom.setIndex(part.indices);
    geom.computeVertexNormals();

    const mat = createTerritoryFillMaterial({ baseColorHex: resourceTypeColor(resourceType), opacity, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = `resource-zone:${part.id}`;
    if (figures && !saidOf.has(countryCode)) saidOf.set(countryCode, resourceZoneSay(countryCode, part.name || countryCode, resourceType, activeTypes, figures));
    const say = saidOf.get(countryCode) ?? null;
    mesh.userData = { source: 'resource-zone', countryCode: part.countryCode, resourceType, ...(say ?? {}) };
    group.add(mesh);
  });

  group.scale.setScalar(RESOURCE_ZONE_RADIUS_SCALE);
  return group;
}

type LoadedBorders = Awaited<ReturnType<typeof nationalTerritoriesService.loadBordersLOD>>;

/**
 * Highlights the disputed/line_of_control subset of the existing border
 * classification — no new conflict-zone data, per the approved plan; this is
 * a visibility + styling toggle over data National Territories already has.
 */
export function buildConflictZoneBorders(borders: LoadedBorders, cfg: GeoPoliticalConfig['resourceZones']['conflictZones']): THREE.Group {
  if (!cfg.show) return new THREE.Group();
  const disputed = borders.filter((f) => f.classification === 'disputed' || f.classification === 'line_of_control');
  const color = conflictZoneColor(cfg.alertLevel);
  const look = {
    opacity: cfg.highlightDisputed ? 0.95 : 0.6,
    linewidth: cfg.highlightDisputed ? 3 : 2,
    dashed: true, dashSize: 3, gapSize: 2, dashScale: 1,
    renderOrder: 105
  };
  return buildBorderLineBatches(disputed, (f) => ({ color, classification: f.classification, look }), { radius: 101.5 });
}

/**
 * Resolves real bilateral trade routes' (UNComtradeService) country codes against
 * already-computed centroids (Piece 1's getCountryCentroids) and builds arcs between
 * them. A route whose country code has no resolvable centroid is silently skipped —
 * same "missing data doesn't invalidate the rest" stance as computeCountryCentroids
 * itself.
 */
export function buildTradeRouteLines(
  centroids: Map<string, { lat: number; lng: number }>,
  routes: RealTradeRoute[],
  intensity: number
): THREE.Group {
  const connections: ConnectionSpec[] = [];
  routes.forEach((route) => {
    const from = centroids.get(route.from);
    const to = centroids.get(route.to);
    if (!from || !to) return;
    connections.push({ id: route.id, from, to });
  });
  return buildConnectionLines(connections, {
    radius: 101.2,
    arcHeight: 12,
    color: 0xffaa33,
    opacity: Math.max(0.1, Math.min(1, intensity / 100)),
    linewidth: 1.5,
    dashed: false
  });
}

export function useResourceZones3D({ enabled, scene, config }: UseResourceZonesParams) {
  // The data error used to be dropped here — see useDiplomaticEvents3D.
  const { percentilesByCountry, figures, sources, error: dataError, loading: dataLoading } = useResourceZonePercentiles(enabled);
  // A build that ends after the layer is turned off publishes no key.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const buildContent = useCallback(async () => {
    const newGroup = new THREE.Group();
    let swatches: LegendSwatch[] = [];

    const activeTypes = (Object.keys(config.resourceTypes) as ResourceType[]).filter((t) => config.resourceTypes[t]);
    if (activeTypes.length > 0 && config.zoneOpacity > 0) {
      const territoriesResult = await nationalTerritoriesService.loadTerritoriesLODResolved(RESOURCE_ZONE_LOD);
      if (territoriesResult.kind === 'baked') {
        const fills = buildResourceZoneFills(territoriesResult.parts, activeTypes, config.zoneOpacity / 100, percentilesByCountry, figures);
        newGroup.add(fills);
        swatches = resourceZoneSwatches(fills);
      } else {
        log.warn('[ResourceZones] baked territory data unavailable; skipping zone fills for this build (legacy fallback not supported for resource zones)');
      }
    }

    if (config.conflictZones.show) {
      const borders = await nationalTerritoriesService.loadBordersLOD(RESOURCE_ZONE_LOD);
      newGroup.add(buildConflictZoneBorders(borders, config.conflictZones));
    }

    if (config.showTradeRoutes) {
      const [centroids, routes] = await Promise.all([
        nationalTerritoriesService.getCountryCentroids(),
        getRealTradeRoutes()
      ]);
      newGroup.add(buildTradeRouteLines(centroids, routes, config.tradeRouteIntensity));
    }

    // The fills had no key: their colour said nothing until hovered (critique-2026-11-01, O9).
    if (enabledRef.current) publishLegend(RESOURCE_ZONES_LEGEND_ID, swatches.length ? {
      layerId: RESOURCE_ZONES_LEGEND_ID,
      layer: RESOURCE_ZONES_LABEL,
      colorMeans: 'the resource a country stands highest in among producers, of the types shown',
      swatches,
    } : null);
    return newGroup;
  }, [config.resourceTypes, config.zoneOpacity, config.conflictZones, config.showTradeRoutes, config.tradeRouteIntensity, percentilesByCountry, figures]);

  useEffect(() => { if (!enabled) publishLegend(RESOURCE_ZONES_LEGEND_ID, null); }, [enabled]);
  useEffect(() => () => publishLegend(RESOURCE_ZONES_LEGEND_ID, null), []);

  const { loading, error } = useSimpleGeoOverlayLayer({
    enabled,
    scene,
    compareLayer: 'ResourceZones',
    layerId: 'geopolitical-resource-zones',
    // Above the country fills (95) — see useDiplomaticEvents3D.ts's note. At 90 the
    // base map tinted every zone and route this layer drew.
    layerOrder: 190,
    buildContent
  });

  /*
   * Per source, for the resource types that are switched on. The layer merges its
   * sources into one ranking, so one that returned nothing left no trace — when oil and
   * gas needed an EIA key, they were simply absent from the picture, with nothing said.
   */
  const on = config.resourceTypes;
  const gap = (active: boolean, records: number | undefined, reason: string) =>
    active && sources && records === 0 ? reason : null;
  const sourceErrors = {
    eia: gap(on.oil || on.gas || on.renewable, sources?.eia.records, "EIA's production figures did not load"),
    water: gap(on.water, sources?.water.records, 'the World Bank returned no water figures'),
    minerals: gap(on.minerals, sources?.minerals.records, 'USGS returned no mineral figures'),
  };

  return { loading, error: error ?? dataError, dataLoading, sourceErrors };
}
