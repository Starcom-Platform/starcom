/**
 * How a mission's place, end and effort are said, on its card and on its checklist once taken (decision D-MF,
 * MF1, MF7), in the language shown.
 */
import { usStateName } from '../../../services/intel/received/usStates';
import type { MissionPlace } from '../../../services/intel/received/missionCard';
import { counted, fill } from '../../../i18n/app/i18n';
import { utcDateIn } from '../../../i18n/app/dates';
import { languageOf, type LanguageId } from '../../../i18n/app/languages';
import type { Messages } from '../../../i18n/app/en';

type Words = Messages['missionParts']['cards'];
const DAY = 86_400_000;
/** An end this close is drawn as one to act on. */
const SOON_DAYS = 3;

const countryName = (code: string, lang: LanguageId): string => {
  try {
    return new Intl.DisplayNames([languageOf(lang).html], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** "New Mexico", "United States", "Los Angeles County Beaches and 14 more areas, California". */
export function placeText(place: MissionPlace, lang: LanguageId, t: Words): string {
  const within = place.state ? usStateName(place.state) : place.country ? countryName(place.country, lang) : undefined;
  if (!place.areas?.length) return within ?? '';
  const named = place.areas.length > 1 ? counted(t.moreAreas, place.areas.length - 1, { first: place.areas[0] }, lang) : place.areas[0];
  return within ? `${named}, ${within}` : named;
}

const utcDay = (ms: number) => Math.floor(ms / DAY);

/** When it ends, counted in UTC days from now; an end that has passed is dated. */
export function endsText(closesAt: number, now: number, lang: LanguageId, t: Words): { text: string; soon: boolean } {
  const days = utcDay(closesAt) - utcDay(now);
  if (closesAt < now) return { text: fill(t.ended, { when: utcDateIn(lang, closesAt, false) }), soon: false };
  if (days <= 0) return { text: t.endsToday, soon: true };
  if (days === 1) return { text: t.endsTomorrow, soon: true };
  return { text: counted(t.endsIn, days, {}, lang), soon: days <= SOON_DAYS };
}

/** About how long, in hours and minutes. */
export function effortText(minutes: number, lang: LanguageId, m: Messages, t: Words): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return fill(t.effort, { time: [hours ? counted(m.eventTime.hours, hours, {}, lang) : '', rest ? counted(m.eventTime.minutes, rest, {}, lang) : ''].filter(Boolean).join(' ') });
}
