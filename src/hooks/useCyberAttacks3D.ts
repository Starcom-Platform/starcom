// src/hooks/useCyberAttacks3D.ts
// Hook for managing CyberAttacks 3D visualization in the Globe
// Followed the pattern of useIntelReport3DMarkers.ts, the Intel Report models' hook (retired 2026-10-08)

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { RealTimeAttackService } from '../services/CyberAttacks/RealTimeAttackService';
import { publishLegend, swatchesFromMarks, cssColorOf } from '../services/globe/globeLegendStore';
import { resolveMarkerStyle, type MarkerStyleChoices } from '../components/Globe/markerStyles';
import { latLngToGlobeWorld } from '../utils/globeCoordinates';
import { clusterAttacksByCountry, applyOTXEnrichment, type CyberAttackCountryCluster } from '../utils/cyberAttackClustering';
import { enrichWithOTX, otxPermitted } from '../services/CyberAttacks/OTXEnrichmentService';
import { getMitreReferenceData } from '../services/threat-intel/MitreAttackReferenceService';
import {
  buildScreenPoints, setScreenPointsOpacity, drawAboveSurfaceLayers, markPxForCount,
  SCREEN_POINTS_RENDER_ORDER, type ScreenPointsOptions,
} from '../components/Globe/screenPoints';
import { registerTooltipGroup } from '../components/Globe/pointTooltipRegistry';
import type {
  CyberAttackData,
  CyberAttackQueryOptions,
  SeverityLevel
} from '../types/CyberAttacks';
import type { OTXEnrichment } from '../types/ThreatIntelOTX';
import type { MitreReferenceData } from '../types/MitreAttack';
import { createLogger } from '@utils/logger';
import { ridesShell } from '../globe-engine/shellLift';
import { cyberClusterNoteSet } from '../features/globe/noteDetail/cyberClusterNote';
import type { GlobeNoteSet } from '../features/globe/noteDetail/globeNoteStore';
import { registerLayerRoot } from '../globe-engine/compareLayers';
const log = createLogger({ prefix: 'useCyberAttacks3D' });

// THREE.Group.clear() only detaches children — it never releases their
// GPU-side geometry/material buffers. This hook rebuilds its markers whenever
// the clusters or the chosen sub-layers change, so a plain .clear() would leak
// every marker set's GPU resources on each rebuild, for as long as the layer is
// active. Duck-typed (geometry/material props, not instanceof).
function disposeGroupChildren(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0] as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    group.remove(child);
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
    else child.material?.dispose?.();
  }
}

// One sub-mode, independently-toggled real layers — same shape as GeoPolitical's
// ConflictZones (useConflictZones3D.ts's layerTypes). All operate on the same real
// clusterAttacksByCountry() output; no layer here fetches its own separate data.
export interface CyberThreatsLayerTypes {
  indicators: boolean;
  density: boolean;
  enrichment: boolean;
  knownGroups: boolean;
}

const DEFAULT_LAYER_TYPES: CyberThreatsLayerTypes = {
  indicators: true,
  density: false,
  enrichment: false,
  knownGroups: false
};

// Hook options interface following the proven pattern
interface UseCyberAttacks3DOptions {
  globeRadius?: number;
  updateInterval?: number;
  maxActiveAttacks?: number;
  debugMode?: boolean;
  layerTypes?: CyberThreatsLayerTypes;
  /**
   * How the INDICATORS are drawn — the person's choice for this layer
   * (decision D-F, step 6.3).
   *
   * The indicators only. This layer's other three sub-layers encode meaning in
   * their style: the density and newHalo blooms ARE added light, and the
   * enrichment ring is a separate claim about a country rather than another way
   * of drawing an indicator. See markerStyles.ts's header for the rule.
   */
  markerStyles?: MarkerStyleChoices;
}

// One marker per real-country cluster, not per attack — see cyberAttackClustering.ts for
// why per-attack markers exactly overlap once a country has more than one real entry.
// Each sub-layer is ONE object holding a point per cluster it draws (screenPoints.ts),
// tagged with one of these, its clusters in the same order in userData.clusters.
export const CYBER_MARKER_LAYERS = {
  density: 'cyberAttackDensity',
  newHalo: 'cyberAttackNewHalo',
  indicators: 'cyberAttackIndicators',
  enrichment: 'cyberAttackEnrichment',
} as const;

/**
 * A country's marker diameter in CSS pixels: a capped log scale of its indicator
 * count, so the one country with fifty does not dwarf the thirty with one or two.
 * The smallest is 8 px — about 7 on a card, comfortably over the layer audit's 4×4 px.
 */
export function clusterMarkerPx(count: number): number {
  // The scale every count-sized mark on the globe uses (screenPoints.ts).
  return markPxForCount(count);
}

// Hook state interface
interface CyberAttacks3DState {
  attacks: CyberAttackData[];
  attacksGroup: THREE.Group;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date;
}

/** Same records, in the same order, marked new or not the same way. */
function sameRecords(a: readonly CyberAttackData[], b: readonly CyberAttackData[]): boolean {
  return a.length === b.length
    && a.every((x, i) => x.id === b[i].id && x.metadata.isNew === b[i].metadata.isNew);
}

// ColorBrewer's real "YlOrRd" 5-class sequential scheme — a documented,
// colorblind-safe palette appropriate for ordinal data like severity.
// Deliberately not a green→red categorical pair (the classic red-green
// colorblind failure mode), and deliberately keyed by the real numeric
// SeverityLevel (1-5) rather than string labels that never matched it.
const SEVERITY_COLORS: Record<SeverityLevel, number> = {
  1: 0xffffb2,
  2: 0xfecc5c,
  3: 0xfd8d3c,
  4: 0xf03b20,
  5: 0xbd0026
};

export const useCyberAttacks3D = (
  isActive: boolean,
  scene: THREE.Scene | null,
  camera: THREE.Camera | null,
  options: UseCyberAttacks3DOptions = {}
) => {
  const {
    globeRadius = 100,
    updateInterval = 60_000,
    maxActiveAttacks = 150,
    debugMode = false,
    layerTypes = DEFAULT_LAYER_TYPES,
    markerStyles
  } = options;

  /*
   * Keyed on CONTENT: Globe.tsx passes a fresh choices object on every settings
   * read, so keying the draw effect on the object itself would rebuild all four
   * sub-layers for nothing.
   */
  const markerStyleKey = JSON.stringify(markerStyles ?? null);
  const indicatorStyle = resolveMarkerStyle(markerStyles, 'CyberThreats');

  // State management following the proven pattern
  const [state, setState] = useState<CyberAttacks3DState>(() => ({
    attacks: [],
    attacksGroup: ridesShell(drawAboveSurfaceLayers(new THREE.Group())),
    isLoading: false,
    error: null,
    lastUpdate: new Date()
  }));

  // Real per-IP OTX enrichment, keyed by IP — populated asynchronously (see the
  // enrichment-fetch effect below), independent of the attack-data refresh cycle.
  const [enrichmentByIp, setEnrichmentByIp] = useState<Map<string, OTXEnrichment>>(new Map());

  // Real, static "Known Threat Groups" reference data (see MitreAttackReferenceService.ts).
  // Deliberately NOT rendered as globe markers: real MITRE ATT&CK group records don't carry
  // a structured per-group geo-coordinate or country field (only free-text descriptions
  // that sometimes mention a country) — inferring placement from that would mean guessing,
  // not reading real structured data. Exposed via this hook's return value instead, for a
  // settings-panel summary/reference display.
  const [mitreReference, setMitreReference] = useState<MitreReferenceData | null>(null);
  const [mitreLoading, setMitreLoading] = useState(false);

  // Hoverable: see useGlobePointTooltips.
  useEffect(() => registerTooltipGroup(state.attacksGroup), [state.attacksGroup]);

  // Service reference
  const serviceRef = useRef<RealTimeAttackService | null>(null);
  const updateTimerRef = useRef<NodeJS.Timeout>();
  const isFetchingRef = useRef(false);

  const isMobileDevice = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return false;
    }
    return /iPhone|iPad|iPod|Android|Mobile|webOS/i.test(navigator.userAgent);
  }, []);

  const effectiveUpdateInterval = useMemo(() => {
    return isMobileDevice ? Math.max(updateInterval, 6000) : updateInterval;
  }, [isMobileDevice, updateInterval]);

  // Real per-country aggregation — recomputed only when the underlying attack
  // list actually changes (a new fetch cycle), not on every render.
  const baseClusters = useMemo(() => clusterAttacksByCountry(state.attacks), [state.attacks]);

  // Real OTX enrichment layered on top, once available — a separate pass (see
  // cyberAttackClustering.ts's applyOTXEnrichment) so clusterAttacksByCountry itself stays
  // free of any OTX-specific knowledge. A no-op (returns baseClusters as-is) until the
  // enrichment-fetch effect below populates enrichmentByIp.
  const clusters = useMemo(
    () => applyOTXEnrichment(baseClusters, enrichmentByIp),
    [baseClusters, enrichmentByIp]
  );

  // OTX is off until LevelBlue permits it (otxPermitted, D-CS CS9).
  // Fetch real per-IP OTX enrichment when the enrichment layer is on. Independent of the
  // 2s attack-data refresh cycle — OTXEnrichmentService has its own real 24h per-IP cache,
  // so this only does real new work when the underlying attack list actually changes.
  useEffect(() => {
    if (!otxPermitted() || !isActive || !layerTypes.enrichment || state.attacks.length === 0) return;
    let cancelled = false;

    const ips = state.attacks
      .map(a => a.metadata.realIp)
      .filter((ip): ip is string => typeof ip === 'string');

    enrichWithOTX(ips).then(result => {
      if (!cancelled) setEnrichmentByIp(result);
    }).catch(error => {
      log.warn('OTX enrichment batch failed:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [isActive, layerTypes.enrichment, state.attacks]);

  // Lazily fetch the real MITRE reference data only when the Known Groups layer is
  // actually enabled — never on app boot. getMitreReferenceData() checks its own real
  // IndexedDB cache first (30-day TTL); a real network fetch of the ~53MB source only
  // happens on a genuine cache miss/expiry.
  useEffect(() => {
    if (!isActive || !layerTypes.knownGroups || mitreReference) return;
    let cancelled = false;

    setMitreLoading(true);
    getMitreReferenceData()
      .then(data => {
        if (!cancelled) setMitreReference(data);
      })
      .catch(error => {
        log.warn('MITRE reference data fetch failed:', error);
      })
      .finally(() => {
        if (!cancelled) setMitreLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isActive, layerTypes.knownGroups, mitreReference]);

  // Initialize service
  useEffect(() => {
    if (!isActive) return;

    if (!serviceRef.current) {
      serviceRef.current = new RealTimeAttackService();

      if (debugMode) {
        log.debug('⚡ CyberAttacks3D: Service initialized');
      }
    }

    return () => {
      if (serviceRef.current) {
        serviceRef.current.dispose();
        serviceRef.current = null;
        if (debugMode) {
          log.debug('⚡ CyberAttacks3D: Service disposed');
        }
      }
    };
  }, [isActive, debugMode]);

  // Add attacks group to scene
  useEffect(() => {
    if (!scene || !isActive) return;

    const attacksGroup = state.attacksGroup;
    scene.add(attacksGroup);
    // Its objects, for a comparison side by side (D-CM, CM1).
    const unnameForCompare = registerLayerRoot('CyberThreats', attacksGroup);

    return () => {
      unnameForCompare();
      scene.remove(attacksGroup);
      disposeGroupChildren(attacksGroup);
    };
  }, [scene, isActive, state.attacksGroup]);

  // Load attack data
  const loadAttackData = useCallback(async () => {
    if (!serviceRef.current || !isActive) return;
    if (isFetchingRef.current) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    try {
      isFetchingRef.current = true;
      /*
       * "Loading" only until the first answer. This re-checks on a timer, and it used to
       * set loading — and clear any error — at the start of every re-check, every two
       * seconds: a share card captured in that moment said a loaded layer was still
       * loading, or said nothing of an error that stood either side of it.
       */
      setState(prev => (prev.attacks.length > 0 || prev.error || prev.isLoading) ? prev : { ...prev, isLoading: true });

      // Build query options from settings.
      // No time window. Records come from a snapshot built with the deploy, each dated by
      // its list's own last update, and the build already refuses a list more than a week
      // old — that is the recency rule. The 48-hour window that was here was measured from
      // the wall clock, so once a deploy was two days old it filtered out every indicator
      // and the layer drew an empty globe — the same trap as a clock-relative filter over
      // the GDELT snapshot.
      const queryOptions: CyberAttackQueryOptions = {
        limit: maxActiveAttacks,
        attack_statuses: ['detected', 'in_progress', 'escalated'],
        severity_min: 3, // Medium severity and above
        real_time: true
      };

      const attacks = await serviceRef.current.getData(queryOptions);

      if (debugMode) {
        log.debug(`⚡ CyberAttacks3D: Loaded ${attacks.length} attacks`);
      }

      // The same records as last time change nothing: no re-render of the globe, and no
      // rebuild of every marker. The service answers each read with a new array, so
      // before this every re-check disposed and redrew the whole layer.
      setState(prev => {
        const same = sameRecords(prev.attacks, attacks);
        if (same && !prev.isLoading && !prev.error) return prev;
        return { ...prev, attacks: same ? prev.attacks : attacks, isLoading: false, error: null, lastUpdate: new Date() };
      });

    } catch (error) {
      log.error('Error loading cyber attacks data:', error);
      /*
       * Only a layer with nothing drawn has failed. A re-check that fails after a good
       * load leaves a picture that is still what it says it is — the build's snapshot,
       * dated by its lists — and reporting "did not load" beside it would contradict
       * what is on the globe.
       */
      setState(prev => prev.attacks.length > 0
        ? (prev.isLoading ? { ...prev, isLoading: false } : prev)
        : { ...prev, isLoading: false, error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      isFetchingRef.current = false;
    }
  }, [serviceRef, isActive, maxActiveAttacks, debugMode]);

  // Draw the clusters, whenever they or the chosen sub-layers change. Each sub-layer is
  // one object with a point per cluster, drawn back to front in the order below.
  useEffect(() => {
    const group = state.attacksGroup;
    if (!isActive) {
      publishLegend('CyberThreats', null);
      return;
    }
    // Disposes each object's geometry/material, not just detaching it (see above).
    disposeGroupChildren(group);
    if (clusters.length === 0) {
      publishLegend('CyberThreats', null);
      return;
    }

    const at = (c: CyberAttackCountryCluster, lift: number) =>
      latLngToGlobeWorld(c.location.latitude, c.location.longitude, globeRadius * lift);
    let order = SCREEN_POINTS_RENDER_ORDER;
    const draw = (
      layer: typeof CYBER_MARKER_LAYERS[keyof typeof CYBER_MARKER_LAYERS],
      drawn: CyberAttackCountryCluster[],
      point: (c: CyberAttackCountryCluster) => { lift: number; sizePx: number; color: number },
      options: ScreenPointsOptions,
      tooltip?: (c: CyberAttackCountryCluster) => string,
      opens?: (c: CyberAttackCountryCluster) => GlobeNoteSet,
    ): THREE.Points | null => {
      order++;
      if (drawn.length === 0) return null;
      const points = buildScreenPoints(drawn.map((c) => {
        const p = point(c);
        return { position: at(c, p.lift), sizePx: p.sizePx, color: p.color, tooltip: tooltip?.(c), opens: opens?.(c) };
      }), { ...options, userData: { type: layer, layer: 'Cyber Threats', clusters: drawn } });
      points.renderOrder = order;
      group.add(points);
      return points;
    };
    const severity = (c: CyberAttackCountryCluster) => SEVERITY_COLORS[c.maxSeverity];

    /*
     * Density: the same clusters as a large, soft, additive bloom, so crowded
     * regions genuinely brighten — the principle a heat map works on, without
     * being one.
     *
     * `bloom`, not `glow`: this layer is drawn BEHIND the indicators and its
     * meaning IS the added light. `glow` now draws a mark with a halo, which
     * would put a second ring of discs behind every indicator and say nothing.
     */
    draw(CYBER_MARKER_LAYERS.density, layerTypes.density ? clusters : [],
      (c) => ({ lift: 1.015, sizePx: clusterMarkerPx(c.count) * 3, color: severity(c) }),
      { style: 'bloom', opacity: 0.35 });

    // A pulsing bloom behind any country with an entry new since the last snapshot
    // read. Behind the indicator, like the density layer, for the same reason.
    const halo = draw(CYBER_MARKER_LAYERS.newHalo, layerTypes.indicators ? clusters.filter((c) => c.newCount > 0) : [],
      (c) => ({ lift: 1.02, sizePx: clusterMarkerPx(c.count) * 2.2, color: severity(c) }),
      { style: 'bloom', opacity: 0.3 });

    /*
     * The indicator: a disc sized by count, filled by the cluster's worst severity. The
     * palette (above) runs pale to dark, so the WORST severity is the darkest fill —
     * the one that vanishes on the ocean and the night side. A light rim keeps it there.
     */
    draw(CYBER_MARKER_LAYERS.indicators, layerTypes.indicators ? clusters : [],
      (c) => ({ lift: 1.02, sizePx: clusterMarkerPx(c.count), color: severity(c) }),
      { rim: 'light', style: indicatorStyle },
      (c) => `${c.countryCode}: ${c.count} listed address${c.count === 1 ? '' : 'es'}`
        + `, worst severity ${c.maxSeverity} of 5`
        + (c.sources.length ? ` · ${c.sources.join(', ')}` : ''),
      // A click opens the count by list, with each list's file (critique C5).
      cyberClusterNoteSet);

    // A ring around any country with OTX-corroborated members. The disc under it is what a
    // click opens; the ring says only that OTX corroborates some of them.
    const enriched = layerTypes.enrichment ? clusters.filter((c) => c.enrichedCount > 0) : [];
    draw(CYBER_MARKER_LAYERS.enrichment, enriched,
      (c) => ({ lift: 1.025, sizePx: clusterMarkerPx(c.count) + 10, color: 0x00e5ff }),
      { style: 'ring', opacity: 0.9 });

    /*
     * What a reader needs to decode the discs: the palette is ordinal, so a swatch per
     * severity ACTUALLY DRAWN reads as the scale it is. The ring is a separate claim
     * and gets its own swatch only when one was drawn.
     */
    publishLegend('CyberThreats', {
      layerId: 'CyberThreats',
      layer: 'Cyber Threats',
      sizeMeans: 'listed addresses in that country',
      colorMeans: 'worst severity of the country\'s listings',
      /*
       * The INDICATORS' shape, and only when they were drawn — with them toggled
       * off this layer is blooms and rings that the choice never touched, so
       * naming a shape would describe a mark that is not on the globe.
       *
       * The enrichment swatch below says "ring: corroborated by OTX" in its own
       * label, which is what keeps the two readable when a person picks rings
       * here: the indicator rings are severity-coloured and the corroboration
       * ring is cyan and larger.
       */
      shapeMeans: layerTypes.indicators ? indicatorStyle : undefined,
      swatches: [
        ...swatchesFromMarks(
          [...clusters]
            .sort((a, b) => a.maxSeverity - b.maxSeverity)
            .map((c) => ({ color: cssColorOf(severity(c)), category: `severity ${c.maxSeverity} of 5` })),
        ),
        ...(enriched.length ? [{ color: cssColorOf(0x00e5ff), label: 'ring: corroborated by OTX' }] : []),
      ],
    });

    if (debugMode) {
      log.debug(`⚡ CyberAttacks3D: Drew ${clusters.length} country clusters (indicators=${layerTypes.indicators}, density=${layerTypes.density}, enrichment=${layerTypes.enrichment})`);
    }

    if (!halo) return;
    // The halo pulses, so "something changed here" reads between refreshes.
    let frame = 0;
    const pulse = () => {
      setScreenPointsOpacity(halo, Math.max(0.15 + Math.sin(Date.now() * 0.003) * 0.15, 0.05));
      frame = requestAnimationFrame(pulse);
    };
    pulse();
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markerStyles keyed by content
  }, [isActive, clusters, globeRadius, layerTypes.indicators, layerTypes.density, layerTypes.enrichment, debugMode, state.attacksGroup, markerStyleKey]);

  // Auto-refresh data
  useEffect(() => {
    if (!isActive) return;

    // Initial load
    loadAttackData();

    // Set up refresh timer
    updateTimerRef.current = setInterval(loadAttackData, effectiveUpdateInterval);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void loadAttackData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (updateTimerRef.current) {
        clearInterval(updateTimerRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive, loadAttackData, effectiveUpdateInterval]);

  // Return hook interface following the proven pattern
  return {
    attacks: state.attacks,
    clusters,
    attacksGroup: state.attacksGroup,
    isLoading: state.isLoading,
    error: state.error,
    lastUpdate: state.lastUpdate,
    refresh: loadAttackData,
    mitreReference,
    mitreLoading,
    // What a card credits (D-CS): OTX while its ring is drawn, ATT&CK while Known Groups draws from it.
    otxDrawn: layerTypes.enrichment && clusters.some((c) => c.enrichedCount > 0),
    mitreDrawn: layerTypes.knownGroups && mitreReference !== null,
  };
};
