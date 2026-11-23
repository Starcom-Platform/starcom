/**
 * Hero Watch's field missions, by place (decision D-HW, step 5; HW6).
 *
 * A field mission is a signed package Mecha Jono posts for anyone to take up: its asks, the minutes each
 * takes, a window, and its limits, the safety rules it carries ("Work in pairs. Never confront anyone…").
 * The open ones are drawn by the place each names: its US state, a US territory's own outline (Guam is
 * `us-gu`, drawn as Guam, not as the United States), or its country. A subdivision of another country is
 * never widened to the country, and a mission with no place drawn here is counted, not drawn. A mission
 * is never shown without its limits: a place's hover names at most three, each with them.
 */
import { formatUtcDate } from '../../utils/utcTime';
import { US_STATE_CODE } from '../raverWatch/usStates';
import { lastDayOf } from './heroWatchRelief';
import type { FieldMission, HeroWatchItem } from './heroWatch';
import { fieldMissionWords, missionNamesPeopleProblem } from '../intel/missionNamesPeople';

/** US territories with an outline of their own among the countries, by the code Mecha Jono writes. */
const US_TERRITORIES: Readonly<Record<string, string>> = { 'us-gu': 'GU', 'us-pr': 'PR', 'us-vi': 'VI', 'us-as': 'AS', 'us-mp': 'MP' };

/** How many missions a place's hover names, each with its limits, before it counts the rest. */
const NAMED = 3;

export interface MissionPlace {
  /** A US state's code (`us-nm`), or a country's or US territory's two letters, upper case. */
  code: string;
  name: string;
  /** Its open missions, ending soonest first. */
  missions: FieldMission[];
}

/** Where a mission is drawn: its state, a US territory's own outline, or its country; null where none is. */
export function missionPlaceCode(jurisdiction: string | undefined): string | null {
  if (!jurisdiction) return null;
  const code = jurisdiction.toLowerCase();
  if (US_TERRITORIES[code]) return US_TERRITORIES[code];
  if (US_STATE_CODE.test(code)) return code;
  return /^[a-z]{2}$/.test(code) ? code.toUpperCase() : null;
}

/** The places with open missions, by name, and the open missions with no place drawn here. */
export function missionsByPlace(
  items: readonly HeroWatchItem[],
  outlineOf: (code: string) => { name: string } | null,
): { places: MissionPlace[]; unplaced: FieldMission[] } {
  const byCode = new Map<string, MissionPlace>();
  const unplaced: FieldMission[] = [];
  for (const item of items) {
    if (item.kind !== 'field_mission' || item.state !== 'open') continue;
    // Read again here, for a note naming a person that arrived after the mission (D-NP, NP5).
    if (missionNamesPeopleProblem(fieldMissionWords(item))) continue;
    const code = missionPlaceCode(item.jurisdiction);
    const outline = code ? outlineOf(code) : null;
    if (!code || !outline) { unplaced.push(item); continue; }
    const place = byCode.get(code) ?? { code, name: outline.name, missions: [] };
    place.missions.push(item);
    byCode.set(code, place);
  }
  const places = [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const place of places) place.missions.sort((a, b) => a.validUntil - b.validUntil);
  return { places, unplaced };
}

/** What a place's pill says: the place, and its open missions. */
export function missionsPill(place: MissionPlace): string {
  const n = place.missions.length;
  return `${place.name} · ${n} mission${n === 1 ? '' : 's'}`;
}

/** One mission, as its package gives it: its asks, their minutes, and the last day it is open. */
function missionInWords(mission: FieldMission): string {
  const asks = mission.objectives.length;
  const minutes = mission.objectives.reduce((sum, objective) => sum + objective.effortMinutes, 0);
  return `• ${mission.title}: ${asks} ask${asks === 1 ? '' : 's'}, ${minutes} minutes in all, open to ${formatUtcDate(lastDayOf(mission.validUntil), { year: true })}.`;
}

/** A limits text's sentences: split after a full stop, a question or an exclamation, before the next. */
const sentencesOf = (text: string) => text.trim().split(/(?<=[.!?])\s+/);

/**
 * The named missions' limits, a line each, every sentence said: once for all where their texts are
 * the same; otherwise the sentences every one of them carries said once (Mecha Jono's families share
 * five, "Work in pairs. … Look after yourself first."), then each mission's own; and each in full where
 * they share none.
 */
function limitsInWords(named: FieldMission[]): string[] {
  const texts = [...new Set(named.map((mission) => mission.limits))];
  if (texts.length === 1) return [`${named.length === 1 ? 'Its' : 'Their'} limits: ${texts[0]}`];
  const shared = sentencesOf(named[0].limits).filter((sentence) => named.every((mission) => sentencesOf(mission.limits).includes(sentence)));
  if (!shared.length) return named.map((mission) => `Limits for ${mission.title}: ${mission.limits}`);
  return [
    `Their limits: ${shared.join(' ')}`,
    ...named.flatMap((mission) => {
      const own = sentencesOf(mission.limits).filter((sentence) => !shared.includes(sentence));
      return own.length ? [`Also for ${mission.title}: ${own.join(' ')}`] : [];
    }),
  ];
}

/** What a place's hover says, a line each: its open missions, the first three named, and their limits. */
export function describeMissions(place: MissionPlace): string {
  const n = place.missions.length;
  const named = place.missions.slice(0, NAMED);
  return [
    `${place.name}: ${n} open field mission${n === 1 ? '' : 's'}.`,
    ...named.map(missionInWords),
    ...(n > NAMED ? [`and ${n - NAMED} more.`] : []),
    ...limitsInWords(named),
  ].join('\n');
}
