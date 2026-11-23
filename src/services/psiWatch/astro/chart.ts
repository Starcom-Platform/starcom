/**
 * A chart for a moment and a place (decision D-PW, PW5–PW7): the bodies and the north node in a frame, each with its
 * sign, its house and whether it is retrograde; the angles; the houses; the aspects. Every chart carries its frame's
 * name, its houses' system and orbs, and what it could not give, so a card or panel says them with it.
 */
import { anglesAt, type ChartAngles } from './angles';
import { aspectsOf, ORB_SCHEME_NAMES, type Aspect, type OrbScheme } from './aspects';
import { ayanamsa, DEFAULT_FRAME, FRAME_NAMES, inFrame, signOf, type Sign, type ZodiacFrame } from './frames';
import { HOUSE_SYSTEM_NAMES, houseOf, housesOf, type HouseSystem, type Houses } from './houses';
import { skyAt, type AstroPoint } from './sky';

export interface ChartOptions {
  frame?: ZodiacFrame;
  houses?: HouseSystem;
  orbs?: OrbScheme;
}

export const DEFAULT_HOUSES: HouseSystem = 'placidus';
export const DEFAULT_ORBS: OrbScheme = 'catalogue';

export interface ChartPoint {
  body: AstroPoint;
  /** Longitude in the chart's frame, degrees, with its sign and degree in the sign. */
  lon: number;
  sign: Sign;
  degree: number;
  lat: number;
  speed: number;
  retrograde: boolean;
  /** 1–12; absent when the chart has no houses. */
  house?: number;
}

export interface Chart {
  at: string;
  place?: { lat: number; lng: number };
  frame: ZodiacFrame;
  frameName: string;
  /** The frame's offset from tropical at the moment, degrees. */
  ayanamsa: number;
  points: ChartPoint[];
  /** In the chart's frame; absent without a place. */
  angles?: Pick<ChartAngles, 'asc' | 'mc' | 'dsc' | 'ic'>;
  houses?: Houses;
  housesName?: string;
  aspects: Aspect[];
  orbs: OrbScheme;
  orbsName: string;
  /** What the chart could not give, in words to show with it. */
  caveats: string[];
}

export const NO_PLACE = 'No place, so no angles or houses: the sky alone.';
export const ASCENDANT_TURNED =
  'Past the polar circle the usual formula points to the west, where the ecliptic sets; the Ascendant here is the point rising in the east.';

/** The chart for a moment, and for a place when one is given. */
export function chartAt(at: Date, place?: { lat: number; lng: number }, options: ChartOptions = {}): Chart {
  const frame = options.frame ?? DEFAULT_FRAME;
  const orbs = options.orbs ?? DEFAULT_ORBS;
  const system = options.houses ?? DEFAULT_HOUSES;
  const sky = skyAt(at);
  const caveats: string[] = [];
  let angles: Chart['angles'];
  let houses: Houses | undefined;
  if (place) {
    const tropical = anglesAt(at, place.lat, place.lng);
    angles = {
      asc: inFrame(tropical.asc, frame, at),
      mc: inFrame(tropical.mc, frame, at),
      dsc: inFrame(tropical.dsc, frame, at),
      ic: inFrame(tropical.ic, frame, at),
    };
    houses = housesOf(system, tropical, place.lat, frame, at);
    if ('refused' in houses) caveats.push(houses.refused);
    if (tropical.ascTurned) caveats.push(ASCENDANT_TURNED);
  } else {
    caveats.push(NO_PLACE);
  }
  const cusps = houses && 'cusps' in houses ? houses.cusps : undefined;
  const points: ChartPoint[] = sky.map((position) => {
    const lon = inFrame(position.lon, frame, at);
    const { sign, degree } = signOf(lon);
    return {
      body: position.body, lon, sign, degree, lat: position.lat, speed: position.speed, retrograde: position.retrograde,
      ...(cusps ? { house: houseOf(lon, cusps) } : {}),
    };
  });
  return {
    at: at.toISOString(),
    ...(place ? { place } : {}),
    frame,
    frameName: FRAME_NAMES[frame],
    ayanamsa: ayanamsa(frame, at),
    points,
    ...(angles ? { angles } : {}),
    ...(houses ? { houses, housesName: HOUSE_SYSTEM_NAMES[system] } : {}),
    aspects: aspectsOf(sky, orbs),
    orbs,
    orbsName: ORB_SCHEME_NAMES[orbs],
    caveats,
  };
}
