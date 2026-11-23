/**
 * A Psi Watch sky event or window on a card (decision D-PW, PW62, PW77; Mecha Jono's kit, `schemas_psi.md` §3.6, the
 * shot subject `{ psiEvent: <address>, at: "exact" | <unix> }`): its front page, the moment it is drawn at, where the
 * camera looks from, and the layer that draws it. The page states the event as its note gives it: its title, its exact
 * moment and its window in UTC, an ingress's signs, a window's places. Nothing beside them but the one Experimental
 * badge (PW34, template `psi`); the capture's own caveats stay, as every card's do (PW77).
 */
import { readSkyEvent, readWindowNote, type PsiNote, type PsiSkyEvent, type PsiWindowNote } from '../../../services/psiWatch/psiEvents';
import { ASTRO_BODIES, type AstroBody } from '../../../services/psiWatch/astro/sky';
import { equatorialOfDate, gastDeg, wrap180 } from '../../../services/psiWatch/astro/lines';
import { centreOf } from '../../../services/intel/globe/linkedRecordPlacement';
import { formatUtcDateTime } from '../../../utils/utcTime';
import type { PsiFrontPage } from './shareCardProvenance';

export { PSI_ADDRESS, isPsiAddress } from './psiAddress';

/** How far out a psi card looks, in globe radii: the whole of a body's lines, pole to pole, on the near side. */
export const PSI_ALTITUDE = 2.5;

export interface StagedPsiEvent {
  page: PsiFrontPage;
  /** The sky event Planet lines draw: the event itself, or the window's own. */
  sky: PsiSkyEvent | null;
  /** The layer that draws it: Planet lines for a sky event, Windows for a window. */
  primary: 'PsiLines' | 'PsiWindows';
  view: { lat: number; lng: number; altitude: number } | null;
}

const when = (s: number) => formatUtcDateTime(s * 1000, { year: true });
const astroBodies = (bodies: readonly string[]) => bodies.filter((b): b is AstroBody => (ASTRO_BODIES as readonly string[]).includes(b));

/** Where a body stands overhead at a moment: its declination, and its right ascension less the sidereal time. */
export function subPoint(body: AstroBody, atS: number): { lat: number; lng: number } {
  const at = new Date(atS * 1000);
  const { ra, dec } = equatorialOfDate(body, at);
  return { lat: dec, lng: wrap180(ra - gastDeg(at)) };
}

/**
 * The event at `address` among these notes, drawn at `at`, or why not. A window's sky event is its `a` tag's; its
 * places centre the view, else its sky event's first body does, overhead at the moment.
 */
export function psiCard(
  notes: readonly PsiNote[],
  address: string,
  at: 'exact' | number,
  zoneCentre: (id: string) => { lat: number; lng: number } | null,
): StagedPsiEvent | { refused: string } {
  const addressOf = (note: PsiNote) => `${note.kind}:${note.pubkey}:${note.tags.find((t) => t[0] === 'd')?.[1] ?? ''}`;
  const note = notes.find((n) => addressOf(n) === address);
  if (!note) return { refused: `No Psi Watch event "${address}": a sky event's or a window's address, as the kit or the live notes give it.` };
  const isWindow = address.split(':')[2].startsWith('psi-window-');
  const windowNote: PsiWindowNote | null = isWindow ? readWindowNote(note) : null;
  const skyNote = isWindow ? notes.find((n) => addressOf(n) === windowNote?.skyEvent) : note;
  const sky = skyNote ? readSkyEvent(skyNote) : null;
  const window = windowNote?.window ?? sky?.window ?? null;
  if (!window || (!isWindow && !sky)) return { refused: `"${address}" has no window to draw: its note is not a sky event or a window.` };
  const exactS = sky?.exact ?? window.peak;
  const atS = at === 'exact' ? Math.round(exactS) : at;
  if (atS < Math.floor(window.from) || atS > Math.ceil(window.until)) {
    return { refused: `subject.at ${atS} is outside the event's window, ${Math.floor(window.from)} to ${Math.ceil(window.until)}: give a moment inside it, or "exact".` };
  }
  const bodies = sky?.bodies ?? [];
  const zones = windowNote?.zones ?? [];
  const lines = [
    `Exact ${when(exactS)} · its window ${when(window.from)} to ${when(window.until)}`,
    ...(sky?.frame ? [`${sky.frame.from} → ${sky.frame.to} (${sky.frame.frame === 'sidereal_gc' ? 'GC' : 'tropical'})`] : []),
    ...(zones.length ? [`In ${zones.map((z) => z.name).join(', ')}`] : []),
    ...(windowNote?.jurisdictions.length ? [`Jurisdictions: ${windowNote.jurisdictions.join(', ')}`] : []),
    ...(at === 'exact' ? [] : [`Drawn at ${when(atS)}`]),
  ];
  const placed = zones.map((z) => zoneCentre(z.id)).filter((c): c is { lat: number; lng: number } => c !== null);
  const among = placed.length ? centreOf(placed.map((c) => ({ latitude: c.lat, longitude: c.lng }))) : null;
  const first = astroBodies(bodies)[0];
  const facing = among ? { lat: among.lat, lng: among.lng } : first ? subPoint(first, atS) : null;
  return {
    page: {
      kind: 'psi_event', address, family: isWindow ? 'psi_window' : 'psi_sky_event',
      title: windowNote?.title || sky?.title || address,
      lines, exactS, window: { fromS: window.from, peakS: window.peak, untilS: window.until }, atS, bodies, zones,
    },
    sky,
    primary: isWindow ? 'PsiWindows' : 'PsiLines',
    view: facing ? { ...facing, altitude: PSI_ALTITUDE } : null,
  };
}
