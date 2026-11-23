// diplomaticEventTheme.ts — pure color/scale/categorization logic for DiplomaticEvents
// markers, kept apart from the THREE-touching hook (useDiplomaticEvents3D.ts) for the
// same reason resourceZoneTheme.ts's pure functions live apart from useResourceZones3D.ts:
// trivially unit-testable, no THREE/DOM dependency.
import { en } from '../../i18n/app/en';
import { SEMANTIC } from '../../styles/tokens';

// Real GDELT events carry a CAMEO code (published GDELT 2.0 Event Codebook), and the
// cooperative roots GDELTEventService loads, 03-08, are each a category here, in CAMEO's
// order (decision D-DP, DP4). EventCode '057' ("Sign formal agreement") is its own, ahead
// of the rest of root 05. Until DP4 only 057, 04 and 06 were drawn, keyed treaty, summit and
// tradeAgreement; roots 03, 07 and 08, and 05 but for 057, were loaded and dropped.
export const DIPLOMATIC_CATEGORIES = ['intent', 'consult', 'diplomatic', 'agreement', 'material', 'aid', 'yield'] as const;
export type DiplomaticEventCategory = typeof DIPLOMATIC_CATEGORIES[number];

const CATEGORY_BY_ROOT: Readonly<Record<string, DiplomaticEventCategory>> = {
  '03': 'intent',     // Express intent to cooperate
  '04': 'consult',    // Consult: calls, visits, meetings, negotiation
  '05': 'diplomatic', // Engage in diplomatic cooperation: praise, recognition, apology
  '06': 'material',   // Engage in material cooperation: economic, military, intelligence
  '07': 'aid',        // Provide aid
  '08': 'yield',      // Yield: ease sanctions, release, de-escalate
};

/** An event's category by its CAMEO code; null outside the cooperative roots. */
export function categorizeGdeltEvent(eventRootCode: string, eventCode: string): DiplomaticEventCategory | null {
  if (eventCode === '057') return 'agreement';
  return Object.prototype.hasOwnProperty.call(CATEGORY_BY_ROOT, eventRootCode) ? CATEGORY_BY_ROOT[eventRootCode] : null;
}

// Cool colours for the words and meetings, warm for what changes hands, none of them the
// reds Conflict Zones draws in.
const EVENT_CATEGORY_COLORS: Record<DiplomaticEventCategory, number> = {
  intent: 0x9fb4d8,     // slate — said, not yet done
  consult: 0x00d4ff,    // cyan — a call, a visit, a meeting
  diplomatic: 0x6f8cff, // blue — praise, recognition, apology
  agreement: 0x33dd88,  // green — signed
  material: 0xffcc00,   // amber — economic, military, intelligence
  aid: 0xc39bff,        // violet — given
  yield: 0xd9f27a,      // lime — eased, released
};

/**
 * What each category is called, in CAMEO's terms, in English: the catalogue's (D-ML), where
 * every language has them. They were called Treaty, Summit and Trade Cooperation: any formal
 * agreement signed was a treaty, a phone call was a summit, and material cooperation, military
 * and intelligence included, was trade (critique audit of 2026-10-01, section 11). `one` names
 * a single event; `many` a filter or a key line; `words` the lower-case run of a sentence.
 */
export const DIPLOMATIC_CATEGORY_NAMES = en.diplomacy.categories;

export function diplomaticEventColor(category: DiplomaticEventCategory): number {
  return EVENT_CATEGORY_COLORS[category];
}

// A single neutral accent for all event connection arcs — distinct from the per-category
// marker colors at either end (mirrors the existing selection-halo color, 0x88bbff,
// already used elsewhere in this codebase). Connections read as "these two are linked";
// markers carry the "what kind" signal.
export const DIPLOMATIC_CONNECTION_COLOR = 0x88bbff;

/**
 * A selected country's conflict with a counterpart (D-DP, DP5): CAMEO 14–20 from the same snapshot,
 * in the app's colour for danger, beside the cooperation arcs' DIPLOMATIC_CONNECTION_COLOR.
 */
export const DIPLOMATIC_CONFLICT_COLOR = parseInt(SEMANTIC.danger.slice(1), 16);
