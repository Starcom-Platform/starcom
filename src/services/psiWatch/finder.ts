/**
 * The Finder's positive controls (decision D-PW, PW28, PW29, PW61, PW70): two archetypes whose answer is already
 * known, run before any other so the machinery proves itself on the history baked for Echoes.
 *
 * A Zone on a plate boundary: each ZSP 2.0 Zone's resonance is the share of its area within 150 km of a PB2002
 * plate boundary (`scripts/psi/bake-finder.ts`); the Zones ranked by it into ten equal groups, each group's
 * earthquakes of M5.5 and up per million km² beside the usual, the rate across every Zone.
 *
 * A 27-day return of geomagnetic activity: for every storm since 1932, how many others began 1 to 60 days after it,
 * a bar a day, beside the usual, the count a day would hold if the storms fell at random through the record.
 *
 * Both are drawn as data, no sentence reading them (PW70), and both leave out the years Mecha Jono holds back for
 * their sealed tests (PW75): the quakes of 2000–2024, the storms of 1966–2025.
 */
import { useSyncExternalStore } from 'react';
import type { EventSet } from './timestream/eventSets';
import { openRecord, WITHHELD } from './timestream/withheld';

const DAY_MS = 86_400_000;
export const FINDER_PLATES_URL = '/data/psi-finder-plates.json';

export interface FinderPlatesFile {
  archetype: 'plate-boundary';
  withinKm: number;
  cellDeg: number;
  quakesFromMs: number;
  quakesUntilMs: number;
  credit: { boundaries: string; quakes: string };
  zones: { code: string; share: number; areaKm2: number; quakes: number }[];
  /** The quakes' years held back for sealed tests, left out of every count (PW75). */
  heldBack?: string;
}

export type FinderArchetype = 'plates' | 'rotation';
export const FINDER_ARCHETYPES: readonly FinderArchetype[] = ['plates', 'rotation'];

/** One of the ten groups of Zones, by their resonance: the shares it spans, and its quakes per million km². */
export interface ResonanceTenth { least: number; most: number; zones: number; areaKm2: number; quakes: number; rate: number }

/** The Zones ranked by resonance into ten groups of as near equal a count as they divide, least resonant first. */
export function platesByTenth(file: FinderPlatesFile): { tenths: ResonanceTenth[]; usual: number } {
  const ranked = [...file.zones].sort((a, b) => a.share - b.share || a.code.localeCompare(b.code));
  const tenths: ResonanceTenth[] = [];
  for (let t = 0; t < 10; t++) {
    const group = ranked.slice(Math.round((t * ranked.length) / 10), Math.round(((t + 1) * ranked.length) / 10));
    if (!group.length) continue;
    const areaKm2 = group.reduce((n, z) => n + z.areaKm2, 0);
    const quakes = group.reduce((n, z) => n + z.quakes, 0);
    tenths.push({ least: group[0].share, most: group[group.length - 1].share, zones: group.length, areaKm2, quakes, rate: areaKm2 ? (quakes / areaKm2) * 1e6 : 0 });
  }
  const area = file.zones.reduce((n, z) => n + z.areaKm2, 0);
  const quakes = file.zones.reduce((n, z) => n + z.quakes, 0);
  return { tenths, usual: area ? (quakes / area) * 1e6 : 0 };
}

/** For every storm, how many others began each day 1 to `days` after it; and the usual, were they scattered at random. */
export function stormsAfterStorms(set: EventSet, days = 60): { counts: number[]; usual: number } {
  const counts = new Array<number>(days).fill(0);
  // A storm in the held-back years neither starts a count nor falls in one (PW75).
  const held = WITHHELD[set.id];
  const ms = set.ms.filter((t) => !held.some((h) => t >= h.fromMs && t < h.untilMs));
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const lag = Math.round((ms[j] - ms[i]) / DAY_MS);
      if (lag > days) break;
      if (lag >= 1) counts[lag - 1]++;
    }
  }
  const { days: recordDays } = openRecord(set);
  return { counts, usual: recordDays > 0 ? (ms.length * (ms.length - 1)) / recordDays : 0 };
}

// The archetype open in the Finder, shared by the panel and the globe.
let open: FinderArchetype | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getFinderOpen = (): FinderArchetype | null => open;
export function setFinderOpen(next: FinderArchetype | null): void { open = next; listeners.forEach((listener) => listener()); }
export const useFinderOpen = (): FinderArchetype | null => useSyncExternalStore(subscribe, getFinderOpen, getFinderOpen);
