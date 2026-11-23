/**
 * What links IntelWeb's notes (decision D-IW): only what each note states.
 *
 * - **Hubs (IW1, IW5, IW6):** each country a note states; each tag, and each
 *   publisher, that groups: on at least two notes and at most half of them. A
 *   sample of 460 notes on The Record had one publisher and four tags on more
 *   than half (`starcom_intel` on all), which as hubs would tie every note to one
 *   point; and 50 tags on one note each, which join nothing.
 * - **Links (IW1, IW7):** the notes a note cites (`cites`) or names (`refers`),
 *   and the intel it links (`sourceIntelIds`); the mission packages it names are
 *   nodes of their own. A link to anything not held here goes to a stub that
 *   says so. Nothing is linked by nearness in time or place.
 *
 * Pure, so the graph and its tests read the same thing.
 */
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import { NAMES_PEOPLE_TAG } from '../intel/namesPeople';

export type StructureReport = Pick<IntelReportUI, 'id' | 'author'>
  & Partial<Pick<IntelReportUI, 'hashtags' | 'jurisdictions' | 'cites' | 'refers' | 'sourceIntelIds'>>;

export type HubKind = 'country' | 'tag' | 'publisher';

export interface IntelHub {
  /** `<kind>:<key>`, unique across hubs. */
  id: string;
  kind: HubKind;
  /** The country code, tag or publisher key, as stated. */
  key: string;
  /** The notes that share it, in the order given. */
  members: string[];
}

/** A node that is not one of the notes given: a mission package (IW7), or a stub for what is not held here. */
export interface IntelTarget {
  id: string;
  kind: 'report' | 'mission' | 'intel';
  held: boolean;
  /** A held mission package's name. */
  title?: string;
}

export interface IntelLink {
  from: string;
  to: string;
  why: 'cites' | 'refers' | 'linked-intel';
}

export interface IntelStructure {
  hubs: IntelHub[];
  links: IntelLink[];
  targets: IntelTarget[];
  /** Notes in no hub and on no link: alone in the graph. */
  unjoined: string[];
}

const MISSION = /^30079:/;

/** Groups a value per note, once per note however often the note states it. */
function membersBy(reports: readonly StructureReport[], valuesOf: (r: StructureReport) => readonly string[] | undefined): Map<string, string[]> {
  const members = new Map<string, string[]>();
  for (const report of reports) {
    for (const value of new Set(valuesOf(report) ?? [])) {
      if (!value) continue;
      members.set(value, [...(members.get(value) ?? []), report.id]);
    }
  }
  return members;
}

const hubsOf = (kind: HubKind, members: Map<string, string[]>, groups: (count: number) => boolean): IntelHub[] =>
  [...members].filter(([, of]) => groups(of.length)).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, of]) => ({ id: `${kind}:${key}`, kind, key, members: of }));

export function intelStructure(
  reports: readonly StructureReport[],
  options: { missionTitle?: (address: string) => string | null } = {},
): IntelStructure {
  const held = new Set(reports.map((r) => r.id));
  // At least two notes and at most half of them (IW5): what all share says nothing, what one has joins nothing.
  const groups = (count: number) => count >= 2 && count <= reports.length / 2;

  const publishers = membersBy(reports, (r) => (r.author ? [r.author] : []));
  const hubs = [
    ...hubsOf('country', membersBy(reports, (r) => r.jurisdictions), (count) => count >= 1),
    // Never the notes that name people, tied together as a group of their own (D-NP): each is labelled where it is read.
    ...hubsOf('tag', membersBy(reports, (r) => r.hashtags?.filter((tag) => tag !== NAMES_PEOPLE_TAG)), groups),
    // A lone publisher wrote every note, so never groups: no hub, as IW5 asks.
    ...hubsOf('publisher', publishers, groups),
  ];

  const links: IntelLink[] = [];
  const seen = new Set<string>();
  const targets = new Map<string, IntelTarget>();
  const link = (from: string, to: string, why: IntelLink['why'], kind: IntelTarget['kind']) => {
    if (!to || to === from || seen.has(`${from}\0${to}`)) return;
    seen.add(`${from}\0${to}`);
    links.push({ from, to, why });
    if (kind === 'mission') {
      if (!targets.has(to)) {
        const title = options.missionTitle?.(to) ?? null;
        targets.set(to, title ? { id: to, kind, held: true, title } : { id: to, kind, held: false });
      }
    } else if (!held.has(to) && !targets.has(to)) {
      targets.set(to, { id: to, kind, held: false });
    }
  };
  for (const report of reports) {
    for (const cite of report.cites ?? []) link(report.id, cite.eventId, 'cites', 'report');
    for (const address of report.refers ?? []) link(report.id, address, 'refers', MISSION.test(address) ? 'mission' : 'report');
    for (const id of report.sourceIntelIds ?? []) link(report.id, id, 'linked-intel', 'intel');
  }

  const joined = new Set([...hubs.flatMap((h) => h.members), ...links.flatMap((l) => [l.from, l.to])]);
  return { hubs, links, targets: [...targets.values()], unjoined: reports.map((r) => r.id).filter((id) => !joined.has(id)) };
}
