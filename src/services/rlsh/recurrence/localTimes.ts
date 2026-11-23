/**
 * A safety night's times as the kit asks (decision D-RR; kit 5.3): in the place's own zone, its zone named once, and
 * the viewer's own on hover. English as Starcom writes dates elsewhere, the day before the month.
 */
import { languageOf, type LanguageId } from '../../../i18n/app/languages';

export const localeOf = (lang: LanguageId): string => (lang === 'en' ? 'en-GB' : languageOf(lang).html);

const TIME: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };

/** A moment in the place's zone, and the viewer's own for its hover. */
export function localTime(lang: LanguageId, unixS: number, tzid: string): { text: string; title: string } {
  const at = new Date(unixS * 1000);
  let text: string;
  try { text = new Intl.DateTimeFormat(localeOf(lang), { ...TIME, timeZone: tzid }).format(at); } catch { text = at.toISOString(); }
  return { text, title: new Intl.DateTimeFormat(localeOf(lang), { ...TIME, timeZoneName: 'short' }).format(at) };
}

/** A day in the place's zone, as a calendar heads it. */
export function localDay(lang: LanguageId, unixS: number, tzid: string): { key: string; text: string } {
  const at = new Date(unixS * 1000);
  try {
    return {
      key: new Intl.DateTimeFormat('en-CA', { timeZone: tzid, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at),
      text: new Intl.DateTimeFormat(localeOf(lang), { timeZone: tzid, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(at),
    };
  } catch {
    const iso = at.toISOString().slice(0, 10);
    return { key: iso, text: iso };
  }
}

/** The zone's own long name at a moment: "Eastern Daylight Time". */
export function zoneName(lang: LanguageId, tzid: string, unixS: number): string {
  try {
    return new Intl.DateTimeFormat(localeOf(lang), { timeZone: tzid, timeZoneName: 'long' }).formatToParts(new Date(unixS * 1000)).find((p) => p.type === 'timeZoneName')?.value ?? tzid;
  } catch { return tzid; }
}
