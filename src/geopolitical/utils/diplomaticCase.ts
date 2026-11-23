/**
 * A case started from a Diplomacy event (decision D-DP, DP7): named for its two countries and what
 * CAMEO calls the event, resting on its story's articles — the same two countries, kind and place in
 * the events in view (diplomaticStories.ts) — tagged with its countries and CAMEO code, and saying
 * where and when, its Goldstein score and that it was machine-coded from the news.
 */
import type { RealGdeltEvent } from '../../services/geopolitical/gdeltEventExport';
import { gdeltStampToMs } from '../../services/geopolitical/gdeltEventExport';
import type { CaseSourceInput } from '../../types/intel/IntelCaseUI';
import { fill, languageNow, messagesNow, numbered } from '../../i18n/app/i18n';
import { utcDateTimeIn } from '../../i18n/app/dates';
import { categorizeGdeltEvent } from '../theme/diplomaticEventTheme';
import { cameoNameOf } from '../theme/cameoCodes';
import { placeKeyOf } from './diplomaticStories';

export interface DiplomaticCaseInput {
  title: string;
  description: string;
  tags: string[];
  sources: CaseSourceInput[];
}

const pairKey = (event: RealGdeltEvent) => [event.actor1ISO3, event.actor2ISO3].sort().join('-');

export function caseFromEvent(event: RealGdeltEvent, eventsInView: readonly RealGdeltEvent[], names: ReadonlyMap<string, string>): DiplomaticCaseInput {
  const words = messagesNow().diplomacy;
  const category = categorizeGdeltEvent(event.eventRootCode, event.eventCode);
  const story = eventsInView.filter((other) => pairKey(other) === pairKey(event)
    && categorizeGdeltEvent(other.eventRootCode, other.eventCode) === category
    && placeKeyOf(other) === placeKeyOf(event));
  const told = story.length ? story : [event];
  const seen = new Set<string>();
  const sources: CaseSourceInput[] = [];
  for (const each of told) {
    if (seen.has(each.sourceUrl)) continue;
    seen.add(each.sourceUrl);
    const at = gdeltStampToMs(each.dateAdded);
    sources.push({ url: each.sourceUrl, ...(at !== null ? { reportedAt: new Date(at).toISOString() } : {}) });
  }
  const first = Math.min(...told.map((each) => gdeltStampToMs(each.dateAdded) ?? Number.POSITIVE_INFINITY));
  const pair = fill(words.pair, { a: names.get(event.actor1ISO3) ?? event.actor1ISO3, b: names.get(event.actor2ISO3) ?? event.actor2ISO3 });
  const name = cameoNameOf(event.eventCode)?.name ?? `CAMEO ${event.eventCode}`;
  return {
    title: fill(words.caseTitle, { pair, name }),
    description: fill(words.caseDescription, {
      pair, code: event.eventCode, name,
      place: event.placeName ?? `${event.lat.toFixed(2)}, ${event.lng.toFixed(2)}`,
      when: Number.isFinite(first) ? utcDateTimeIn(languageNow(), first, true) : '—',
      score: numbered(event.goldsteinScale),
    }),
    tags: ['diplomacy', `cameo-${event.eventCode}`, event.actor1ISO3.toLowerCase(), event.actor2ISO3.toLowerCase()],
    sources,
  };
}
