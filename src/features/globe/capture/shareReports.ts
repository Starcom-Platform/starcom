/**
 * Featuring one report in a capture (decision D-F, section 18, item 2).
 *
 * ─── WHAT THIS ADDS ────────────────────────────────────────────────────────
 *
 * Contract v4 could reach every layer and say nothing about one report. A card
 * named layers, a legend and caveats — never the report a post is about — so an
 * agent posting "this grant closes Friday" had to say it in its own words
 * beside an image that did not.
 *
 * This is the pure part: what an agent may learn about the reports on the
 * globe, where the camera goes to show a set of them, and what a card says
 * about the one it features.
 *
 * ─── THE RULES, AND WHY THEY ARE HERE AND NOT ONLY IN THE AGENT ────────────
 *
 * RLSH is people. Mecha Jono refuses the layer on their side; here it is never
 * listed, framed or featured, so an agent without that rule cannot reach it
 * through this door either.
 *
 * Nothing is framed below one globe radius. Several of Mecha Jono's reports
 * carry Form 990 filing addresses, and a small charity's filing address is
 * often somebody's home. At globe scale a mark is a region, not a door. They
 * enforce that in their driver; framing enforces it for every caller.
 *
 * A position is never handed out finer than a tenth of a degree, or than the
 * report was placed. The glyph is on the globe for anyone to see, so this is not
 * secrecy; it is not handing a script a street address it did not need.
 */
import { nip19 } from 'nostr-tools';
import { reportCategoryOf } from '../../../services/intel/reportCategory';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import { markerKind } from '../../../interfaces/IntelReportOverlay';
import { coordinateDecimalsFor } from '../../../types/intel/SourceObservation';
import { centreOf } from '../../../services/intel/globe/linkedRecordPlacement';
import { intelVariantOf, type IntelVariant } from '../../../components/Globe/intelVariant';
import { SPRITE_GLYPH_MEANING } from '../../../components/Globe/intelReportSprites';
import type { ReportPlace } from '../../../components/Globe/reportPlaces';
import type { RaverWatchLevel } from '../../../services/raverWatch/raverWatch';
import type { ConflictBacking } from '../../../services/warConflict/warConflictView';
import type { HeroWatchVariant } from './heroWatchReports';
import type { ConflictRole } from '../../../services/warConflict/warConflict';
import { capturable } from '../../../services/intel/namesPeople';

/** No framing comes closer than this, in globe radii above the surface. */
export const SHARE_ALTITUDE_FLOOR = 1.0;

/**
 * Nor further than this. Past it the reports are specks on a small planet, and
 * a set that needs more room than this is better posted as more than one image.
 */
export const SHARE_ALTITUDE_CEILING = 4.0;

/** Room left around the fitted reports, so a 35 px glyph at the edge is not cut. */
const FIT_MARGIN = 0.82;

/** One report, as an agent may see it. */
export interface ShareReportInfo {
  /** The Nostr event id, or the local record's id; a Raver Watch item's is `30023:<pubkey>:<d>`. */
  id: string;
  /**
   * The layer it is drawn on (contract v8): Intel Reports, one of Raver Watch's, War & Conflict (v10),
   * one of Hero Watch's (v41), whose field missions Raver Watch's Raver missions also draw, or one of Civil
   * Unrest's (v60): a day of unrest, or a protest surge.
   */
  layer: 'IntelReports' | 'DrugCheckAlerts' | 'SceneIncidents' | 'SceneEvents' | 'HeatRisk' | 'WarConflict'
    | 'Lifeboats' | 'Relief' | 'FieldMissions' | 'RaverMissions' | 'CivilUnrest' | 'ProtestSurges';
  title: string;
  /** A report's variant, a Raver Watch item's level, a War & Conflict item's backing, or a Hero Watch item's kind. */
  variant: IntelVariant | RaverWatchLevel | ConflictBacking | HeroWatchVariant | 'unrest' | 'surge';
  /** What the variant means, in the card's own words. */
  variantMeans: string;
  author: string;
  /**
   * When, and which time it is: when it happened, when it was written, or for a
   * Raver Watch item when it begins to apply. Null when the report states no time.
   */
  time: { iso: string; basis: 'event' | 'written' | 'applies' } | null;
  /** Uncertainty in metres, or null when the producer stated none. */
  precisionM: number | null;
  /** Rounded — see roundedForSharing. */
  lat: number;
  lng: number;
  /** How many other reports are drawn at the same place, under the same glyph. */
  sharesPlaceWith: number;
  /**
   * What the item says it is, where it says (contract v14): a War & Conflict
   * item's role. It decides the card's badge (decision IM14). Absent elsewhere.
   */
  role?: ConflictRole;
  /**
   * The territories an Intel Report is about as a whole, when it names no place
   * of its own (contract v26, BA3): it stands at the middle of the first, and
   * `precisionM` is how far that territory reaches. Never drawn as a pin.
   */
  territories?: Array<{ code: string; name: string }>;
  /**
   * What an Intel Report says it is about (contract v28, BA13): its stated
   * top-level `category:` word, null when it states none. Its glyph wears the
   * word's emblem (BA14). The other layers' items carry none.
   */
  category?: string | null;
  /**
   * The group an Intel Report is drawn in (contract v27, BA10): its place's, or
   * the first territory's it names. Every Intel Report is in exactly one; the
   * other layers' items carry none yet.
   */
  group?: ShareReportGroupRef;
}

/** Which group a listed Intel Report is in. */
export interface ShareReportGroupRef {
  /** `place:<the id of the report drawn for the place>` or `territory:<code>`: never a position. */
  key: string;
  kind: 'place' | 'territory';
  /** How many reports it holds, this one among them. */
  size: number;
}

/** A group of Intel Reports, as listGroups() gives it (contract v27, BA10). */
export interface ShareReportGroup {
  key: string;
  kind: 'place' | 'territory';
  size: number;
  /** The members' ids, most severe first: for a place, the first is the report drawn for it. */
  members: string[];
  /** Where it is, as its members are listed: never finer than 0.1°. */
  lat: number;
  lng: number;
  /** A territory group's territory. */
  territory?: { code: string; name: string };
}

/** Round a position to what its precision supports, and never finer than 0.1°. */
export function roundedForSharing(lat: number, lng: number, precisionM: number | undefined): { lat: number; lng: number } {
  const dp = Math.min(1, coordinateDecimalsFor(precisionM));
  const round = (v: number) => {
    const r = Number(v.toFixed(dp));
    return Object.is(r, -0) ? 0 : r;
  };
  return { lat: round(lat), lng: round(lng) };
}

/** A Nostr key as a short npub; anything else as the producer wrote it, or plainly unnamed. */
export function describeAuthor(author: string | undefined): string {
  if (!author || author === 'nostr') return 'an unnamed author';
  if (/^[0-9a-f]{64}$/i.test(author)) {
    const npub = nip19.npubEncode(author.toLowerCase());
    return `${npub.slice(0, 11)}…${npub.slice(-4)}`;
  }
  return author;
}

function timeOf(report: IntelReportOverlayMarker): ShareReportInfo['time'] {
  const ms = report.timestamp;
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  return { iso: new Date(ms).toISOString(), basis: report.timeBasis === 'event' ? 'event' : 'written' };
}

/** A report drawn, as an agent may see it: for a report about a territory too (territoryReports.ts). */
export function describeShareReport(report: IntelReportOverlayMarker, sharesPlaceWith: number, group?: ShareReportGroupRef): ShareReportInfo {
  const variant = intelVariantOf(report);
  const precisionM = typeof report.geoPrecisionM === 'number' && Number.isFinite(report.geoPrecisionM) ? report.geoPrecisionM : null;
  return {
    id: report.pubkey,
    layer: 'IntelReports',
    title: report.title,
    variant,
    variantMeans: SPRITE_GLYPH_MEANING[variant],
    author: describeAuthor(report.author),
    time: timeOf(report),
    precisionM,
    ...roundedForSharing(report.latitude, report.longitude, precisionM ?? undefined),
    sharesPlaceWith,
    category: reportCategoryOf(report.tags),
    ...(group ? { group } : {}),
  };
}

/** Every report drawn, place by place. Never an RLSH entity, nor a note that names a person (D-NP, NP2). */
export function listShareReports(places: readonly ReportPlace[]): ShareReportInfo[] {
  // Per report, not per place: a place is one kind today, and this rule should
  // not depend on that staying true.
  return places.flatMap((place) => {
    const reports = capturable(place.reports.filter((report) => markerKind(report) !== 'rlsh'));
    if (!reports.length) return [];
    // Keyed by the report drawn for the place, never by where it is (BA10).
    const group: ShareReportGroupRef = { key: `place:${reports[0].pubkey}`, kind: 'place', size: reports.length };
    return reports.map((report) => describeShareReport(report, place.reports.length - 1, group));
  });
}

const SEVERITY: Record<IntelVariant, number> = { critical: 3, actionable: 2, standard: 1, raw: 0 };
const severityOf = (report: ShareReportInfo) => SEVERITY[report.variant as IntelVariant] ?? 0;

/** Most severe first, then newest, then by id: the order a place picks the report it draws (reportPlaces.ts). */
export function membersOrder(a: ShareReportInfo, b: ShareReportInfo): number {
  const bySeverity = severityOf(b) - severityOf(a);
  if (bySeverity !== 0) return bySeverity;
  const at = (report: ShareReportInfo) => (report.time ? Date.parse(report.time.iso) : -Infinity);
  const byTime = at(b) - at(a);
  if (byTime !== 0 && Number.isFinite(byTime)) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The groups of the items listed, each once, in the order they are first listed
 * (BA10). Only Intel Reports carry a group yet; the other layers' items join
 * when they group (K8's other half, plan block G).
 */
export function groupsOfShareReports(listed: readonly ShareReportInfo[]): ShareReportGroup[] {
  const byKey = new Map<string, ShareReportInfo[]>();
  for (const report of listed) {
    if (!report.group) continue;
    const members = byKey.get(report.group.key);
    if (members) members.push(report);
    else byKey.set(report.group.key, [report]);
  }
  return [...byKey.entries()].map(([key, members]) => {
    const sorted = [...members].sort(membersOrder);
    const [first] = sorted;
    const kind = first.group!.kind;
    return {
      key,
      kind,
      size: sorted.length,
      members: sorted.map((member) => member.id),
      lat: first.lat,
      lng: first.lng,
      ...(kind === 'territory' && first.territories?.[0] ? { territory: { ...first.territories[0] } } : {}),
    };
  });
}

/**
 * A card featuring one of a group says which of how many it is (BA10), after
 * where it is: a reader cannot see the others under one glyph or one outline.
 */
export function withGroupLine(featured: FeaturedReport, listed: readonly ShareReportInfo[]): FeaturedReport {
  const self = listed.find((report) => report.id === featured.id);
  if (!self?.group || self.group.size < 2) return featured;
  const [group] = groupsOfShareReports(listed.filter((report) => report.group?.key === self.group!.key));
  const line = `${group.members.indexOf(featured.id) + 1} of ${group.size} here`;
  const where = featured.lines.findIndex((l) => l.startsWith('Near ') || l.startsWith('About '));
  const lines = [...featured.lines];
  lines.splice(where < 0 ? lines.length : where + 1, 0, line);
  return { ...featured, lines };
}

export interface FitView {
  /** The camera's vertical field of view, in degrees. */
  fovDeg: number;
  /** The captured frame's width over height. */
  frameAspect: number;
  /** The card's image area, width over height (CARD_PRESETS). */
  cardAspect: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle angle between two points, in radians. */
function angleBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The lowest altitude at which every point is on screen and on the near side,
 * looking straight down at `centre`, clamped to the floor and the ceiling.
 *
 * The card is cut from the middle of the frame at its own aspect, so the half
 * angle that matters is the tighter of what the card keeps vertically and
 * horizontally. Taken as one bound in every direction, which over-fits a spread
 * that runs along the card's long side — the safe error for a post.
 */
export function altitudeToFit(
  points: readonly { lat: number; lng: number }[],
  centre: { lat: number; lng: number },
  view: FitView,
): number {
  return Math.min(SHARE_ALTITUDE_CEILING, Math.max(SHARE_ALTITUDE_FLOOR, requiredAltitude(points, centre, view)));
}

/** The altitude these points need, unclamped: Infinity when one is past the horizon. */
export function requiredAltitude(
  points: readonly { lat: number; lng: number }[],
  centre: { lat: number; lng: number },
  view: FitView,
): number {
  const tanV = Math.tan(toRad(view.fovDeg) / 2);
  const keptV = view.cardAspect > view.frameAspect ? view.frameAspect / view.cardAspect : 1;
  const tanVertical = tanV * keptV;
  const tanHorizontal = tanV * Math.min(view.frameAspect, view.cardAspect);
  const t = Math.min(tanVertical, tanHorizontal) * FIT_MARGIN;

  // Camera distance from the centre of a unit globe. Starts at the surface: the
  // floor is applied once, by altitudeToFit, so there is one place it can go wrong.
  let distance = 1;
  for (const point of points) {
    const theta = angleBetween(centre, point);
    if (theta >= Math.PI / 2) return Infinity;
    // On screen: the point's angle off the view axis within the half angle.
    distance = Math.max(distance, Math.cos(theta) + Math.sin(theta) / t);
    // On the near side: in front of the horizon, with a little to spare.
    distance = Math.max(distance, 1.05 / Math.cos(theta));
  }
  return distance - 1;
}

/**
 * Where to put the camera to show these reports, or null when one card cannot.
 *
 * Null rather than the ceiling when they need more room than it: two reports on
 * opposite limbs "fit" at any altitude only as slivers at the edge of the planet,
 * and a card that technically contains its subject is not a card that shows it.
 */
export function frameForReports(
  points: readonly { lat: number; lng: number }[],
  view: FitView,
): { lat: number; lng: number; altitude: number } | null {
  const centre = centreOf(points.map((p) => ({ latitude: p.lat, longitude: p.lng })));
  if (!centre) return null;
  if (requiredAltitude(points, centre, view) > SHARE_ALTITUDE_CEILING) return null;
  return { lat: centre.lat, lng: centre.lng, altitude: altitudeToFit(points, centre, view) };
}

/** What a card says about the report it features. */
export interface FeaturedReport {
  id: string;
  title: string;
  /** Where the glyph is, for the card to point at. Never printed at this precision. */
  position: { lat: number; lng: number };
  /** The detail lines under the title, in order. */
  lines: string[];
}

const utcMinute = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')}Z`;

function precisionPhrase(m: number | null): string {
  if (m === null) return 'precision not stated';
  return m >= 1000 ? `placed to within ${Math.round(m / 1000)} km` : `placed to within ${Math.round(m)} m`;
}

/** The relay a report arrived from, when it came from one. */
function relayOf(report: IntelReportOverlayMarker): string | null {
  const tag = (report.tags ?? []).find((t) => t.startsWith('relay:'));
  if (!tag) return null;
  const url = tag.slice('relay:'.length);
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/**
 * The featured block for one report, or null for an RLSH entity.
 *
 * The signature line is the one claim here that is not read off the report, so
 * it is worth being exact about. A report that arrived from a relay came through
 * nostr-tools' SimplePool, which drops an event whose signature does not verify
 * before the intake ever sees it (NostrStarcomIntelIngest builds it with
 * createRelayPool, which leaves `verifyEvent` alone; relayPool.test.ts sends it
 * a forged event, and shareReports.test.ts holds the intake to that pool). A report with no relay
 * was made on this device and is not signed at all, and the card says so.
 */
export function featuredReportFor(report: IntelReportOverlayMarker): FeaturedReport | null {
  if (markerKind(report) === 'rlsh') return null;
  // A note naming a person is never on a card or in a clip (D-NP, NP2): not featured, nor captioned in a tour.
  if (report.namesPeople) return null;
  const info = describeShareReport(report, 0);
  // What it is about, in the publisher's own word, before how it was assessed (BA13).
  const lines: string[] = [`${info.category ? `${info.category} · ` : ''}${info.variantMeans} · by ${info.author}`];

  if (info.time === null) lines.push('No stated time');
  else if (info.time.basis === 'event') lines.push(`Happened ${utcMinute(info.time.iso)}`);
  else lines.push(`Written ${utcMinute(info.time.iso)}; when it happened was not stated`);

  lines.push(`Near ${info.lat.toFixed(1)}°, ${info.lng.toFixed(1)}° · ${precisionPhrase(info.precisionM)}`);

  const relay = relayOf(report);
  lines.push(relay
    ? `A signed Nostr event from ${relay}; its signature was checked on intake`
    : 'Made on this device; not signed');

  return { id: info.id, title: info.title, position: { lat: report.latitude, lng: report.longitude }, lines };
}
