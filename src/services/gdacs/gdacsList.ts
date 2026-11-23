/**
 * GDACS's event list (Global Disaster Alert and Coordination System, gdacs.org): real, live, keyless and CORS-open,
 * every hazard it tracks in one feed, each event a centroid with GDACS's own alert (green, orange, red). Read by the
 * Eco Disasters feed for floods, droughts and cyclones (GeoEventsDataProvider), and by watches for any of its five
 * hazards (D-WL, WL7): one reading of it, here.
 */
import type { NaturalEvent } from '../data-management/providers/GeoEventsDataProvider';

export const GDACS_LIST_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';

/** GDACS's hazards other than quakes (USGS's are read for those): floods, droughts, cyclones, volcanoes, wildfires. */
export type GdacsHazardType = 'FL' | 'DR' | 'TC' | 'VO' | 'WF';
export const GDACS_HAZARD_TYPES: readonly GdacsHazardType[] = ['FL', 'DR', 'TC', 'VO', 'WF'];

export interface GdacsFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    eventid: number;
    episodeid?: number;
    eventtype: string;
    name: string;
    country?: string;
    fromdate: string;
    todate: string;
    // Green/Orange/Red — GDACS's own real severity/impact classification, more
    // meaningful across hazard types than any single numeric "magnitude" would be.
    alertlevel: 'Green' | 'Orange' | 'Red';
    alertscore: number;
    severitydata?: { severity: number; severitytext: string; severityunit: string };
    // Real, ready-made per-event geometry URL GDACS includes in every list-feed
    // feature (verified directly) — flood/drought affected-area polygons, cyclone
    // forecast tracks/wind-bands/cone-of-uncertainty. The list feed itself only ever
    // carries a bare centroid point; this is a second, on-demand fetch (see
    // GdacsGeometryService.ts), not something transformed here.
    url?: { geometry?: string; report?: string };
  };
}

export interface GdacsResponse {
  type: 'FeatureCollection';
  features: GdacsFeature[];
}

/** Each hazard as Eco Disasters names its kind. */
export const GDACS_TYPE_TO_HAZARD: Record<GdacsHazardType, string> = {
  FL: 'flood',
  DR: 'drought',
  TC: 'hurricane',
  VO: 'volcano',
  WF: 'wildfire',
};

export const GDACS_ALERT_TO_SEVERITY: Record<GdacsFeature['properties']['alertlevel'], 'minor' | 'major' | 'catastrophic'> = {
  Green: 'minor',
  Orange: 'major',
  Red: 'catastrophic',
};

/** An alert's rank, least first: green 0, orange 1, red 2. */
export const GDACS_ALERT_RANK: Record<GdacsFeature['properties']['alertlevel'], number> = { Green: 0, Orange: 1, Red: 2 };

/** An event's page, when its feed gives one: a field it left out stays out. */
const pageOf = (url: unknown): { sourceUrl?: string } =>
  (typeof url === 'string' && url.trim() ? { sourceUrl: url.trim() } : {});

/** The list's events of the hazards asked for, each as Eco Disasters reads an event; one with no place is passed over. */
export function gdacsEvents(features: readonly GdacsFeature[], types: readonly GdacsHazardType[]): NaturalEvent[] {
  return features
    .filter((f) => (types as readonly string[]).includes(f.properties?.eventtype))
    .reduce<NaturalEvent[]>((acc, feature) => {
      const [lng, lat] = feature.geometry?.coordinates ?? [];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return acc;
      const props = feature.properties;
      acc.push({
        id: `gdacs-${props.eventid}`,
        lat: lat as number,
        lng: lng as number,
        type: GDACS_TYPE_TO_HAZARD[props.eventtype as GdacsHazardType],
        // GDACS severity scales are wildly different per hazard type (cyclone wind
        // speed in km/h, wildfire area in hectares, earthquake magnitude) and aren't
        // comparable on one numeric axis — deliberately not passed through as
        // `magnitude`. The human-readable severitytext carries the real value instead.
        intensity: props.severitydata?.severity,
        status: props.alertlevel,
        timestamp: props.todate || props.fromdate,
        description: props.severitydata?.severitytext ? `${props.name} — ${props.severitydata.severitytext}` : props.name,
        source: 'GDACS',
        severityOverride: GDACS_ALERT_TO_SEVERITY[props.alertlevel],
        gdacsEventId: props.eventid,
        gdacsGeometryUrl: props.url?.geometry,
        ...pageOf(props.url?.report),
      });
      return acc;
    }, []);
}
