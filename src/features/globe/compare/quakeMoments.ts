/**
 * The quakes at two moments (D-CM, CM1, CM4): the other moment's window, and its quakes as the flags take them.
 *
 * Earlier: the same window a week, a month, a year or ten years before, in the right half, by the calendar (a year
 * earlier is the same dates). Held: the window shown when the comparison began, in the left half, the time bar's
 * wherever it is paused in the right. Either is read as any paused window is (quakeWindowFor): the feeds inside the
 * last 30 days, the history before.
 */
import type { NaturalEvent } from '../../../hooks/useGeoEvents';
import { quakeWindowFor, type QuakeWindow } from '../../../services/quakes/quakeWindow';
import { formatEcoDisasterTooltip } from '../../../components/EcoNatural/formatters';
import { ecoDisasterNoteSet } from '../noteDetail/ecoDisasterNote';
import { quakeInBands } from '../marks/quakeFlags';
import type { EcoKindInput } from '../marks/ecoKindMarks';
import type { MomentPick } from '../../../globe-engine/compareLayers';

export const EARLIER_CHOICES = ['1w', '1mo', '1y', '10y'] as const;
export type Earlier = (typeof EARLIER_CHOICES)[number];

const DAY_MS = 86_400_000;

/** A moment so much earlier, by the calendar: a month earlier is the same day of the month before. */
export function earlierMoment(ms: number, by: Earlier): number {
  if (by === '1w') return ms - 7 * DAY_MS;
  const d = new Date(ms);
  if (by === '1mo') d.setUTCMonth(d.getUTCMonth() - 1);
  else d.setUTCFullYear(d.getUTCFullYear() - (by === '1y' ? 1 : 10));
  return d.getTime();
}

/** The other moment's window, read as a paused window is, for the window shown now. */
export function thenQuakeWindow(pick: MomentPick, shown: Pick<QuakeWindow, 'from' | 'until'>, now: number): QuakeWindow {
  const span = 'earlier' in pick
    ? { start: earlierMoment(shown.from, pick.earlier), end: earlierMoment(shown.until, pick.earlier) }
    : 'held' in pick ? { start: pick.held.from, end: pick.held.until } : { start: shown.from, end: shown.until };
  return quakeWindowFor({ range: 'all', paused: span, now });
}

/** A window's quakes as the flags take them: placed, in the bands the rail chose, each with its hover and its note. */
export function quakeKindInputs(
  events: readonly NaturalEvent[],
  bands: { magnitudes: readonly string[]; depths: readonly string[] },
): Array<EcoKindInput & { depthKm?: number | null }> {
  return events
    .filter((e) => e.type === 'earthquake' && Number.isFinite(e.lat) && Number.isFinite(e.lng))
    .filter((e) => quakeInBands(e.magnitude, e.depthKm, bands.magnitudes, bands.depths))
    .map((e) => ({
      id: String(e.id),
      lat: e.lat,
      lng: e.lng,
      hazardType: 'earthquake',
      magnitude: e.magnitude ?? null,
      severityBucket: e.severityBucket ?? null,
      timestamp: e.timestamp ?? null,
      tsunami: e.tsunami === true,
      tooltip: formatEcoDisasterTooltip(e),
      opens: ecoDisasterNoteSet(e),
      ...(e.shakeMapDetailUrl ? { shakeMapDetailUrl: e.shakeMapDetailUrl } : {}),
      ...(e.atlas ? { atlas: e.atlas } : {}),
      depthKm: typeof e.depthKm === 'number' ? e.depthKm : null,
    }));
}
