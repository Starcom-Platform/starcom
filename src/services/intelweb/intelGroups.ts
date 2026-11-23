/**
 * How IntelWeb groups its notes (decision D-IW, IW8): each way from what a note states.
 *
 * - **Country:** the countries it states, a region (`us-tx`) counted as its country; an area code
 *   (`zone:sahel`) is not a country.
 * - **Theatre and event, desk, source, category:** its tags of that kind (`theatre:` and `event:`,
 *   `…_desk`, `source:`, `category:`), a category's subdivisions counted as the category.
 * - **Sphere:** a Sphere one of whose members it states, or that it names.
 * - **Zone, Sector:** a place it lies inside or names, found as the Zones layer finds its reports
 *   (`zoneReports.reportsAbout`), never from a country it states.
 *
 * A note in several groups of the kind chosen clusters in the largest, ties by name; one in none is
 * listed as such. Pure, so the graph and its tests group alike.
 */
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import type { ZspPlace } from '../../geopolitical/zones/zsp';
import { reportsAbout } from '../../features/globe/zones/zoneReports';

export const GROUPINGS = ['country', 'theatre', 'desk', 'source', 'category', 'zone', 'sector', 'sphere'] as const;
export type Grouping = typeof GROUPINGS[number];

export interface GroupNote {
  id: string;
  jurisdictions?: readonly string[];
  hashtags?: readonly string[];
  /** Latitude, longitude. */
  point?: readonly [number, number];
}

export interface GroupContext {
  spheres: ReadonlyArray<{ code: string; members: readonly string[] }>;
  /** The Zones' places, each Zone, Sector and sub-sector; none until they are loaded. */
  places: readonly ZspPlace[];
}

export interface NoteGroup {
  key: string;
  members: string[];
}

export interface NoteGroups {
  by: Grouping;
  /** By key. */
  groups: NoteGroup[];
  /** Each grouped note's cluster: the largest of its groups. */
  clusterOf: Map<string, string>;
  /** Notes in no group of this kind. */
  ungrouped: string[];
}

/** What IntelWeb groups a report by: what it states, and its point. */
export const notesOf = (reports: readonly IntelReportUI[]): GroupNote[] => reports.map((r) => ({
  id: r.id,
  ...(r.jurisdictions?.length ? { jurisdictions: r.jurisdictions } : {}),
  ...(r.hashtags?.length ? { hashtags: r.hashtags } : {}),
  ...(typeof r.latitude === 'number' && typeof r.longitude === 'number' ? { point: [r.latitude, r.longitude] as const } : {}),
}));

const countriesOf = (note: GroupNote): string[] =>
  (note.jurisdictions ?? []).map((j) => j.trim().toLowerCase().split('-')[0]).filter((c) => /^[a-z]{2}$/.test(c));

const tagsLike = (note: GroupNote, matches: (tag: string) => boolean, as: (tag: string) => string = (t) => t): string[] =>
  (note.hashtags ?? []).filter(matches).map(as);

/** Each note's groups of one kind, by key, each note once. */
function membership(notes: readonly GroupNote[], by: Grouping, context: GroupContext): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  const add = (key: string, id: string) => {
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(id);
  };
  if (by === 'zone' || by === 'sector') {
    // As the Zones layer finds a place's reports: placed inside it, or naming it or a place in it.
    const asReports = notes.map((n) => ({
      id: n.id, jurisdictions: n.jurisdictions ? [...n.jurisdictions] : undefined,
      latitude: n.point?.[0], longitude: n.point?.[1], createdAt: new Date(0),
    }) as unknown as IntelReportUI);
    for (const place of context.places.filter((p) => p.level === by)) {
      for (const found of reportsAbout(place, asReports)) add(place.id, found.report.id);
    }
    return groups;
  }
  for (const note of notes) {
    const keys = by === 'country' ? countriesOf(note)
      : by === 'theatre' ? tagsLike(note, (t) => t.startsWith('theatre:') || t.startsWith('event:'))
        : by === 'desk' ? tagsLike(note, (t) => /_desk$/.test(t))
          : by === 'source' ? tagsLike(note, (t) => t.startsWith('source:'))
            : by === 'category' ? tagsLike(note, (t) => t.startsWith('category:'), (t) => t.split('.')[0])
              : context.spheres.filter((s) => countriesOf(note).some((c) => s.members.includes(c)) || (note.jurisdictions ?? []).includes(s.code)).map((s) => s.code);
    for (const key of keys) add(key, note.id);
  }
  return groups;
}

export function groupNotes(notes: readonly GroupNote[], by: Grouping, context: GroupContext): NoteGroups {
  const found = membership(notes, by, context);
  // Members in the order the notes were given, whatever order they were found in.
  const groups = [...found.keys()].sort().map((key) => ({ key, members: notes.map((n) => n.id).filter((id) => found.get(key)!.has(id)) }));
  const size = new Map(groups.map((g) => [g.key, g.members.length]));
  const clusterOf = new Map<string, string>();
  for (const group of groups) {
    for (const id of group.members) {
      const held = clusterOf.get(id);
      if (held === undefined || size.get(group.key)! > size.get(held)!) clusterOf.set(id, group.key);
    }
  }
  return { by, groups, clusterOf, ungrouped: notes.map((n) => n.id).filter((id) => !clusterOf.has(id)) };
}
