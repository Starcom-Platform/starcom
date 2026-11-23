/**
 * The Timestream's psi lanes (decision D-PW, PW42, PW52): Psi Watch's own events through time, from Mecha Jono's
 * notes. Windows, each its curve rising to its exact or busiest moment from its profile (a band where it has none),
 * the sky events' and the focus windows' alike; Psi Alerts, each a span while it holds. Each window says how often
 * its kind recurs, for the wider views and Busy's hover, and whether the aspect lane's own sky already holds it.
 * Sealed calls join with step 9.
 */
import { ASTRO_BODIES, type AstroBody } from '../astro/sky';
import { ASPECT_KINDS, type AspectName } from '../astro/aspects';
import { readAlert, readSkyEvent, readWindowNote, type PsiFamily, type PsiFixture } from '../psiEvents';
import type { EventWindow } from '../windowProfile';
import { skyRecurrence } from './recurrence';

export interface PsiLaneItem {
  lane: 'windows' | 'alerts';
  address: string;
  title: string;
  fromMs: number;
  untilMs: number;
  /** Its exact or busiest moment, ms, where it has one. */
  peakMs?: number;
  /** A window's edges, peak and profile, its weight read from them at any moment. */
  window?: EventWindow;
  /** How often its kind recurs, days, where that is known. */
  recurrenceDays?: number;
  /** A major aspect between two of the ten bodies: the aspect lane's own sky holds it, and Busy counts it from there. */
  aspect?: { a: AstroBody; b: AstroBody; kind: AspectName };
  /** A focus window on a sky event already in the lanes: Busy counts the sky event, once. */
  onSkyEvent?: string;
}

const isBody = (b: string | undefined): b is AstroBody => (ASTRO_BODIES as readonly string[]).includes(b ?? '');

/** The major aspect a harmonic's angle names, if it is one. */
const majorAt = (angle: number | undefined): AspectName | undefined =>
  angle === undefined ? undefined : ASPECT_KINDS.find((k) => k.major && Math.abs(k.angle - (angle > 180 ? 360 - angle : angle)) < 1e-6)?.name;

/** Every psi lane item the notes give, in time order. */
export function psiLaneItems(fixtures: readonly (PsiFixture & { family: PsiFamily })[]): PsiLaneItem[] {
  const items: PsiLaneItem[] = [];
  const skyAddresses = new Set<string>();
  const skyRecurrenceOf = new Map<string, number>();
  for (const f of fixtures) {
    if (f.family !== 'psi_sky_event') continue;
    const sky = readSkyEvent(f.event);
    if (!sky) continue;
    const angle = sky.harmonic?.targetDeg;
    const recurrenceDays = skyRecurrence({ class: sky.sky.class, sub: sky.sky.sub, bodies: sky.bodies, angle });
    const [a, b] = sky.bodies;
    const kind = majorAt(angle);
    const aspect = kind && isBody(a) && isBody(b) && a !== b ? { a, b, kind } : undefined;
    skyAddresses.add(sky.address);
    if (recurrenceDays !== undefined) skyRecurrenceOf.set(sky.address, recurrenceDays);
    items.push({
      lane: 'windows', address: sky.address, title: sky.title, fromMs: sky.window.from * 1000, untilMs: sky.window.until * 1000,
      peakMs: sky.exact * 1000, window: sky.window, ...(recurrenceDays !== undefined ? { recurrenceDays } : {}), ...(aspect ? { aspect } : {}),
    });
  }
  for (const f of fixtures) {
    if (f.family === 'psi_window') {
      const note = readWindowNote(f.event);
      if (!note) continue;
      const on = note.skyEvent && skyAddresses.has(note.skyEvent) ? note.skyEvent : undefined;
      items.push({
        lane: 'windows', address: note.address, title: note.title, fromMs: note.window.from * 1000, untilMs: note.window.until * 1000,
        peakMs: note.window.peak * 1000, window: note.window, ...(on && skyRecurrenceOf.has(on) ? { recurrenceDays: skyRecurrenceOf.get(on) } : {}), ...(on ? { onSkyEvent: on } : {}),
      });
    } else if (f.family === 'psi_alert') {
      const alert = readAlert(f.event);
      if (alert.validFrom === undefined || alert.validUntil === undefined) continue;
      items.push({
        lane: 'alerts', address: alert.address, title: alert.title, fromMs: alert.validFrom * 1000, untilMs: alert.validUntil * 1000,
      });
    }
  }
  return items.sort((x, y) => x.fromMs - y.fromMs);
}
