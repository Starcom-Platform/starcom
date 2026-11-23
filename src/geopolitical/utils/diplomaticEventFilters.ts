// diplomaticEventFilters.ts — pure filtering logic for DiplomaticEvents, kept apart from
// the THREE-touching hook (useDiplomaticEvents3D.ts) for the same reason
// resourceZoneTheme.ts's pure functions live apart from useResourceZones3D.ts: trivially
// unit-testable, no THREE/DOM dependency.
//
// There was a Goldstein floor here, 'medium' for everyone and set by nothing, and a regions
// list that filtered nothing. Goldstein scores a type of event, "not the specifics of the
// actual event record" (GDELT's codebook), so the floor hid 90% of consultations and almost
// all diplomatic cooperation and none of the rest: a category filter no one could see. Gone
// with D-DP's DP9; the filters below each say what they keep (DP10).
import type { GeoPoliticalConfig } from '../../hooks/useGeoPoliticalSettings';
import type { RealGdeltEvent } from '../../services/geopolitical/GDELTEventService';
import { categorizeGdeltEvent, DIPLOMATIC_CATEGORIES, type DiplomaticEventCategory } from '../theme/diplomaticEventTheme';
import { storyOutlets } from './diplomaticStories';
import { withinSpan, type TimeSpan } from './gdeltTimeSpan';

type DiplomaticConfig = GeoPoliticalConfig['diplomaticEvents'];
type Filters = DiplomaticConfig['filters'];

export const OUTLET_CHOICES = [1, 2, 5] as const;
export const SAID_OR_DONE_CHOICES = ['both', 'said', 'done'] as const;
export const CONFIDENCE_CHOICES = [0, 50, 80] as const;

export function eventTypeEnabled(
  event: RealGdeltEvent,
  eventTypes: DiplomaticConfig['eventTypes']
): boolean {
  const category = categorizeGdeltEvent(event.eventRootCode, event.eventCode);
  // Outside the cooperative roots, no toggle shows it.
  return category !== null && eventTypes[category] === true;
}

/**
 * GDELT's QuadClass, from the CAMEO root: 01–05 verbal cooperation, what was said (a formal
 * agreement signed, 057, is root 05's); 06–08 material cooperation, what was done.
 */
export function saidOrDoneOf(category: DiplomaticEventCategory): 'said' | 'done' {
  return category === 'material' || category === 'aid' || category === 'yield' ? 'done' : 'said';
}

/**
 * The filters on one event, its story's outlets already counted. A confidence or lead paragraph
 * GDELT did not give is unknown, and an unknown never passes a filter that asks for it.
 */
function filtersPass(event: RealGdeltEvent, filters: Filters, outlets: number): boolean {
  const category = categorizeGdeltEvent(event.eventRootCode, event.eventCode);
  if (!category) return false;
  if (filters.saidOrDone !== 'both' && saidOrDoneOf(category) !== filters.saidOrDone) return false;
  if (outlets < filters.minOutlets) return false;
  if (filters.minConfidence > 0 && !((event.confidence ?? -1) >= filters.minConfidence)) return false;
  if (filters.leadOnly && event.lead !== true) return false;
  return true;
}

/**
 * The events in the span shown (gdeltTimeSpan.ts: the snapshot's day in live mode, the shared window
 * when paused), each with its story's outlets, counted in that span. No span yet, no events.
 */
function inWindow(events: readonly RealGdeltEvent[], span: TimeSpan | null) {
  const windowed = span ? events.filter((event) => withinSpan(event, span)) : [];
  return { windowed, outlets: storyOutlets(windowed) };
}

export function filterDiplomaticEvents(
  events: RealGdeltEvent[],
  config: DiplomaticConfig,
  span: TimeSpan | null,
): RealGdeltEvent[] {
  const { windowed, outlets } = inWindow(events, span);
  return windowed.filter((event) =>
    eventTypeEnabled(event, config.eventTypes) && filtersPass(event, config.filters, outlets.get(event.id) ?? 1));
}

export interface DiplomaticFilterCounts {
  categories: Record<DiplomaticEventCategory, number>;
  minOutlets: Record<typeof OUTLET_CHOICES[number], number>;
  saidOrDone: Record<typeof SAID_OR_DONE_CHOICES[number], number>;
  minConfidence: Record<typeof CONFIDENCE_CHOICES[number], number>;
  lead: { any: number; only: number };
  /** How many of the window's events GDELT gave a confidence and a lead paragraph for: none, and neither is offered. */
  known: { confidence: number; lead: number };
}

/**
 * How many events each choice keeps, as if it were chosen and the others stayed as they are
 * (DP10): a kind of event turned off is counted as what turning it on would show.
 */
export function diplomaticFilterCounts(
  events: readonly RealGdeltEvent[],
  config: DiplomaticConfig,
  span: TimeSpan | null,
): DiplomaticFilterCounts {
  const { windowed, outlets } = inWindow(events, span);
  const counts: DiplomaticFilterCounts = {
    categories: Object.fromEntries(DIPLOMATIC_CATEGORIES.map((c) => [c, 0])) as DiplomaticFilterCounts['categories'],
    minOutlets: { 1: 0, 2: 0, 5: 0 },
    saidOrDone: { both: 0, said: 0, done: 0 },
    minConfidence: { 0: 0, 50: 0, 80: 0 },
    lead: { any: 0, only: 0 },
    known: { confidence: 0, lead: 0 },
  };
  for (const event of windowed) {
    const category = categorizeGdeltEvent(event.eventRootCode, event.eventCode);
    if (!category) continue;
    const told = outlets.get(event.id) ?? 1;
    if (event.confidence !== undefined) counts.known.confidence += 1;
    if (event.lead !== undefined) counts.known.lead += 1;
    const shown = config.eventTypes[category] === true;
    if (filtersPass(event, config.filters, told)) counts.categories[category] += 1;
    if (!shown) continue;
    for (const minOutlets of OUTLET_CHOICES) {
      if (filtersPass(event, { ...config.filters, minOutlets }, told)) counts.minOutlets[minOutlets] += 1;
    }
    for (const saidOrDone of SAID_OR_DONE_CHOICES) {
      if (filtersPass(event, { ...config.filters, saidOrDone }, told)) counts.saidOrDone[saidOrDone] += 1;
    }
    for (const minConfidence of CONFIDENCE_CHOICES) {
      if (filtersPass(event, { ...config.filters, minConfidence }, told)) counts.minConfidence[minConfidence] += 1;
    }
    if (filtersPass(event, { ...config.filters, leadOnly: false }, told)) counts.lead.any += 1;
    if (filtersPass(event, { ...config.filters, leadOnly: true }, told)) counts.lead.only += 1;
  }
  return counts;
}
