import type { Event } from '../../../applications/intelanalyzer/adapters/eventsAdapter';

/**
 * The one way to read an Event's weight, and the guard against comparing two
 * numbers that are on the same scale but do not mean the same thing.
 *
 * The correlation engine compares confidences across events —
 * `computeLocationConflicts` takes `min(a.confidence, b.confidence)` as
 * conflict strength, for instance. Once observations (weight derived from
 * source reliability, method and age) sit alongside Reports (confidence
 * possibly typed in by an analyst), that comparison silently mixes a
 * measurement with an opinion. Both are numbers in 0..1 and nothing about the
 * result looks wrong, which is what makes it dangerous rather than merely
 * imprecise.
 *
 * This does not refuse to compare them — refusing would break analysis that
 * legitimately spans both. It makes the mixing VISIBLE, so a UI can mark it
 * and II.B can retire declared weight from the wire knowing where it is used.
 */

/** Used when an event carries no confidence at all. Matches the engine's own default. */
export const DEFAULT_WEIGHT = 0.5;

export interface EventWeight {
  value: number;
  /** 'unknown' means the event predates basis tracking — not that it is derived. */
  basis: 'derived' | 'declared' | 'unknown';
}

export function weightOf(event: Pick<Event, 'confidence' | 'confidenceBasis' | 'sourceType'>): EventWeight {
  const value = event.confidence ?? DEFAULT_WEIGHT;

  if (event.confidenceBasis) return { value, basis: event.confidenceBasis };
  // Observations are always derived by construction — observationsToEvents is
  // the only thing that makes them, and it always stamps the basis.
  if (event.sourceType === 'OBSERVATION') return { value, basis: 'derived' };
  // Everything else predates basis tracking. Reporting 'unknown' is honest;
  // guessing 'declared' would assert something never recorded.
  return { value, basis: 'unknown' };
}

/**
 * True when a set of events mixes derived and declared weights.
 *
 * The intended caller is a UI that needs to say "this comparison spans two
 * kinds of number" — an absent warning must mean "checked and homogeneous",
 * not "never looked".
 */
export function hasMixedWeightBasis(events: Array<Pick<Event, 'confidence' | 'confidenceBasis' | 'sourceType'>>): boolean {
  const seen = new Set(events.map(e => weightOf(e).basis));
  seen.delete('unknown');
  return seen.size > 1;
}
