/**
 * Which of the four an Intel Report is (decision D-F, step 6, part 4).
 *
 * ─── THE ORDER, AND WHY IT IS THAT ORDER ───────────────────────────────────
 *
 * The author's word first: Mecha Jono assembles these reports and should be
 * able to say what one is, by tagging a post `#actionable`, `#critical` or
 * `#raw`. Then the priority ladder, which the globe's filter already reads.
 * Then Raw — not as a shrug for "could not tell", but because `unset` means
 * nobody assessed the report, which is what raw intel is.
 *
 * ─── WHAT IS DELIBERATELY NOT INFERRED ─────────────────────────────────────
 *
 * 'Actionable' never comes from a high priority. The ladder says how urgent a
 * report is, not whether anyone can act on it, and drawing one as the other
 * would put a claim on the globe that no report ever made. It comes only from
 * an author saying so.
 *
 * ─── WHAT THIS LOOKS LIKE TODAY ────────────────────────────────────────────
 *
 * Every report on the relays is `unset`, so every one is Raw. That is the
 * honest starting state rather than a defect: the marks say "nobody has
 * assessed these", which is true. The distinction appears the moment posts
 * carry a tag, and nothing here has to change for that to happen.
 */
import type { IntelReportOverlayMarker } from '../../interfaces/IntelReportOverlay';
import { getIntelReportPriority } from '../../utils/intelReportPriority';
import { normalizeTag } from '../../utils/normalizeTag';

export type IntelVariant = 'standard' | 'critical' | 'actionable' | 'raw';

/*
 * A Record over the union so the compiler enforces the list — the same
 * construction markerStyles.ts uses, and for the same reason: the sprite atlas
 * indexes by variant, so a variant missing from this list would sample nothing
 * and draw a hole.
 */
const EVERY_VARIANT: Record<IntelVariant, true> = {
  standard: true, critical: true, actionable: true, raw: true,
};

/** The four, in the order they are laid out in the sprite atlas. */
export const INTEL_VARIANTS = Object.keys(EVERY_VARIANT) as readonly IntelVariant[];

export function isIntelVariant(value: unknown): value is IntelVariant {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EVERY_VARIANT, value);
}

/**
 * The variant a marker should be drawn as.
 *
 * Exact tag membership after normalising, never substring: the tree already
 * carries `critical-infrastructure` and `high-value`, and a report about
 * critical infrastructure is not a critical report.
 */
export function intelVariantOf(marker: Pick<IntelReportOverlayMarker, 'tags' | 'priority'>): IntelVariant {
  const tags = new Set((marker.tags || []).map(normalizeTag));

  // The author's word. Critical first, so a report that is both urgent and
  // actionable is drawn as the more urgent of the two — the precedence the
  // priority ladder itself uses.
  if (tags.has('critical') || tags.has('urgent')) return 'critical';
  if (tags.has('actionable')) return 'actionable';
  if (tags.has('raw')) return 'raw';

  switch (getIntelReportPriority(marker)) {
    case 'critical':
      return 'critical';
    case 'high':
    case 'medium':
    case 'low':
      // Stated, but not urgent and not claimed actionable.
      return 'standard';
    case 'unset':
      // Nobody assessed it. That is what Raw means.
      return 'raw';
  }
}
