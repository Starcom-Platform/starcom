// src/utils/intelReportPriority.ts
// Shared priority classification for IntelReportOverlayMarker, derived from tags.
//
// Three independent copies of this logic previously existed (IntelReportTooltip.tsx,
// IntelReportPopup.tsx, and IntelReport3DPreview.tsx, retired 2026-10-08) with different matching semantics —
// exact tag membership in two of them, case-insensitive substring in the third. This
// is the one used for the new settings-driven priority filter (Globe.tsx); the three
// display components still have their own copies and were left alone to keep this
// change scoped to the filter, not a wider display-logic unification.

import type { IntelReportOverlayMarker } from '../interfaces/IntelReportOverlay';
import { normalizeTag } from './normalizeTag';
import { normalizeReportPriority } from '../services/intel/reportPriority';

// 'unset' is a real member, not a placeholder: it means nobody stated a
// priority, which is a different claim from someone stating a low one.
//
// This used to fall through to 'low', and the globe's default filter has
// showLow: false — so every report the app creates for itself was invisible on
// its own globe, with no signal. The context menu tags ['user-created',
// 'context-menu'], the offline path tags ['location', 'offline'], and Nostr
// ingest tags by relay; none of those is a priority. Same discipline as
// correlationUtils' isMock: unmeasured is not the same claim as measured.
//
// Note 'low' had NO explicit tag check before this — it existed solely as the
// fallthrough, so showLow has never once meant "someone said low". The LOW tag
// check below gives the vocabulary its missing member rather than adding a new
// one.
export type IntelReportPriority = 'critical' | 'high' | 'medium' | 'low' | 'unset';

/*
 * ─── THE CASE THIS COMPARED IN, AND WHY IT MADE THE FILTER DECORATIVE ──────
 *
 * This matched exact UPPERCASE membership. The ingest's hashtag collector
 * lowercases every hashtag it reads, and reportToMarker merges the author's
 * hashtags into the marker's tags — so a Nostr post tagged #CRITICAL arrived
 * here as `critical` and classified as `unset`. The four upper tiers had never
 * once fired on a report from the network, and showUnset was the only reason any
 * of them were drawn. Nothing in the tree emits an uppercase priority tag from
 * code; the only way to produce one was to type it by hand into a tag field,
 * which is also the only way anyone could have noticed.
 *
 * Every test here passed uppercase tags, so the suite agreed with the bug.
 *
 * Normalisation is shared with the ingest now (see normalizeTag) rather than
 * written twice, because two normalisers that disagreed is what this was.
 *
 * Still EXACT membership after normalising, never substring: the tree already
 * carries 'critical-infrastructure' (caseDataGenerator) and 'high-value'
 * (intelDataStore fixtures), and neither is a priority.
 */
export function getIntelReportPriority(report: Pick<IntelReportOverlayMarker, 'tags' | 'priority'>): IntelReportPriority {
  // What its author stated comes first (plan item 1.9). Tags are how a peer's
  // report says it, and a guess for ours.
  const stated = normalizeReportPriority(report.priority);
  if (stated) return stated.toLowerCase() as IntelReportPriority;

  const tags = new Set((report.tags || []).map(normalizeTag));

  if (tags.has('urgent') || tags.has('critical')) {
    return 'critical';
  }
  if (tags.has('high')) {
    return 'high';
  }
  if (tags.has('medium')) {
    return 'medium';
  }
  if (tags.has('low')) {
    return 'low';
  }
  return 'unset';
}
