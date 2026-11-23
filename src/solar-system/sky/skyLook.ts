/**
 * Sky from a place (critique-2026-11-01, OR9, OR32, OR41–OR43; plan D5): who stands where, and where they look. The
 * observer is the point of the globe under the view's centre when Sky is chosen (OR43); a drag turns the view and the
 * wheel widens or narrows it (OR42). Kept for this page only: a new visit starts at the globe.
 */
import { useSyncExternalStore } from 'react';

export interface SkyLook {
  /** The observer, degrees. */
  lat: number;
  lng: number;
  /** Where they look: the azimuth from north through east, and the altitude above the horizon, degrees. */
  az: number;
  alt: number;
  /** The view's height, degrees (OR42: 120 down to 5). */
  fov: number;
}

export const SKY_FOV_MIN = 5;
export const SKY_FOV_MAX = 120;
/** Looking up as Sky opens: south in the north, north in the south, a third of the way up, the view 70° high. */
export const SKY_OPEN_ALT = 30;
export const SKY_OPEN_FOV = 70;

let look: SkyLook | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

const wrap = (deg: number) => ((deg % 360) + 360) % 360;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Opens Sky at a place, looking toward the equator, a third of the way up. */
export function openSky(lat: number, lng: number): SkyLook {
  // A longitude already within ±180 is kept as given, to the last digit.
  const within = lng >= -180 && lng <= 180 ? lng : wrap(lng + 180) - 180;
  look = { lat: clamp(lat, -90, 90), lng: within, az: lat >= 0 ? 180 : 0, alt: SKY_OPEN_ALT, fov: SKY_OPEN_FOV };
  tell();
  return look;
}

/** Turns or widens the view; the place stays. */
export function setSkyLook(patch: Partial<Pick<SkyLook, 'az' | 'alt' | 'fov'>>): void {
  if (!look) return;
  look = {
    ...look,
    ...(patch.az !== undefined ? { az: wrap(patch.az) } : {}),
    ...(patch.alt !== undefined ? { alt: clamp(patch.alt, -10, 90) } : {}),
    ...(patch.fov !== undefined ? { fov: clamp(patch.fov, SKY_FOV_MIN, SKY_FOV_MAX) } : {}),
  };
  tell();
}

/*
 * Whether closing Sky lifts the camera over the place it was seen from: yes when the person chooses another scale; no
 * when something else is moving the camera (globeCameraMath.setGlobePointOfView), which a flight over the place would
 * otherwise undo, landing after it.
 */
let liftOnClose = true;
/** The next close goes straight to where the camera is being sent. */
export function closeWithoutLift(): void { liftOnClose = false; }
/** Whether this close lifts the camera over the place; asked once a close. */
export function takeLiftOnClose(): boolean { const lift = liftOnClose; liftOnClose = true; return lift; }

/** Closes Sky: the globe again. */
export function closeSky(): void {
  if (!look) return;
  look = null;
  tell();
}

export const skyLook = (): SkyLook | null => look;
export function subscribeSkyLook(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const useSkyLook = (): SkyLook | null => useSyncExternalStore(subscribeSkyLook, skyLook, skyLook);

/** Test-only. */
export function resetSkyLookForTests(): void { look = null; liftOnClose = true; }
