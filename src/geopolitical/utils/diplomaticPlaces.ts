/**
 * Places (decision D-DP, DP2, DP3, DP14): one per place GDELT states, gathering every cooperative
 * event it put there. A place is its point and how precisely GDELT placed it (diplomaticStories.ts's
 * placeKeyOf), so one city spelled two ways is one place, and a country's centroid is not the city
 * that happens to stand at it.
 *
 * Diplomacy drew one mark per actor country, at its centre, and never used where an event happened:
 * 331 events in a day stood at the middle of the United States, and Moscow's 535 at Russia's.
 */
import type { GeoPrecision, RealGdeltEvent } from '../../services/geopolitical/gdeltEventExport';
import { categorizeGdeltEvent, DIPLOMATIC_CATEGORIES, type DiplomaticEventCategory } from '../theme/diplomaticEventTheme';
import { gatherStories, outletOf, placeKeyOf } from './diplomaticStories';

export interface DiplomaticPlace {
  key: string;
  lat: number;
  lng: number;
  /** As most of its events spell it; its point where none was kept. */
  name: string;
  precision: GeoPrecision | null;
  /** GDELT placed these events at a country, for want of a city (ActionGeo_Type 1). */
  countryOnly: boolean;
  events: RealGdeltEvent[];
  /** The stories told here (diplomaticStories.ts). */
  stories: number;
  /** The distinct outlets that told them: what a place is ranked by (DP9). */
  outlets: number;
  byCategory: Record<DiplomaticEventCategory, number>;
  dominantCategory: DiplomaticEventCategory;
  dominantCount: number;
}

/** The cooperative events, gathered into places, the most widely told first. */
export function gatherPlaces(events: readonly RealGdeltEvent[]): DiplomaticPlace[] {
  const groups = new Map<string, RealGdeltEvent[]>();
  for (const event of events) {
    if (!categorizeGdeltEvent(event.eventRootCode, event.eventCode)) continue;
    const key = placeKeyOf(event);
    const group = groups.get(key);
    if (group) group.push(event); else groups.set(key, [event]);
  }
  const places = [...groups.entries()].map(([key, here]): DiplomaticPlace => {
    const byCategory = Object.fromEntries(DIPLOMATIC_CATEGORIES.map((c) => [c, 0])) as Record<DiplomaticEventCategory, number>;
    const spellings = new Map<string, number>();
    const outlets = new Set<string>();
    let unnamed = false;
    for (const event of here) {
      byCategory[categorizeGdeltEvent(event.eventRootCode, event.eventCode)!] += 1;
      if (event.placeName) spellings.set(event.placeName, (spellings.get(event.placeName) ?? 0) + 1);
      const outlet = outletOf(event.sourceUrl);
      if (outlet) outlets.add(outlet); else unnamed = true;
    }
    // Ties go to the earlier kind in CAMEO's order, and the earlier spelling: the same input, the same place.
    const dominantCategory = DIPLOMATIC_CATEGORIES.reduce((best, c) => (byCategory[c] > byCategory[best] ? c : best));
    const name = [...spellings.entries()].reduce<[string, number] | null>((best, s) => (!best || s[1] > best[1] ? s : best), null)?.[0];
    const first = here[0];
    return {
      key,
      lat: first.lat,
      lng: first.lng,
      name: name ?? `${first.lat.toFixed(2)}, ${first.lng.toFixed(2)}`,
      precision: first.placePrecision ?? null,
      countryOnly: first.placePrecision === 'country',
      events: here,
      stories: gatherStories(here).length,
      // An article whose outlet GDELT did not name was still told by someone.
      outlets: Math.max(outlets.size + (unnamed && outlets.size === 0 ? 1 : 0), 1),
      byCategory,
      dominantCategory,
      dominantCount: byCategory[dominantCategory],
    };
  });
  return places.sort((a, b) => b.outlets - a.outlets || b.events.length - a.events.length || a.key.localeCompare(b.key));
}
