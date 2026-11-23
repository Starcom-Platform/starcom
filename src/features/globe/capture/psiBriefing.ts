/**
 * The PsiOps Briefing on a card (decision D-PW, PW62, PW77): the coming week from the card's moment on its front page,
 * its windows with their Zones and exact moments, Kp's largest expected value and its day, and the Psi Alerts open;
 * a Timestream strip under the globe. The notes' own words and nothing beside them but the one badge (PW34).
 */
import { readAlert, readSkyEvent, readWindowNote, type PsiNote, type PsiSkyEvent } from '../../../services/psiWatch/psiEvents';
import { kpBars, kpName, type KpRecord } from '../../../services/psiWatch/timestream/kp';
import { ASTRO_BODIES, type AstroBody } from '../../../services/psiWatch/astro/sky';
import { centreOf } from '../../../services/intel/globe/linkedRecordPlacement';
import { formatUtcDate, formatUtcDateTime } from '../../../utils/utcTime';
import { PSI_ALTITUDE, subPoint } from './psiCard';
import type { PsiBriefingPage } from './shareCardProvenance';

const DAY_S = 86_400;
/** The week a briefing covers, from its moment. */
export const BRIEFING_DAYS = 7;
/** Windows named on the page, at most; the rest counted. */
const WINDOWS_NAMED = 5;
/** The expected and the forecast, as a briefing reads Kp ahead. */
const AHEAD = new Set(['predicted', 'outlook', 'estimated', 'observed']);

const when = (s: number) => formatUtcDateTime(s * 1000, { year: false });

export interface StagedBriefing {
  page: PsiBriefingPage;
  /** The week's first sky event, opened so Planet lines draw it; null when the week has none. */
  sky: PsiSkyEvent | null;
  view: { lat: number; lng: number; altitude: number } | null;
}

export function psiBriefing(
  notes: readonly PsiNote[],
  kp: KpRecord | null,
  atS: number,
  zoneCentre: (id: string) => { lat: number; lng: number } | null,
): StagedBriefing {
  const untilS = atS + BRIEFING_DAYS * DAY_S;
  const isFamily = (note: PsiNote, family: string) => note.tags.some((t) => t[0] === 't' && t[1] === family);
  const skies = notes.filter((n) => isFamily(n, 'psi_sky_event')).map(readSkyEvent).filter((s): s is PsiSkyEvent => s !== null);
  const windowNotes = notes.filter((n) => isFamily(n, 'psi_window')).map(readWindowNote).filter((w) => w !== null);
  // The week's windows: each sky event exact in it, each focus window peaking in it, soonest first.
  const windows = [
    ...skies.filter((s) => s.exact >= atS && s.exact < untilS).map((s) => ({ title: s.title, at: s.exact, zones: [] as { id: string; name: string }[] })),
    ...windowNotes.filter((w) => w!.window.peak >= atS && w!.window.peak < untilS).map((w) => ({ title: w!.title, at: w!.window.peak, zones: w!.zones })),
  ].sort((a, b) => a.at - b.at);
  const alerts = notes.filter((n) => isFamily(n, 'psi_alert')).map(readAlert)
    .filter((a) => a.validFrom !== undefined && a.validUntil !== undefined && a.validFrom <= atS && atS <= a.validUntil);
  // Kp ahead: the week's largest, measured or expected, and its day.
  const bars = kp ? kpBars(kp, { startMs: atS * 1000, spanMs: BRIEFING_DAYS * DAY_S * 1000 }, 'slots').filter((b) => AHEAD.has(b.basis) && b.kp !== undefined) : [];
  const top = bars.reduce<(typeof bars)[number] | null>((best, b) => (!best || (b.kp ?? 0) > (best.kp ?? 0) ? b : best), null);

  const lines = [
    ...(windows.length ? windows.slice(0, WINDOWS_NAMED).map((w) => `${w.title} · exact ${when(w.at)}${w.zones.length ? ` · in ${w.zones.map((z) => z.name).join(', ')}` : ''}`)
      : ['No window in the week.']),
    ...(windows.length > WINDOWS_NAMED ? [`And ${windows.length - WINDOWS_NAMED} more in the week.`] : []),
    ...(top ? [`Kp, the week's largest: ${kpName(top.kp ?? 0)} on ${formatUtcDate(top.fromMs, { year: false })}${top.basis === 'predicted' || top.basis === 'outlook' ? ', expected' : ''}`] : []),
    ...(alerts.length ? alerts.map((a) => `Psi Alert open in ${a.zone.name} until ${when(a.validUntil!)}`) : ['No Psi Alert open.']),
  ];

  const places = [...windows.flatMap((w) => w.zones), ...alerts.map((a) => a.zone)]
    .map((z) => zoneCentre(z.id)).filter((c): c is { lat: number; lng: number } => c !== null);
  const among = places.length ? centreOf(places.map((c) => ({ latitude: c.lat, longitude: c.lng }))) : null;
  const sky = skies.filter((s) => s.exact >= atS && s.exact < untilS).sort((a, b) => a.exact - b.exact)[0] ?? null;
  const first = sky?.bodies.find((b): b is AstroBody => (ASTRO_BODIES as readonly string[]).includes(b));
  const facing = among ? { lat: among.lat, lng: among.lng } : first && sky ? subPoint(first, sky.exact) : null;
  return {
    page: {
      kind: 'psi_briefing', fromS: atS, untilS,
      title: `PsiOps Briefing · ${formatUtcDate(atS * 1000, { year: false })} to ${formatUtcDate(untilS * 1000, { year: true })}`,
      lines, windows: windows.length, alerts: alerts.length,
      kpTop: top ? { kp: top.kp ?? 0, fromS: Math.floor(top.fromMs / 1000), basis: top.basis } : null,
    },
    sky,
    view: facing ? { ...facing, altitude: PSI_ALTITUDE } : null,
  };
}
