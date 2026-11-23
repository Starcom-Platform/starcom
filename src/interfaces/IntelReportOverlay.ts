// AI-NOTE: Artifact-driven interface for Intel Report overlays and market data.
// See overlays, integration, and code audit artifacts for requirements and mapping.
// This interface is used by overlays, GlobeEngine, and UI components.


/**
 * What a marker IS, stated by whoever produced it.
 *
 * The globe's interaction layer decides which popup to open, what to call the
 * thing hovered, and whether a confidence tag applies — and it worked all three
 * out from GLOBAL VISUALIZATION MODE: `subMode === 'RLSH'` therefore this must
 * be an RLSH entity. That is backwards, and it breaks the moment two kinds of
 * marker are on the globe at once.
 *
 * Which is not hypothetical. useGlobeLayerControl already lets an operator PIN
 * a layer so it renders while another mode is primary, and every DATA renderer
 * honours pins. The interaction layer does not, so a pinned layer draws markers
 * that cannot be hovered or clicked — visible and dead. Asking the marker
 * instead of the mode is what fixes that, and it stops each new layer needing
 * its own branch in every interaction handler.
 */
export type IntelOverlayMarkerKind = 'intel' | 'rlsh';

import type { BoundedOutline } from '../services/geoint/boundedOutline';

export interface IntelReportOverlayMarker {
  pubkey: string; // Solana account pubkey (base58)
  title: string;
  content: string;
  tags: string[]; // e.g., ['SIGINT', 'HUMINT']
  /** How serious its author said it is, when stated (plan item 1.9). Read before tags. */
  priority?: import('../types/intel/IntelReportUI').IntelReportPriority;
  latitude: number;
  longitude: number;
  /**
   * The shape this was published as, bounded — see boundedOutline.
   *
   * Carried beside the coordinate, never instead of it. latitude/longitude
   * remain what places the mark, so every consumer that reads a position is
   * unaffected by a report having a shape.
   */
  outline?: BoundedOutline;
  timestamp: number; // milliseconds since the epoch — read it through markerTimeMs
  author: string; // Wallet address (base58)
  /**
   * Where its information was published, from the note's `r` tags in tag order, the original
   * first (decision D-CT, CT2). Untrusted: read through sourceLinkItems wherever it is shown.
   */
  sourceLinks?: string[];
  /** The publisher's t=names_people (decision D-NP): labelled where it is read, left out of every card and clip. */
  namesPeople?: boolean;
  /** The exact event a report read from a relay was read at, and its kind: what a review is pinned to (plan item 5.1). */
  nostrEventId?: string;
  nostrKind?: number;
  // Optional group-navigation identity, populated by producers (e.g. RLSHVisualizationService)
  // that resolve a stable entity/group key for markers sharing a location or explicit group —
  // consumed by RLSHPopupPortal-style "same group first" navigation.
  entityId?: string;
  groupId?: string;
  groupKind?: 'location' | 'explicit';
  groupVersion?: number;
  /**
   * How many markers share this marker's group, this one included.
   *
   * Without it the globe cannot tell a lone marker from a stack. 197 RLSH
   * markers occupy 107 distinct coordinates, because the source geocodes to a
   * city centroid — so San Diego is ONE pin that is fourteen people, Seattle
   * thirteen, Portland nine. Exactly one of them is clickable and the other
   * hundred and twenty are unreachable, and nothing on the globe suggests they
   * are there.
   *
   * The popup can already page through a group. This is what lets the globe say
   * a group exists in the first place.
   */
  groupSize?: number;
  /**
   * The territories a report is about as a whole, by name, when it names no
   * place in them (BA3). It stands at the first one's middle so it can be opened
   * and framed, and is said to be about them: never shown at a point.
   */
  aboutTerritories?: string[];
  /**
   * Set by the producer. Optional only so existing producers compile while they
   * are migrated one at a time; consumers must treat an absent kind as 'intel',
   * which is what every pre-existing marker was.
   */
  kind?: IntelOverlayMarkerKind;
  /*
   * ─── A `classification` FIELD STOOD HERE, AND I ADDED IT ─────────────────
   *
   * `56eddefd` added it to fix a real display bug: this DTO dropped the source
   * report's marking, so the popup guessed by scanning `tags` and falling back
   * to 'UNCLASSIFIED' — a TOP_SECRET report rendered UNCLASSIFIED beside its
   * full content. Passing the field through fixed that.
   *
   * The bug diagnosis was right; the direction was wrong. The tree had already
   * recorded that classification was leaving the product, and I had read it, so
   * the fix built honest plumbing for a scheme being removed. Stage 8 said it
   * would revert this, and this is that.
   *
   * A globe marker is also the wrong surface for handling: `visibility` governs
   * where a report may GO, which is decided at publish time — see
   * MissionService.publicRelayRefusal, which refuses the publish itself. A pin
   * on a map is not where that belongs, and the coordinate-precision work from
   * the same period (`geoPrecisionM` below) is the part of that commit that
   * protects anyone.
   */
  /**
   * Uncertainty on `latitude`/`longitude`, as a radius in metres.
   *
   * Absent means the producer did not state one — NOT that the position is
   * exact. Consumers must read it through `formatCoordinate`, which applies
   * DEFAULT_GEO_PRECISION_M in that case; see the long note on
   * `coordinateDecimalsFor` in SourceObservation.ts for why the flattering
   * reading of an absent precision is the dangerous one.
   */
  geoPrecisionM?: number;
  /**
   * Which time placed this marker (decision D-E): 'event' when its report states
   * when the event happened, 'written' when it fell back to when the report was
   * written. Absent for producers that do not say. Read it through
   * markerRecordTime (services/intel/recordTime.ts).
   */
  timeBasis?: 'event' | 'written';
  /** Where the event's stated end starts, in ms, when it was a span. */
  timeEndMs?: number;
  /** How closely the event time is known, in ms, when stated. */
  timePrecisionMs?: number;
  /**
   * When THIS app received its copy, in ms — not when the event happened and not
   * when it was written (decision D-F, step 4.4).
   *
   * Read through `reportReceivedAtMs`. Used only to say that a mark was drawn
   * from storage rather than arriving in this session; it never places a mark.
   * Absent when the producer could not tell.
   */
  receivedAtMs?: number;
}

// Example: overlays and GlobeEngine should use this interface for all live data.
// All changes must be documented in overlays artifact and referenced in code.

/**
 * What kind a marker is, with the default the consumer contract requires.
 *
 * ABSENT means 'intel', because that is what every marker was before RLSH
 * existed. Read through this rather than touching `.kind` directly: a bare
 * `marker.kind === 'rlsh'` is correct, but a bare `marker.kind === 'intel'`
 * silently misses every legacy marker, and both spellings would appear in the
 * same file within a week.
 */
export function markerKind(marker: Pick<IntelReportOverlayMarker, 'kind'> | null | undefined): IntelOverlayMarkerKind {
  return marker?.kind ?? 'intel';
}

/**
 * The same question asked of a mark the interaction layer holds.
 *
 * Each carries the marker it was drawn from, so the answer is already in hand at
 * every call site that would otherwise consult global mode state.
 */
export function modelKind(model: { report?: Pick<IntelReportOverlayMarker, 'kind'> } | null | undefined): IntelOverlayMarkerKind {
  return markerKind(model?.report);
}

/**
 * When a marker's record was last updated, in milliseconds, or null when no
 * usable time was given (zero, or not a finite number).
 *
 * `timestamp` is milliseconds. Both producers write Date.parse/getTime values
 * (reportToMarker, RLSHVisualizationService), and IntelReportVisualizationService
 * sorts and filters on it as milliseconds. The hover tooltip and the report
 * popup multiplied it by 1000 as if it were Unix seconds, which put every date
 * tens of thousands of years ahead: in the running app an RLSH record scraped
 * six months earlier showed the wrong day and "FRESH" in its tooltip, while its
 * popup said "Stale (195d)".
 */
export function markerTimeMs(marker: { timestamp?: number } | null | undefined): number | null {
  const ms = marker?.timestamp;
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : null;
}

