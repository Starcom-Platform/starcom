/**
 * Stories, and how many outlets told each (decision D-DP, DP9).
 *
 * GDELT's own counts cannot say how widely something was reported: NumSources and the rest cover
 * only "the 15 minute update in which it was first seen" (its codebook), and an event is not given
 * later mentions — GDELT makes a new event for each article. Measured on 2026-10-13, 480 of 484
 * cooperative events named one source, and 4 of 388 were mentioned again under the same id. So the
 * events of one story are gathered here, the same two countries, kind of event and place, and the
 * distinct outlets that told it are counted.
 */
import type { RealGdeltEvent } from '../../services/geopolitical/gdeltEventExport';
import { categorizeGdeltEvent, type DiplomaticEventCategory } from '../theme/diplomaticEventTheme';
import { outletOf } from '../../utils/outletOf';

export interface DiplomaticStory {
  key: string;
  /** The two countries, in order. */
  pair: readonly [string, string];
  category: DiplomaticEventCategory;
  /** The place's name, as the story's first event spells it; its point where no name was kept. */
  place: string;
  events: RealGdeltEvent[];
  /** The distinct outlets that told it, sorted. */
  outlets: string[];
}

// The site an article is on, shared with a case's sources (DP7): utils/outletOf.ts.
export { outletOf };

/**
 * Where GDELT put the event: its point and how precisely. GDELT's codebook warns that a place's name
 * varies with its spelling ("Mecca is often spelled Makkah"); the point is the place's centroid, the
 * same however it is spelled. A country's centroid is another place than a city at the same point.
 */
export function placeKeyOf(event: RealGdeltEvent): string {
  return `${event.placePrecision ?? '?'}:${event.lat.toFixed(4)},${event.lng.toFixed(4)}`;
}

/** The cooperative events, gathered into stories, in the order each story was first seen. */
export function gatherStories(events: readonly RealGdeltEvent[]): DiplomaticStory[] {
  const stories = new Map<string, DiplomaticStory & { named: Set<string>; unnamed: boolean }>();
  for (const event of events) {
    const category = categorizeGdeltEvent(event.eventRootCode, event.eventCode);
    if (!category) continue;
    const pair = [event.actor1ISO3, event.actor2ISO3].sort() as [string, string];
    const key = `${pair[0]}-${pair[1]}|${category}|${placeKeyOf(event)}`;
    let story = stories.get(key);
    if (!story) {
      story = {
        key, pair, category, place: event.placeName ?? `${event.lat.toFixed(2)}, ${event.lng.toFixed(2)}`,
        events: [], outlets: [], named: new Set(), unnamed: false,
      };
      stories.set(key, story);
    }
    story.events.push(event);
    const outlet = outletOf(event.sourceUrl);
    if (outlet) story.named.add(outlet); else story.unnamed = true;
  }
  return [...stories.values()].map(({ named, unnamed, ...story }) => ({
    ...story,
    // An article whose outlet GDELT did not name was still told by someone: one outlet, never none.
    outlets: named.size > 0 ? [...named].sort() : unnamed ? ['?'] : [],
  }));
}

/** Each cooperative event's story's outlets, by the event's id. */
export function storyOutlets(events: readonly RealGdeltEvent[]): Map<string, number> {
  const outlets = new Map<string, number>();
  for (const story of gatherStories(events)) {
    for (const event of story.events) outlets.set(event.id, story.outlets.length);
  }
  return outlets;
}
