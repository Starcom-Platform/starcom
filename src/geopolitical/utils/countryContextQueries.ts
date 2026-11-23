// countryContextQueries.ts — pure "what's active for country X right now"
// queries bridging Piece 2's info popup to Piece 4/5's config-filtered
// overlay data (Plan D: Selection-to-Context Bridge). Deliberately query the
// CURRENTLY APPLIED config/filter state, not the raw sample arrays — a
// country's resource type or event list here must match what's actually
// rendered in the 3D scene (respecting active resourceTypes toggles,
// zoneOpacity, eventTypes and the filters, the shared time), or the popup could
// claim something is present that the user has toggled off and can't see.
import { pickRealResourceType, type ResourceType, type CountryResourceRank } from '../theme/resourceZoneTheme';
import { filterDiplomaticEvents } from './diplomaticEventFilters';
import type { TimeSpan } from './gdeltTimeSpan';
import type { RealGdeltEvent } from '../../services/geopolitical/GDELTEventService';
import type { GeoPoliticalConfig } from '../../hooks/useGeoPoliticalSettings';

/**
 * The resource type ResourceZones would currently assign to this country —
 * the exact same real-percentile selection buildResourceZoneFills itself uses — or
 * null if zoneOpacity is 0, no resource types are active, or the country has no real
 * data for any active type (in all three cases nothing renders for this country in
 * the 3D scene either). `percentilesByCountry` must be the same real data the 3D
 * layer built its fills from — see useResourceZones3D.ts — so this popup never
 * claims a resource type the scene isn't actually showing.
 */
export function getActiveResourceTypeForCountry(
  countryCode: string,
  config: GeoPoliticalConfig['resourceZones'],
  percentilesByCountry: Map<string, CountryResourceRank[]>
): ResourceType | null {
  if (config.zoneOpacity <= 0) return null;
  const activeTypes = (Object.keys(config.resourceTypes) as ResourceType[]).filter((t) => config.resourceTypes[t]);
  return pickRealResourceType(countryCode, activeTypes, percentilesByCountry);
}

/**
 * Every currently-filtered real diplomatic event involving this country — reuses
 * filterDiplomaticEvents, the exact function useDiplomaticEvents3D itself calls, so a
 * change to the kinds, the filters or the shared time here always matches what's actually rendered
 * in the scene. `realEvents` must be the same real GDELT data the 3D layer built its
 * markers from (see useDiplomaticEvents3D.ts) — mirrors how getActiveResourceTypeForCountry
 * takes percentilesByCountry as a parameter rather than importing sample data directly.
 */
export function getActiveEventsForCountry(
  countryCode: string,
  config: GeoPoliticalConfig['diplomaticEvents'],
  realEvents: RealGdeltEvent[],
  /** The span the globe shows (useGdeltSpan): the snapshot's day live, the shared window paused. */
  span: TimeSpan | null,
): RealGdeltEvent[] {
  return filterDiplomaticEvents(realEvents, config, span).filter(
    (event) => event.actor1ISO3 === countryCode || event.actor2ISO3 === countryCode
  );
}
