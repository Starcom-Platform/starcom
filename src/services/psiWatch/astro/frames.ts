/**
 * The zodiac's frames (decision D-PW, PW5): the Galactic Centre frame by default, as the owner's own tools set it,
 * with the Galactic Centre at 0° Sagittarius; and tropical. The Galactic Centre frame is anchored to the Centre
 * itself, Sagittarius A*, at its apparent place of each moment (precessed, nutated and aberrated, as Mecha Jono's
 * catalogue computes it), so its offset (the ayanamsa) is measured, never an astrologer's convention or a fit: it
 * comes to 26.4° in 1970 and 27.8° in 2070, as those tools give it. Every chart states its frame.
 */
import * as Astronomy from 'astronomy-engine';
import { norm360 } from './sky';

export type ZodiacFrame = 'galactic' | 'tropical';
export const ZODIAC_FRAMES: readonly ZodiacFrame[] = ['galactic', 'tropical'];
export const DEFAULT_FRAME: ZodiacFrame = 'galactic';

/** Each frame as a chart names it. */
export const FRAME_NAMES: Record<ZodiacFrame, string> = {
  galactic: 'Galactic Centre (sidereal, the Centre at 0° Sagittarius)',
  tropical: 'Tropical',
};

// Sagittarius A*, the Galactic Centre (ICRS, J2000; about 26,700 light years off), and the longitude the frame gives it.
const GALACTIC_CENTRE = { raDeg: 266.41683, decDeg: -29.00781, lightYears: 26_700, at: 240 };
// One of astronomy-engine's eight star slots, held for the Centre; nothing else in Starcom defines one.
const CENTRE_SLOT = Astronomy.Body.Star8;
Astronomy.DefineStar(CENTRE_SLOT, GALACTIC_CENTRE.raDeg / 15, GALACTIC_CENTRE.decDeg, GALACTIC_CENTRE.lightYears);

/** The Galactic Centre's apparent tropical ecliptic longitude of date (the true equinox, as sky.ts gives the bodies). */
export function galacticCentreLongitude(at: Date): number {
  const apparent = Astronomy.GeoVector(CENTRE_SLOT, at, true);
  return norm360(Astronomy.SphereFromVector(Astronomy.RotateVector(Astronomy.Rotation_EQJ_ECT(at), apparent)).lon);
}

/** How far a frame stands from the tropical zodiac at a moment, degrees: 0 for tropical. */
export function ayanamsa(frame: ZodiacFrame, at: Date): number {
  if (frame === 'tropical') return 0;
  return norm360(galacticCentreLongitude(at) - GALACTIC_CENTRE.at);
}

/** A tropical longitude in a frame. */
export const inFrame = (tropicalLon: number, frame: ZodiacFrame, at: Date): number => norm360(tropicalLon - ayanamsa(frame, at));

export const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'] as const;
export type Sign = (typeof SIGNS)[number];

/** A longitude as its sign and its degree within it: `{ sign: 'Leo', degree: 12.4 }`. */
export function signOf(lon: number): { sign: Sign; degree: number } {
  const l = norm360(lon);
  return { sign: SIGNS[Math.floor(l / 30) % 12], degree: l % 30 };
}
