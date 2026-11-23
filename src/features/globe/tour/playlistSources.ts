/**
 * What each briefing playlist holds, from its layer (record
 * docs/missions/01-architecture-decisions/briefing-playlists.md, BP5, BP6).
 *
 * Each item comes as its layer already says it for a card (featured*For), with a
 * rank in the layer's own order of how bad, one line saying why it is on the
 * tour, and the group it is toured with. Pure: the stores are read by the caller.
 */
import type { ConflictItem, WarItem, WarTier } from '../../../services/warConflict/warConflict';
import { WAR_TIERS } from '../../../services/warConflict/warConflict';
import { warConflictBrief } from '../../../services/warConflict/warConflictBrief';
import { backingOf } from '../../../services/warConflict/warConflictView';
import type { RaverWatchItem, RaverWatchLayer } from '../../../services/raverWatch/raverWatch';
import { heatRiskName, isNews, levelOf, standsAt, type RaverWatchMoment } from '../../../services/raverWatch/raverWatchView';
import { tonight } from '../../../services/raverWatch/raverWatchWindows';
import type { RegionOutline } from '../../../services/raverWatch/usStates';
import { featuredWarConflictFor } from '../capture/warConflictReports';
import { featuredRaverWatchFor } from '../capture/raverWatchReports';
import { featuredHeroWatchFor, type HeroWatchListing } from '../capture/heroWatchReports';
import { lastDayOf } from '../../../services/heroWatch/heroWatchRelief';
import { formatUtcDate, formatUtcTime } from '../../../utils/utcTime';
import type { TourCandidate } from './briefingPlaylist';

type RegionOf = (code: string) => RegionOutline | null;

/** A place that names no theatre or region, toured with what shares its 10° cell (BP6). */
export function cellOf(position: { lat: number; lng: number }): string {
  return `cell:${Math.floor(position.lat / 10)}:${Math.floor(position.lng / 10)}`;
}

const regionGroup = (code: string | undefined, position: { lat: number; lng: number }) =>
  (code ? `region:${code}` : cellOf(position));

const BACKING_RANK = { critical: 0, deadly: 1, report: 2 } as const;
const BACKING_WHY = {
  critical: 'Critical, as its report tagged it',
  deadly: 'Deaths reported',
  report: 'In the day\'s brief',
} as const;

/**
 * War & Conflict today: the newest day of the brief (warConflictBrief.ts), each
 * item ranked critical, deadly, then the rest, and among those by its theatre's
 * war, worst first, a theatre on no war's list last.
 */
export function warCandidates(
  items: readonly ConflictItem[],
  wars: readonly WarItem[],
  regionOf: RegionOf,
  regionName: (code: string) => string | null,
): { candidates: TourCandidate[]; day: string | null } {
  // A tour is a clip: its brief never quotes a note that names a person (D-NP, NP2).
  const brief = warConflictBrief(items, wars, undefined, { capture: true });
  if (!brief) return { candidates: [], day: null };
  const ofDay = new Set(brief.ids);
  const tierOf = new Map<string, WarTier | null>(brief.theatres.map((t) => [t.slug, t.tier]));
  const tierRank = (slug: string | undefined) => {
    const tier = slug ? tierOf.get(slug) ?? null : null;
    return tier === null ? WAR_TIERS.length : WAR_TIERS.indexOf(tier);
  };
  const candidates = items.filter((item) => ofDay.has(item.id)).flatMap((item): TourCandidate[] => {
    const featured = featuredWarConflictFor(item, regionOf, regionName);
    if (!featured) return [];
    const backing = backingOf(item);
    return [{
      id: item.id,
      title: featured.title,
      position: featured.position,
      lines: featured.lines,
      why: item.theatre ? `${BACKING_WHY[backing]} · ${item.theatre.name}` : BACKING_WHY[backing],
      rank: BACKING_RANK[backing] + tierRank(item.theatre?.slug) / 10,
      at: item.reportedAt,
      group: item.theatre ? `theatre:${item.theatre.slug}` : regionGroup(item.jurisdiction, featured.position),
    }];
  });
  return { candidates, day: brief.day };
}

/** Tonight, as the Raver Watch panel's Tonight button chooses it: the next 12 hours. */
function tonightMoment(nowMs: number): RaverWatchMoment {
  const window = tonight(nowMs);
  return { atS: nowMs / 1000, window: { fromS: window.start / 1000, untilS: window.end / 1000 } };
}

/** The warnings a rave tour opens with, as each is named. */
const WARNING_NAMES: Partial<Record<RaverWatchLayer, string>> = {
  DrugCheckAlerts: 'drug-check alert',
  SceneIncidents: 'scene incident',
};
const LEVEL_RANK = { red: 0, amber: 1 } as const;
const LEVEL_NAMES = { red: 'Red', amber: 'Amber' } as const;

/**
 * Raver Watch tonight: red, then amber drug-check alerts and scene incidents, then
 * tonight's scene events, soonest first. Information, heat, sites, missions, news
 * and cancelled events are not what a rave tour is about.
 */
export function raveCandidates(items: readonly RaverWatchItem[], nowMs: number, regionOf: RegionOf): TourCandidate[] {
  const moment = tonightMoment(nowMs);
  return items.flatMap((item): TourCandidate[] => {
    if (isNews(item) || item.cancelled || !standsAt(item, moment)) return [];
    const level = levelOf(item);
    const warning = WARNING_NAMES[item.layer];
    const event = item.layer === 'SceneEvents';
    if (!(event || (warning && level !== 'info'))) return [];
    const featured = featuredRaverWatchFor(item, regionOf);
    if (!featured) return [];
    const start = item.start ?? item.validFrom;
    return [{
      id: item.id,
      title: featured.title,
      position: featured.position,
      lines: featured.lines,
      why: event
        ? `A scene event tonight, from ${formatUtcTime(start * 1000)}`
        : `${LEVEL_NAMES[level as 'red' | 'amber']} ${warning}`,
      rank: event ? 2 : LEVEL_RANK[level as 'red' | 'amber'],
      // Warnings newest first; events soonest first.
      at: event ? -start : item.createdAt,
      group: regionGroup(item.jurisdiction, featured.position),
    }];
  });
}

/**
 * Hero Watch this week (hero-watch.md, HW13): each relief country, at its largest operation (or OCHA's
 * count where it has none), the largest first; then each open field mission, ending soonest first,
 * toured with the others at its place. Each stop is said as its card says it (heroWatchReports.ts), a
 * mission's safety limits among its lines. Lifeboats are not toured: their counts are last year's.
 */
export function heroCandidates(listing: HeroWatchListing): TourCandidate[] {
  const relief = listing.relief.flatMap((country): TourCandidate[] => {
    const largest = [...country.operations].sort((a, b) => (b.amountChf ?? -1) - (a.amountChf ?? -1))[0];
    const featured = featuredHeroWatchFor((largest ?? country.presence)?.id ?? '', listing);
    if (!featured) return [];
    const ops = country.operations.length;
    const orgs = country.presence?.organisations;
    return [{
      id: featured.id,
      title: featured.title,
      position: featured.position,
      lines: featured.lines,
      why: ops
        ? `Relief: ${ops} Red Cross and Red Crescent operation${ops === 1 ? '' : 's'}${orgs !== undefined ? `, and ${orgs} organisations at work` : ''}`
        : `Relief: ${orgs} organisations at work, by OCHA's count`,
      rank: 0,
      at: country.operations.reduce((sum, op) => sum + (op.amountChf ?? 0), 0),
      group: `region:${country.code}`,
    }];
  });
  const missions = listing.missions.flatMap((place) => place.missions.flatMap((mission): TourCandidate[] => {
    const featured = featuredHeroWatchFor(mission.id, listing);
    // Its safety limits, held whole in a clip's caption (HW13): a mission whose card lacks them is not toured.
    const limits = featured ? featured.lines.indexOf(`Safety limits: ${mission.limits}`) : -1;
    if (!featured || limits < 0) return [];
    return [{
      id: mission.id,
      title: featured.title,
      position: featured.position,
      lines: featured.lines,
      why: `A field mission, open to ${formatUtcDate(lastDayOf(mission.validUntil), { year: true })}`,
      rank: 1,
      // Soonest ending first.
      at: -mission.validUntil,
      group: `region:${place.code}`,
      neverCut: [limits],
    }];
  }));
  return [...relief, ...missions];
}

/** Where a heat tour starts: NWS HeatRisk Orange, 2 of 4 (BP5). */
export const HEAT_FLOOR = 2;

/** The heat watch: HeatRisk Orange and above, standing now or tonight, the worst first. */
export function heatCandidates(items: readonly RaverWatchItem[], nowMs: number, regionOf: RegionOf): TourCandidate[] {
  const moment = tonightMoment(nowMs);
  return items.flatMap((item): TourCandidate[] => {
    if (item.layer !== 'HeatRisk' || item.heatRisk === undefined || item.heatRisk < HEAT_FLOOR || !standsAt(item, moment)) return [];
    const featured = featuredRaverWatchFor(item, regionOf);
    if (!featured) return [];
    return [{
      id: item.id,
      title: featured.title,
      position: featured.position,
      lines: featured.lines,
      why: `HeatRisk ${heatRiskName(item.heatRisk)} (${item.heatRisk} of 4)`,
      rank: 4 - item.heatRisk,
      at: item.createdAt,
      group: regionGroup(item.jurisdiction, featured.position),
    }];
  });
}
