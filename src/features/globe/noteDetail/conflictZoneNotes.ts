/**
 * What a click on a Conflict Zones mark opens (critique C5, the open list of decision D-CT).
 *
 * A country's armed-conflict tally opens its events, newest first: each as GDELT coded it from one news report,
 * in Diplomacy's words for the same things (the catalogue's `diplomacy` block, so they are translated alike), with
 * the report. GDELT reads the news by machine, so each note carries the primer's caveat on who did what to whom.
 *
 * A displacement ring opens UNHCR's figures for the country, which count by country of asylum: the refugees and
 * asylum seekers it hosts, and the people displaced inside it. Linked to the row of UNHCR's population API they
 * came from, which takes UNHCR's own code for a country, not its ISO code.
 */
import type { RealGdeltEvent } from '../../../services/geopolitical/gdeltEventExport';
import { gdeltStampToMs } from '../../../services/geopolitical/gdeltEventExport';
import type { CountryDisplacement } from '../../../services/geopolitical/UNHCRDisplacementService';
import { cameoNameOf } from '../../../geopolitical/theme/cameoCodes';
import { counted, fill, messagesNow, numbered } from '../../../i18n/app/i18n';
import type { GlobeNote, GlobeNoteSet } from './globeNoteStore';

/** How many of a country's events a click lists: the newest, the rest counted in the heading. */
export const WAR_NOTES_SHOWN = 25;

const isWebLink = (url: string): boolean => /^https?:\/\//i.test(url);

/** One event as a note: its CAMEO code and kind, its Goldstein score, where, how many told it, and its source. */
export function warEventNote(event: RealGdeltEvent): GlobeNote {
  const words = messagesNow().diplomacy;
  const cameo = cameoNameOf(event.eventCode);
  const code = cameo
    ? fill(words.cameo, { code: event.eventCode, name: cameo.name })
      + (cameo.parent ? `, ${fill(words.cameoKind, { code: cameo.parent.code, name: cameo.parent.name })}` : '')
    : `CAMEO ${event.eventCode}`;
  const lines = [
    code,
    fill(words.goldstein, { score: numbered(event.goldsteinScale) }),
    words.goldsteinCaveat,
    ...(event.placeName ? [`Where the report puts it: ${event.placeName}`] : []),
    ...(typeof event.sources === 'number' && event.sources > 0 ? [counted(words.story, event.sources)] : []),
    ...(event.confidence !== undefined ? [fill(words.confidenceOf, { n: numbered(event.confidence) })] : []),
    ...(event.lead ? [words.lead] : []),
    '',
    words.primer[3],
  ];
  return {
    id: event.id,
    kind: 'GDELT event, coded from the news',
    title: `${fill(words.pair, { a: event.actor1ISO3 || '?', b: event.actor2ISO3 || '?' })}: ${cameo ? cameo.name : `CAMEO ${event.eventCode}`}`,
    text: lines.join('\n'),
    timeMs: gdeltStampToMs(event.dateAdded),
    sources: isWebLink(event.sourceUrl) ? [event.sourceUrl] : [],
  };
}

/** A country's tally opens its events, newest first; a long one its newest, saying how many there are. */
export function warTallyNoteSet(countryCode: string, events: readonly RealGdeltEvent[]): GlobeNoteSet {
  const newest = [...events].sort((a, b) => (gdeltStampToMs(b.dateAdded) ?? 0) - (gdeltStampToMs(a.dateAdded) ?? 0));
  const shown = newest.slice(0, WAR_NOTES_SHOWN);
  return {
    heading: `Conflict Zones · ${countryCode}${events.length > shown.length ? `, the ${shown.length} newest of ${events.length}` : ''}`,
    notes: shown.map(warEventNote),
  };
}

/** UNHCR's own country code, and nothing else, may become part of a link. */
const UNHCR_CODE = /^[A-Z]{3}$/;

export function displacementNoteSet(record: CountryDisplacement): GlobeNoteSet {
  const name = record.countryName || record.countryISO3;
  const code = record.unhcrCode && UNHCR_CODE.test(record.unhcrCode) ? record.unhcrCode : null;
  return {
    heading: `Conflict Zones · ${name}`,
    notes: [{
      id: `unhcr-${record.countryISO3}-${record.year}`,
      kind: 'UNHCR population figures',
      title: `${name}: ${numbered(record.total)} displaced people`,
      text: [
        `Refugees it hosts: ${numbered(record.refugees)}`,
        `Asylum seekers it hosts: ${numbered(record.asylumSeekers)}`,
        `Displaced inside it: ${numbered(record.idps)}`,
        `UNHCR's figures for ${record.year}, by country of asylum.`,
      ].join('\n'),
      // A year's figure: there is no moment to give, so the inspector shows its year (when).
      timeMs: null,
      when: String(record.year),
      sources: code ? [`https://api.unhcr.org/population/v1/population/?yearFrom=${record.year}&yearTo=${record.year}&coa=${code}`] : [],
    }],
  };
}
