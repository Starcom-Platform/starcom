/**
 * Campaigns and Operations on the globe (decision D-RS, RS25): each one running or to come, at the places it
 * names, outlined, with a pill saying its name and its clock; a place with several counts them. A click opens
 * it in Operations. One ended, or past its window, is not drawn; a place the globe cannot outline here (an area,
 * as union:eu) is listed, never placed by a guess.
 */
import { missionPlaceCode } from '../heroWatch/heroWatchMissions';
import { ROSTER_KIND_NAME, type ReadRosterItem } from './rosterItem';
import type { GlobeNoteSet } from '../../features/globe/noteDetail/globeNoteStore';

const SHOWN: ReadonlyArray<ReadRosterItem['kind']> = ['campaign', 'operation'];

export interface OpsAtPlace {
  /** A US state's code (`us-ca`), or a country's two letters, upper case. */
  code: string;
  name: string;
  items: ReadRosterItem[];
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const dayOf = (moment: string) => moment.slice(0, 10);

/** Whether it is running or to come on `today` (YYYY-MM-DD): not ended, and its window not past. */
export function isCurrent(item: ReadRosterItem, today: string): boolean {
  if (!SHOWN.includes(item.kind) || item.ended) return false;
  const until = item.window?.until ? dayOf(item.window.until) : '';
  return until === '' || until >= today;
}

/** Its clock on `today`: how long is left, when it starts, or that it runs on. */
export function clockOf(item: ReadRosterItem, today: string): string {
  const from = item.window?.from ? dayOf(item.window.from) : '';
  const until = item.window?.until ? dayOf(item.window.until) : '';
  if (from && from > today) {
    const n = daysBetween(today, from);
    return n === 1 ? 'starts tomorrow' : `starts in ${n} days`;
  }
  if (!until) return 'under way';
  const left = daysBetween(today, until);
  if (left === 0) return 'ends today';
  return `${left} ${left === 1 ? 'day' : 'days'} left`;
}

/** The places of the current campaigns and operations, by name, and those naming no place drawn here. */
export function rosterOpsByPlace(
  items: readonly ReadRosterItem[],
  outlineOf: (code: string) => { name: string } | null,
  today: string,
): { places: OpsAtPlace[]; unplaced: ReadRosterItem[] } {
  const byCode = new Map<string, OpsAtPlace>();
  const unplaced: ReadRosterItem[] = [];
  for (const item of items.filter((i) => isCurrent(i, today))) {
    let placed = false;
    for (const given of item.places) {
      const code = missionPlaceCode(given);
      const outline = code ? outlineOf(code) : null;
      if (!code || !outline) continue;
      const place = byCode.get(code) ?? { code, name: outline.name, items: [] };
      if (!place.items.some((i) => i.address === item.address)) place.items.push(item);
      byCode.set(code, place);
      placed = true;
    }
    if (!placed) unplaced.push(item);
  }
  return { places: [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name)), unplaced };
}

/** A place's pill: one named by its title and clock; several counted. */
export function opsPillText(place: OpsAtPlace, today: string): string {
  if (place.items.length === 1) {
    const [item] = place.items;
    return `${item.title.length > 32 ? `${item.title.slice(0, 31)}…` : item.title} · ${clockOf(item, today)}`;
  }
  return `${place.name} · ${place.items.length} campaigns and operations`;
}

/** A place's hover: each with its kind and clock, a line each. */
export function describeOpsAt(place: OpsAtPlace, today: string): string {
  return [
    place.name,
    ...place.items.map((i) => `${ROSTER_KIND_NAME[i.kind]}: ${i.title} · ${clockOf(i, today)}`),
    'Click to open it in Operations',
  ].join('\n');
}

/** What a click opens: each in Operations, by its address (RS25). */
export function opsNoteSet(place: OpsAtPlace): GlobeNoteSet {
  return {
    heading: place.name,
    panel: 'operations',
    notes: place.items.map((i) => ({
      id: i.address, kind: ROSTER_KIND_NAME[i.kind], title: i.title, text: i.purpose ?? i.text,
      timeMs: i.createdAt * 1000, sources: [],
      ...(i.limits.length ? { limits: i.limits.join(' ') } : {}),
    })),
  };
}
