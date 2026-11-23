export type RLSHGeoConfidence = 'exact' | 'city' | 'region' | 'country' | 'unknown';

/**
 * `geoConfidence` as a radius in metres, for `formatCoordinate`.
 *
 * ─── THE POPUP CONTRADICTED ITSELF ─────────────────────────────────────────
 *
 * RLSHPopup displays this confidence as a badge in three places — so it told
 * the reader "City" — and printed the coordinate beside it with `toFixed(4)`,
 * about eleven metres. The label and the number disagreed, and the number is
 * the one people copy.
 *
 * It matters here more than almost anywhere. These markers are geocoded to a
 * city centroid: 197 of them occupy 107 distinct coordinates, so San Diego is
 * one pin standing for fourteen people. Printing that centroid to eleven
 * metres names a specific building in downtown San Diego that belongs to
 * nobody in the dataset.
 *
 * 'unknown' is treated as the COARSEST, not as the default. An unstated
 * geocode confidence on a scraped record is the least trustworthy case, and
 * sorting it anywhere but last would be reading silence as reassurance.
 */
export function rlshGeoPrecisionM(confidence: RLSHGeoConfidence): number {
  switch (confidence) {
    // Not "surveyed" — the best a third-party wiki scrape offers. ~110m.
    case 'exact': return 100;
    case 'city': return 20_000;
    case 'region': return 200_000;
    case 'country': return 1_000_000;
    case 'unknown': return 1_000_000;
  }
}
export type RLSHRoleClass = 'hero' | 'zone_guardian' | 'rescue_ranger' | 'archangel_knight';

export interface RLSHSource {
  provider: string;
  sourceId: string;
}

export interface RLSHOverlayMarker {
  schemaVersion: string;
  id: string;
  displayName: string;
  aliases?: string[];
  summary: string;
  canonicalUrl: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
  region?: string;
  city?: string;
  locationText?: string;
  updatedAt: string;
  lastVerifiedAt?: string;
  imageUrl?: string;
  symbolImageUrl?: string;
  identity?: string;
  category?: string;
  status?: string;
  team?: string[];
  affiliates?: string[];
  foes?: string;
  actions?: string;
  equipment?: string;
  abilities?: string;
  fullText?: string;
  sourceUrl?: string;
  source: RLSHSource;
  geoConfidence: RLSHGeoConfidence;
  tags: string[];
  riskFlags?: string[];
  roleClass?: RLSHRoleClass;
  roleLabel?: string;
  /** Whether roleClass was stated by the person or assumed by this app. */
  roleSource?: RLSHRoleSource;
  /** Three states — see RLSHRegistrationStatus. */
  registrationStatus?: RLSHRegistrationStatus;
  registrationApproved?: boolean;
  registrationReviewedBy?: string;
  registrationReviewedAt?: string;
  registrationNotes?: string;
  nostrNpub?: string;
  contactEmail?: string;
  socialLinks?: string[];
  contactConsent?: {
    nostr?: boolean;
    email?: boolean;
    social?: boolean;
  };
}

/**
 * Whether this person ever submitted anything, and it is THREE states.
 *
 * The popup showed `registrationApproved ? 'Approved' : 'Pending curation'`.
 * 195 of the 197 markers are scraped from wiki.rlsh.net by a third party and
 * have no registration at all, so every one of them was labelled "Pending
 * curation" — asserting a review queue they are not in and never joined, about
 * real named people who did not ask to be in this dataset.
 *
 * "Nobody submitted this" and "somebody submitted this and we have not reviewed
 * it" are different facts, and only one of them is about the person.
 */
export type RLSHRegistrationStatus = 'approved' | 'submitted' | 'none';

/**
 * Who decided this marker's role class.
 *
 * Every scraped marker is assigned `hero` because the role filter excludes a
 * marker with no roleClass — so the class has to be set for the globe to draw
 * it at all. But displaying it plainly presents our default as the person's own
 * claim. The filter keeps working; the popup now says which it is.
 */
export type RLSHRoleSource = 'registered' | 'assumed';

export interface RLSHMarkerQueryOptions {
  limit?: number;
  roleFilter?: RLSHRoleClass | 'all';
  /**
   * Which memberships to include. Defaults to 'all'.
   *
   * The embedded set is 40 Active, 121 Inactive, 19 Retired, 9 Unknown, 4
   * Semi-Active and 4 Deceased — and every one of them draws the same pin. A
   * viewer counts the markers and reads the movement as five times its current
   * size, which is the sort of thing a map should not say by accident.
   *
   * 'all' stays the default because hiding 121 people would be its own
   * distortion: they are the movement's history, not noise. What the interface
   * owes a reader is the ABILITY to ask, and a count — see statusBreakdown().
   */
  statusFilter?: 'active' | 'all';
}
