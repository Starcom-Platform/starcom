/**
 * What a click on an earthquake, a fire, a flood or the rest opens (critique C5, the open list of decision D-CT): the
 * event as its feed states it, and the publisher's own page for it. These marks had a hover and nothing behind it.
 *
 * Nothing is added. A field the feed left out is left out; Starcom's own severity bucket, which colours the mark, is
 * not restated as though the publisher had said it; and USGS's tsunami flag is named as a flag, not as a warning.
 */
import type { NaturalEvent } from '../../../hooks/useGeoEvents';
import { HAZARD_TYPE_LEGEND, deathsWords, formatEcoDisasterLabel } from '../../../components/EcoNatural/formatters';
import { numbered } from '../../../i18n/app/i18n';
import type { GlobeNote, GlobeNoteSet } from './globeNoteStore';

const HAZARD_HEADING = new Map(HAZARD_TYPE_LEGEND.map((h) => [h.type, h.label]));

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** What the feed states about the event, a line each, in its own terms. */
function factsOf(event: NaturalEvent): string[] {
  const lines: string[] = [];
  if (event.type === 'earthquake') {
    if (finite(event.magnitude)) lines.push(`Magnitude ${event.magnitude.toFixed(1)}`);
    if (finite(event.depthKm)) lines.push(`Depth ${event.depthKm.toFixed(1)} km`);
    if (event.status) lines.push(`USGS review status: ${event.status}`);
    if (event.tsunami) lines.push('USGS tsunami flag set. For tsunami alerts, see tsunami.gov.');
    // What NOAA's atlas of significant quakes says of it (D-EQ, EQ4): its own figures, as NCEI counts them.
    if (event.dateWords) lines.push(`When: ${event.dateWords}`);
    if (event.atlas) {
      const deaths = deathsWords(event.atlas.deaths, event.atlas.deathsOrder);
      if (deaths) lines.push(`Deaths, NOAA NCEI: ${deaths}`);
      if (finite(event.atlas.damageMillions)) lines.push(`Damage, NOAA NCEI: about ${numbered(Math.round(event.atlas.damageMillions))} million dollars`);
      if (finite(event.atlas.intensity)) lines.push(`Greatest intensity felt (MMI): ${event.atlas.intensity}`);
      if (event.atlas.tsunami) lines.push('A tsunami came of it, NOAA NCEI records.');
    }
    return lines;
  }
  // Acres for every EONET fire that states a size (3,294 of 7,148 on 2026-10-16; the rest state none).
  if (event.type === 'wildfire' && finite(event.intensity)) lines.push(`Burned area: ${numbered(Math.round(event.intensity))} acres`);
  if (event.status) lines.push(event.source === 'GDACS' ? `GDACS alert level: ${event.status}` : `Status: ${event.status}`);
  return lines;
}

const mock = (event: NaturalEvent): boolean => event.isMock === true || event.source === 'volcano-mock';

export function ecoDisasterNote(event: NaturalEvent): GlobeNote {
  const at = event.timestamp ? Date.parse(event.timestamp) : Number.NaN;
  return {
    id: String(event.id),
    kind: mock(event) ? 'Mock data, not a real event' : `Reported by ${event.reportedBy?.length ? event.reportedBy.join(' and ') : event.source || 'an unnamed feed'}`,
    title: event.description?.trim() || formatEcoDisasterLabel(event),
    text: factsOf(event).join('\n'),
    timeMs: Number.isFinite(at) ? at : null,
    sources: event.sourceUrl ? [event.sourceUrl] : [],
  };
}

/** One event's mark opens that event, under its hazard's name as the legend gives it. */
export function ecoDisasterNoteSet(event: NaturalEvent): GlobeNoteSet {
  return { heading: HAZARD_HEADING.get(event.type) ?? event.type, notes: [ecoDisasterNote(event)] };
}
