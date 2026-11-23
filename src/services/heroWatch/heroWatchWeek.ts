/**
 * Hero Watch's week on one card (decision D-HW, step 7; HW10), a front page as the War & Conflict
 * brief's is: the week's relief, its lifeboat launches and its open field missions.
 *
 * What is drawn is counted here: the relief standing, the missions open. The week's lifeboat launches
 * are not drawn anywhere, since a station carries a year's count, so they come from Mecha Jono's weekly
 * roundup, its own first sentence under its Lifeboats heading, as written. Where the roundup is not
 * read, the page counts the stations drawn and says the roundup was not read.
 */
import type { WeekSummary } from './heroWatch';
import { centreOf } from '../intel/globe/linkedRecordPlacement';
import type { ReliefCountry } from './heroWatchRelief';
import type { MissionPlace } from './heroWatchMissions';

export interface HeroWatchWeek {
  /** The roundup's ISO week, `2026-w41`, or null when none is read. */
  week: string | null;
  title: string;
  lines: string[];
  /** Countries with relief, open missions placed, and stations drawn. */
  relief: number;
  missions: number;
  stations: number;
  /**
   * Where the camera faces: one point a section, the middle of its relief countries, of its mission
   * places, and of its stations, so nine US missions do not turn the page away from one relief country.
   */
  points: Array<{ lat: number; lng: number }>;
}

export interface HeroWatchWeekInput {
  summary: WeekSummary | null;
  relief: readonly ReliefCountry[];
  missions: readonly MissionPlace[];
  /** Open missions naming no one place drawn here. */
  unplacedMissions: number;
  /** Lifeboat stations drawn, and where they stand. */
  stations: number;
  stationPoints: ReadonlyArray<{ lat: number; lng: number }>;
  /** A place's middle, by code. */
  middleOf: (code: string) => { lat: number; lng: number } | null;
}

/** The first sentence under a roundup's `**heading**`, as written, or null where it has none. */
export function roundupSentence(content: string, heading: string): string | null {
  const lines = content.split('\n');
  const at = lines.findIndex((line) => line.trim() === `**${heading}**`);
  if (at < 0) return null;
  const next = lines.slice(at + 1).find((line) => line.trim() !== '');
  if (!next || /^\*\*.+\*\*$/.test(next.trim())) return null;
  const text = next.replace(/\*\*/g, '').trim();
  return text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;
}

/** The middle of some places on the sphere, or null where there are none. */
function middleOfAll(points: ReadonlyArray<{ lat: number; lng: number } | null>): { lat: number; lng: number } | null {
  const centre = centreOf(points.filter((p): p is { lat: number; lng: number } => p !== null).map((p) => ({ latitude: p.lat, longitude: p.lng })));
  return centre ? { lat: centre.lat, lng: centre.lng } : null;
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Up to three names, and how many more. */
function named(names: string[], more: string): string {
  if (names.length <= 3) return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${names.slice(0, 3).join(', ')} and ${counted(names.length - 3, `more ${more}`, `more ${more === 'country' ? 'countries' : `${more}s`}`)}`;
}

function reliefLine(relief: readonly ReliefCountry[]): string {
  if (!relief.length) return 'Relief: none standing';
  const ops = relief.reduce((n, country) => n + country.operations.length, 0);
  const orgs = relief.reduce((n, country) => n + (country.presence?.organisations ?? 0), 0);
  const what = [
    ops ? counted(ops, 'operation', 'operations') : null,
    orgs ? `${orgs} organisation${orgs === 1 ? '' : 's'} at work` : null,
  ].filter(Boolean).join(' and ');
  return `Relief: ${what}, in ${named(relief.map((country) => country.name), 'country')}`;
}

function missionsLine(missions: readonly MissionPlace[], unplaced: number): string {
  const open = missions.reduce((n, place) => n + place.missions.length, 0);
  if (!open && !unplaced) return 'Field missions: none open';
  const placed = open
    ? `${open} open in ${counted(missions.length, 'place', 'places')}, each with its safety limits`
    : 'none open in a place drawn here';
  return `Field missions: ${placed}${unplaced ? `; ${unplaced} more name${unplaced === 1 ? 's' : ''} no one place` : ''}`;
}

/** The week's page from what is drawn and the roundup. Throws when there is nothing to say. */
export function heroWatchWeek(input: HeroWatchWeekInput): HeroWatchWeek {
  const { summary, relief, missions, unplacedMissions, stations, stationPoints, middleOf } = input;
  const open = missions.reduce((n, place) => n + place.missions.length, 0);
  if (!summary && !relief.length && !open && !unplacedMissions && !stations) {
    throw new Error('Hero Watch has nothing standing to put on a week\'s card: no roundup, relief, field mission or lifeboat is drawn.');
  }
  const launches = summary ? roundupSentence(summary.content, 'Lifeboats') : null;
  return {
    week: summary?.week ?? null,
    title: summary?.title ?? 'Hero Watch · this week',
    lines: [
      reliefLine(relief),
      launches ? `Lifeboats: ${launches}` : stations ? `Lifeboats: ${stations} RNLI stations drawn, sized by their launches in 2025` : 'Lifeboats: none drawn',
      missionsLine(missions, unplacedMissions),
      summary ? 'From the weekly roundup on The Record, posted by an AI agent' : 'The weekly roundup on The Record was not read, so this page counts what is drawn',
    ],
    relief: relief.length,
    missions: open,
    stations,
    points: [
      middleOfAll(relief.map((country) => middleOf(country.code))),
      middleOfAll(missions.map((place) => middleOf(place.code))),
      middleOfAll(stationPoints),
    ].filter((p): p is { lat: number; lng: number } => p !== null),
  };
}
