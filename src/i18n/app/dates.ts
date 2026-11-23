/**
 * A time as Starcom writes it on screen, in the language shown (decision D-ML, L3; D-E): in UTC, the time
 * marked Z in every language, the date as the language writes it. English keeps the house form, "14 Sep
 * 2026 19:33Z". Only the screen: what is published keeps the house form, from utils/utcTime.
 */
import { formatUtcDate, formatUtcDateTime, formatUtcMonth, formatUtcTime, localTimeTitle } from '../../utils/utcTime';
import { interpolate } from '../messages';
import { languageOf, type LanguageId } from './languages';

/** A day, in UTC, as `lang` writes it. */
export const utcDateIn = (lang: LanguageId, ms: number, year: boolean): string => (lang === 'en'
  ? formatUtcDate(ms, { year })
  : new Intl.DateTimeFormat(languageOf(lang).html, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(ms));

/** A moment, in UTC, its time marked Z. */
export const utcDateTimeIn = (lang: LanguageId, ms: number, year: boolean, seconds = false): string => (lang === 'en'
  ? formatUtcDateTime(ms, { year, seconds })
  : `${utcDateIn(lang, ms, year)} ${formatUtcTime(ms, { seconds })}`);

/** A month, in UTC. */
export const utcMonthIn = (lang: LanguageId, ms: number): string => (lang === 'en'
  ? formatUtcMonth(ms)
  : new Intl.DateTimeFormat(languageOf(lang).html, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(ms));

/** The viewer's own local time, for a hover: `local` is the language's "Local: {time}". */
export const localTitleIn = (lang: LanguageId, ms: number, local: string): string => (lang === 'en'
  ? localTimeTitle(ms)
  : interpolate(local, {
    time: new Intl.DateTimeFormat(languageOf(lang).html, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(ms),
  }));
