// useConflictZones3D.ts — the ConflictZones sub-mode layer. Two real-data marker
// sub-groups combined into one registered layer, same "deliberately simpler than National
// Territories" shape as useResourceZones3D.ts/useDiplomaticEvents3D.ts: a hover on each mark,
// and a click that opens its events or figures (critique C5); no adaptive LOD.
//   - War events: GDELTEventService's real conflict/violence CAMEO range (root codes
//     14-20), via useRealConflictEvents — one marker per (event, actor country) pair,
//     colored/scaled by real GoldsteinScale severity (conflictZonesTheme.ts).
//   - Humanitarian crisis: UNHCRDisplacementService's real per-country displacement
//     totals, via useRealDisplacementData — one marker per country with real nonzero
//     displacement, colored uniformly and scaled by real magnitude (log scale — the
//     handful of largest crises would otherwise swamp every other marker).
import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { nationalTerritoriesService } from '../services/NationalTerritoriesService';
import { GeoPoliticalConfig } from '../../hooks/useGeoPoliticalSettings';
import { latLonToVector3 } from '../utils/latLonToVector3';
import type { CountryCentroid } from '../utils/countryCentroids';
import { useSimpleGeoOverlayLayer } from './useSimpleGeoOverlayLayer';
import { warEventColor, goldsteinToWarMarkerScale, HUMANITARIAN_CRISIS_COLOR, displacementToMarkerScale } from '../theme/conflictZonesTheme';
import type { RealGdeltEvent } from '../../services/geopolitical/GDELTEventService';
import type { CountryDisplacement } from '../../services/geopolitical/UNHCRDisplacementService';
import { useRealConflictEvents } from './useRealConflictEvents';
import { tallyEventsByCountry } from '../utils/eventAggregation';
import { buildScreenPoints, markPxForCount } from '../../components/Globe/screenPoints';
import { publishLegend, cssColorOf, type LegendSwatch, type LayerLegend } from '../../services/globe/globeLegendStore';
import { useRealDisplacementData } from './useRealDisplacementData';
import { withinSpan } from '../utils/gdeltTimeSpan';
import { snapshotDayNote, useGdeltSpan } from './useGdeltSpan';
import { formatCount } from '@utils/formatCount';
import { warTallyNoteSet, displacementNoteSet } from '../../features/globe/noteDetail/conflictZoneNotes';
import { useConflictEventMarks } from './useConflictEventMarks';
import type { MarkStyle } from '../../features/globe/marks/kindMarks';

// Outside DiplomaticEvents' MARKER_RADIUS (102) / CONNECTION_RADIUS (101.6) and
// ResourceZones' fill/border/route radii (~101.2-103.6) so all four GeoPolitical overlays
// can be pinned on simultaneously without z-fighting.
const WAR_MARKER_RADIUS = 104;
const HUMANITARIAN_MARKER_RADIUS = 105;
// On-screen pixels at the middle of the displacement scale (see buildHumanitarianCrisisMarkers).
const HUMANITARIAN_MARKER_BASE_PX = 11;

interface UseConflictZonesParams {
  enabled: boolean;
  scene: THREE.Scene | null;
  config: GeoPoliticalConfig['conflictZones'];
  /**
   * The rail's choices (critique-2026-11-01, O12, OR2; plan B1): each event at its place, or a tally a country; and
   * the events' mark. Absent: each event, as icons.
   */
  view?: 'events' | 'countries';
  markStyle?: MarkStyle;
}

function centroidToVector3(point: { lat: number; lng: number }, radius: number): THREE.Vector3 {
  // Same [x, y, -z] convention as useDiplomaticEvents3D.ts's centroidToVector3 /
  // connectionLines.ts's toUnitVector.
  const v = latLonToVector3(point.lat, point.lng, { radius, elevation: 0, invertX: false });
  return new THREE.Vector3(v.x, v.y, -v.z);
}

/**
 * One mark per country, sized by how many war events name it and coloured by the mean
 * Goldstein across them — GDELT's cooperation-to-conflict scale, so a country whose
 * events are uniformly severe reads darker than one with a mixed set.
 *
 * This drew ONE SPHERE PER (EVENT, COUNTRY), all of a country's at its single centroid:
 * measured from the shipped snapshot, 2,968 events made 5,936 spheres over 130
 * countries, stacked on each other, so a country with one event looked like a country
 * with ninety. Exported for direct unit testing.
 */
export function buildWarEventMarkers(
  events: RealGdeltEvent[],
  centroids: Map<string, CountryCentroid>,
  markerSize: number,
): THREE.Points | null {
  const tallies = tallyEventsByCountry(events, {
    actors: (event) => [event.actor1ISO3, event.actor2ISO3],
    goldstein: (event) => event.goldsteinScale,
  });
  const scale = Math.max(0.6, Math.min(2, markerSize || 1));
  const points = tallies.flatMap((tally) => {
    const centroid = centroids.get(tally.countryCode);
    if (!centroid) return [];
    return [{
      position: centroidToVector3(centroid, WAR_MARKER_RADIUS),
      sizePx: markPxForCount(tally.count) * scale,
      magnitude: tally.count,
      // No Goldstein at all on a country's events reads as the mild end, not as severe.
      color: warEventColor(tally.meanGoldstein ?? 0),
      tooltip: `${tally.countryCode}: ${tally.count} conflict event${tally.count === 1 ? '' : 's'}`
        + (tally.meanGoldstein === null
          ? ', no Goldstein score reported'
          : `, mean Goldstein ${tally.meanGoldstein.toFixed(1)} (-10 to +10)`),
      // A click opens its events, newest first, each with its report (critique C5).
      opens: warTallyNoteSet(tally.countryCode, tally.events),
    }];
  });
  if (points.length === 0) return null;
  /*
   * The colour is a continuous ramp over mean Goldstein, so a swatch per country would
   * be a hundred near-identical dots. The two ENDS actually drawn say what the ramp is
   * and what its extremes mean on this globe — and they are measured from the tallies
   * on it, not from the ramp's own end points, which nothing here may have reached.
   */
  const scored = tallies.filter((t) => t.meanGoldstein !== null && centroids.get(t.countryCode));
  const mildest = scored.reduce<typeof scored[number] | null>((w, t) => (!w || (t.meanGoldstein ?? 0) > (w.meanGoldstein ?? 0) ? t : w), null);
  const severest = scored.reduce<typeof scored[number] | null>((w, t) => (!w || (t.meanGoldstein ?? 0) < (w.meanGoldstein ?? 0) ? t : w), null);
  const ends: LegendSwatch[] = [];
  if (severest) ends.push({ color: cssColorOf(warEventColor(severest.meanGoldstein ?? 0)), label: `Goldstein ${(severest.meanGoldstein ?? 0).toFixed(1)} (most severe here)` });
  if (mildest && mildest !== severest) ends.push({ color: cssColorOf(warEventColor(mildest.meanGoldstein ?? 0)), label: `Goldstein ${(mildest.meanGoldstein ?? 0).toFixed(1)} (mildest here)` });

  const marks = buildScreenPoints(points, {
    rim: 'light', opacity: 0.95,
    userData: {
      source: 'conflict-war-event',
      layer: 'Conflict Zones — armed conflict',
      countries: tallies.map((t) => t.countryCode),
      legendSwatches: ends,
    },
  });
  return marks;
}

/**
 * One mark per country with real nonzero UNHCR displacement, at the country's real
 * centroid, sized by the real combined magnitude — the relative sizing
 * (displacementToMarkerScale) it always had, now in on-screen pixels rather than scene
 * units, so it reads on a card at any zoom. A country with no resolvable centroid is
 * silently skipped, same stance as useResourceZones3D.ts's buildTradeRouteLines.
 * Exported for direct unit testing.
 */
export function buildHumanitarianCrisisMarkers(
  records: CountryDisplacement[],
  centroids: Map<string, CountryCentroid>,
  markerSize: number
): THREE.Points | null {
  const scale = Math.max(0.6, Math.min(2, markerSize || 1));
  const points = records.flatMap((record) => {
    const centroid = centroids.get(record.countryISO3);
    if (!centroid) return [];
    return [{
      position: centroidToVector3(centroid, HUMANITARIAN_MARKER_RADIUS),
      // The same magnitude scale as before, against a base a card can show.
      sizePx: Math.max(8, Math.min(22, HUMANITARIAN_MARKER_BASE_PX * displacementToMarkerScale(record.total) * scale)),
      color: HUMANITARIAN_CRISIS_COLOR,
      magnitude: record.total,
      tooltip: `${record.countryName || record.countryISO3}: `
        + `${formatCount(record.total)} displaced (UNHCR ${record.year})`,
      // A click opens UNHCR's figures for it, with the row they came from (critique C5).
      opens: displacementNoteSet(record),
    }];
  });
  if (points.length === 0) return null;
  const marks = buildScreenPoints(points, {
    // A RING, so shape tells a displacement mark from a conflict mark
    // (decision D-F, clutter and legibility). Both drew discs, and one legend
    // key said "size: events in that country, OR people displaced" — two
    // quantities in one channel, with colour applying to only one of them. A
    // 14 px disc meant either forty events or eighty thousand people and
    // nothing on screen said which.
    style: 'ring', rim: 'light', opacity: 0.9,
    userData: {
      source: 'conflict-humanitarian-crisis',
      layer: 'Conflict Zones — displacement',
      countries: records.map((r) => r.countryISO3),
      legendSwatches: [{ color: cssColorOf(HUMANITARIAN_CRISIS_COLOR), label: 'people displaced (UNHCR)' }],
    },
  });
  return marks;
}

/** The armed-conflict sub-layer's legend id. */
export const CONFLICT_ZONE_LEGEND_ID = 'ConflictZones';
/**
 * The displacement sub-layer's own legend id.
 *
 * The ':' form is how sub-layers are named elsewhere — see the intel report
 * anchors, which publish under 'IntelReports:reports' for the same reason: one
 * catalogue entry, two things drawn, and a single key that had to describe both
 * ended up describing neither.
 */
export const CONFLICT_DISPLACEMENT_LEGEND_ID = 'ConflictZones:displaced';

/**
 * What each sub-layer actually drawn should say about itself.
 *
 * One entry per dataset, and only for a dataset that drew something — the entry
 * this replaced named displacement whether or not that sub-layer was on.
 * Extracted from the hook so the claim can be tested: the defect here was never
 * in the data path, it was in what the legend said about it.
 */
export function conflictZoneLegends(
  warSwatches: LegendSwatch[],
  displacementSwatches: LegendSwatch[],
): LayerLegend[] {
  const entries: LayerLegend[] = [];
  if (warSwatches.length) {
    entries.push({
      layerId: CONFLICT_ZONE_LEGEND_ID,
      layer: 'Conflict Zones — armed conflict',
      shapeMeans: 'disc',
      sizeMeans: 'events in that country',
      colorMeans: 'mean Goldstein severity',
      swatches: warSwatches,
    });
  }
  if (displacementSwatches.length) {
    entries.push({
      layerId: CONFLICT_DISPLACEMENT_LEGEND_ID,
      layer: 'Conflict Zones — displacement',
      shapeMeans: 'ring',
      sizeMeans: 'people displaced (UNHCR)',
      // No colorMeans: these marks are one colour, so colour carries nothing.
      // The swatch says what that colour is; claiming a meaning would invent one.
      swatches: displacementSwatches,
    });
  }
  return entries;
}

export function useConflictZones3D({ enabled, scene, config, view = 'events', markStyle = 'icon' }: UseConflictZonesParams) {
  // Withdrawn when the layer is off — see useDiplomaticEvents3D for why two effects.
  useEffect(() => {
    if (enabled) return;
    publishLegend(CONFLICT_ZONE_LEGEND_ID, null);
    publishLegend(CONFLICT_DISPLACEMENT_LEGEND_ID, null);
  }, [enabled]);
  useEffect(() => () => publishLegend('ConflictZones', null), []);

  // Both sources' errors used to be dropped here — see useDiplomaticEvents3D. For this
  // layer that was the false "all quiet" the GDELT service's own header warns against.
  const war = useRealConflictEvents(enabled && config.layerTypes.warEvents);
  // What is shown of the day: the shared time's to say, as for Diplomacy (D-E; D-DP, DP15).
  const { span, window: pausedWindow, coverage } = useGdeltSpan({ from: war.from, asOf: war.asOf });
  const displacement = useRealDisplacementData(enabled && config.layerTypes.humanitarianCrisis);
  const warEvents = war.events;
  const displacementRecords = displacement.records;
  const dataError = [
    config.layerTypes.warEvents && war.error ? `GDELT: ${war.error}` : null,
    config.layerTypes.humanitarianCrisis && displacement.error ? `UNHCR: ${displacement.error}` : null,
  ].filter(Boolean).join('; ') || null;
  const dataLoading = (config.layerTypes.warEvents && war.loading) || (config.layerTypes.humanitarianCrisis && displacement.loading);

  const buildContent = useCallback(async () => {
    const centroids = await nationalTerritoriesService.getCountryCentroids();
    const newGroup = new THREE.Group();

    const warSwatches: LegendSwatch[] = [];
    const displacementSwatches: LegendSwatch[] = [];
    // Each event at its own place is drawn by useConflictEventMarks; this group keeps the countries' tallies.
    if (config.layerTypes.warEvents && view === 'countries') {
      // The snapshot's own day live, the shared window paused — see useDiplomaticEvents3D.
      const filtered = span ? warEvents.filter((e) => withinSpan(e, span)) : [];
      const warMarks = buildWarEventMarkers(filtered, centroids, config.markerSize);
      if (warMarks) {
        newGroup.add(warMarks);
        warSwatches.push(...(warMarks.userData.legendSwatches ?? []) as LegendSwatch[]);
      }
    }

    if (config.layerTypes.humanitarianCrisis) {
      const displacementMarks = buildHumanitarianCrisisMarkers(displacementRecords, centroids, config.markerSize);
      if (displacementMarks) {
        newGroup.add(displacementMarks);
        displacementSwatches.push(...(displacementMarks.userData.legendSwatches ?? []) as LegendSwatch[]);
      }
    }

    /*
     * One key per dataset. Withdrawn by id, so a sub-layer turned off takes its
     * own entry with it and leaves the other standing — the single key this
     * replaced described displacement whether or not it was drawn.
     */
    const entries = conflictZoneLegends(warSwatches, displacementSwatches);
    // The war events are the snapshot's: said when a paused window reaches past its day.
    const note = snapshotDayNote(coverage, { from: war.from, asOf: war.asOf }, pausedWindow);
    for (const id of [CONFLICT_ZONE_LEGEND_ID, CONFLICT_DISPLACEMENT_LEGEND_ID]) {
      const entry = entries.find((e) => e.layerId === id) ?? null;
      // A bare line when no war event is drawn: an empty globe there is not a quiet day (DP15).
      const published = id === CONFLICT_ZONE_LEGEND_ID && config.layerTypes.warEvents && view === 'countries' && note
        ? { ...(entry ?? { layerId: id, layer: 'Conflict Zones — armed conflict', swatches: [] }), when: note }
        : entry;
      publishLegend(id, published);
    }

    return newGroup;
  }, [config.layerTypes, config.markerSize, warEvents, war.asOf, war.from, span, pausedWindow, coverage, displacementRecords, view]);

  // Each event at its own place, in the rail's mark (plan B1).
  const eventsInSpan = useMemo(() => (span ? warEvents.filter((e) => withinSpan(e, span)) : []), [warEvents, span]);
  useConflictEventMarks({
    scene,
    active: enabled && config.layerTypes.warEvents && view === 'events',
    events: eventsInSpan,
    style: markStyle,
    note: snapshotDayNote(coverage, { from: war.from, asOf: war.asOf }, pausedWindow),
  });

  const { loading, error } = useSimpleGeoOverlayLayer({
    enabled,
    scene,
    compareLayer: 'ConflictZones',
    layerId: 'geopolitical-conflict-zones',
    // Above the country fills (95) — see useDiplomaticEvents3D.ts's note.
    layerOrder: 192,
    buildContent
  });

  return {
    loading,
    error: error ?? dataError,
    dataLoading,
    /** GDELT war events' time; null when that sub-layer is off or not yet loaded. */
    warEventsAsOf: config.layerTypes.warEvents ? war.asOf : null,
    warEventsError: config.layerTypes.warEvents ? war.error : null,
    warEventsLoading: config.layerTypes.warEvents && war.loading,
    displacementError: config.layerTypes.humanitarianCrisis ? displacement.error : null,
    displacementLoading: config.layerTypes.humanitarianCrisis && displacement.loading,
  };
}
