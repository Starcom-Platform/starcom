// satellitePoints.ts — how each kind of satellite is drawn. The drawing itself is
// screenPoints.ts, which says why satellites are points and not spheres.
import * as THREE from 'three';
import { buildScreenPoints , type ScreenPointStyle } from './screenPoints';
import type { GlobeNoteSet } from '../../features/globe/noteDetail/globeNoteStore';
import { KIND_COLOURS, GUNMETAL } from '../../styles/tokens';
import { kindAtlas, KIND_ATLAS_ROW_COUNT, KIND_ATLAS_ROWS, type KindAtlas } from '../../features/globe/marks/kindAtlas';

/**
 * Every satellite's on-screen diameter in CSS pixels — the same for all of them.
 *
 * This was pointSizeForType: 11 for a station, 8 for scientific and GPS, 7 for
 * the rest. Colour already said the same thing, so the legend read "size: role —
 * stations largest" beside "colour: role": one fact spent on two channels. And
 * size reads as MORE, so it put a category on a magnitude channel — a station is
 * not more than debris.
 *
 * Nothing honest was left for it to carry. Altitude is already on position
 * (satellites are drawn at their true altitude, useGlobeSatellites), and
 * CelesTrak's orbital elements carry no physical size. So size is uniform, the
 * key no longer claims it means anything, and each channel says one thing
 * (decision D-F, 2026-09-19).
 *
 * 5, the smallest that keeps the layer audit's 4 px floor on a card (a 1400-wide
 * canvas lands about 0.87x on a 1200-wide one). It was 8 for the hundred drawn
 * before D-GV GV2; the whole catalogue, some 16,000, at 8 buried the Earth under
 * a crust of discs (seen on the build, 2026-10-24).
 */
export const SATELLITE_MARK_PX = 5;

/**
 * Each kind's colour, one hue for every satellite (critique-2026-11-01, OR3, OR30): the space kind's. The many are
 * quiet and the few stand out, as D-GV GV2 had them, now by brightness rather than hue: Starlink, some 7,000, and the
 * unnamed rest, near as many, in the space colour dimmed toward gunmetal, so they read as a shell round the planet;
 * the roles a person looks for in the full colour, each with its icon close in; debris the dim rose it was.
 */
const SPACE = new THREE.Color(KIND_COLOURS.space).getHex();
const QUIET_SPACE = new THREE.Color(KIND_COLOURS.space).lerp(new THREE.Color(GUNMETAL[700]), 0.55).getHex();
export function colorForType(type: string): number {
  return type === 'debris' ? 0x8a5a66 : type === 'starlink' || type === 'other' ? QUIET_SPACE : SPACE;
}

/**
 * Each named role's kind in the lexicon, for its icon close in (OR30). Starlink, the unnamed and debris have none:
 * thousands of them in view even close in, they stay dots.
 */
export const SATELLITE_KIND: Readonly<Record<string, string>> = {
  space_station: 'space:satellite:station',
  gps_satellite: 'space:satellite:navigation',
  communication: 'space:satellite:communications',
  weather: 'space:satellite:weather',
  scientific: 'space:satellite:science',
  military: 'space:satellite:military',
};

/** The roles' icons, baked once. */
export const satelliteIconAtlas = (): Promise<KindAtlas> => kindAtlas(Object.values(SATELLITE_KIND));

/** Close in: below this height above the ground, in Earth radii, a named role is its icon. */
export const SATELLITE_ICON_NEAR_ALTITUDE = 1.0;
/** An icon's diameter close in. */
export const SATELLITE_ICON_PX = 18;

/** The key's swatches for the satellites drawn: the named roles, the quiet many and debris, each where there is one. */
export function satelliteSwatches(types: Iterable<string>): Array<{ color: string; label: string }> {
  const present = new Set(types);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  return [
    ...([...present].some((t) => SATELLITE_KIND[t]) ? [{ color: hex(SPACE), label: 'Named roles: stations, GPS, weather, science, military, communications; each its icon close in' }] : []),
    ...(present.has('starlink') || present.has('other') ? [{ color: hex(QUIET_SPACE), label: 'Starlink and the unnamed' }] : []),
    ...(present.has('debris') ? [{ color: hex(colorForType('debris')), label: 'Debris' }] : []),
  ];
}

/**
 * What a reader should call this kind of satellite.
 *
 * Beside colorForType deliberately: the label and the colour it labels are one
 * decision, and splitting them is how a legend drifts from the picture.
 */
export function labelForType(type: string): string {
  return type === 'space_station' ? 'Space station'
    : type === 'gps_satellite' ? 'GPS'
      : type === 'scientific' ? 'Scientific'
        : type === 'starlink' ? 'Starlink'
          : type === 'weather' ? 'Weather'
            : type === 'communication' ? 'Communication'
              : type === 'military' ? 'Military'
                : type === 'debris' ? 'Debris'
                  : 'Other';
}

export interface SatellitePointsInput {
  position: THREE.Vector3;
  type: string;
  /** What a hover says. The catalogue knows the name; the picture cannot. */
  tooltip?: string;
  /** What a click on it opens: its catalogue record (critique C5). */
  opens?: GlobeNoteSet;
}

/** Every satellite as one point, coloured by its type, in one draw call. */
export function buildSatellitePoints(
  satellites: readonly SatellitePointsInput[],
  userData: Record<string, unknown> = {},
  /** How the person chose to draw this layer (decision D-F, step 6.3); the roles' icons, when baked (OR30). */
  options: { style?: ScreenPointStyle; blend?: boolean; icons?: KindAtlas | null } = {},
): THREE.Points {
  const atlas = options.icons?.texture ? options.icons : null;
  // Bright fills, so a dark rim: it keeps them visible where they cross bright cloud.
  return buildScreenPoints(
    satellites.map((s) => ({
      position: s.position, sizePx: SATELLITE_MARK_PX, color: colorForType(s.type), tooltip: s.tooltip, opens: s.opens,
      ...(atlas && SATELLITE_KIND[s.type] ? { iconCell: atlas.cellOf(SATELLITE_KIND[s.type]) } : {}),
    })),
    {
      rim: 'dark', userData: { layer: 'Satellites', ...userData }, style: options.style, blend: options.blend,
      icons: atlas ? {
        atlas: atlas.texture as THREE.Texture, cellCount: atlas.kinds.length, rowCount: KIND_ATLAS_ROW_COUNT,
        row: KIND_ATLAS_ROWS.icon, sizePx: SATELLITE_ICON_PX, nearAltitude: SATELLITE_ICON_NEAR_ALTITUDE,
      } : null,
    },
  );
}
