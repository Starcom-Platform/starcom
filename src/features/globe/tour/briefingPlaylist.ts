/**
 * A briefing playlist's stops: the auto-tour, one brief at a time (block G, item
 * 6.1; record docs/missions/01-architecture-decisions/briefing-playlists.md).
 *
 * Pure. What a playlist holds comes from its layer (playlistSources.ts), already
 * said in the layer's own words and ranked by it; this picks the worst of them,
 * orders them so the camera does not zigzag, and gives each its pose and how long
 * it is held. The player moves the camera; nothing here does.
 *
 * ─── THE ORDER (BP2) ──────────────────────────────────────────────────────
 *
 * Worst first, by region. The worst twelve are taken from every group, so a busy
 * theatre's reports never push a critical item elsewhere off the tour. A group
 * (a theatre, a state) stays together, in the place its worst item earns it.
 * Inside a group the worse rank comes first, and among equals the nearest to the
 * stop before: the camera works through a region before it leaves.
 */
import type { CameraKeyframe } from '../capture/cameraTrack';

export type PlaylistId = 'war' | 'raves' | 'heat' | 'heroes';

export const PLAYLISTS: readonly PlaylistId[] = ['war', 'raves', 'heat', 'heroes'];

export const PLAYLIST_TITLES: Readonly<Record<PlaylistId, string>> = {
  war: 'War & Conflict today',
  raves: 'Raver Watch tonight',
  heat: 'Heat watch',
  // Hero Watch's relief and open field missions (hero-watch.md, HW13).
  heroes: 'Hero Watch this week',
};

/**
 * How a playlist orders its stops, as its opening and a clip's end card say it (BP2). The three briefs
 * rank how bad, so a tour that leaves some out keeps the worst; Hero Watch's ranks no harm, its relief
 * by size and its missions by when they close, so it never says worst (HW13).
 */
export const PLAYLIST_ORDER: Readonly<Record<PlaylistId, { order: string; worstFirst: boolean }>> = {
  war: { order: 'worst first, by region', worstFirst: true },
  raves: { order: 'worst first, by region', worstFirst: true },
  heat: { order: 'worst first, by region', worstFirst: true },
  heroes: { order: 'relief, the largest first, then field missions, the soonest to close first', worstFirst: false },
};

export interface Pose {
  lat: number;
  lng: number;
  altitude: number;
}

/** An item a playlist may stop at, as its layer says it. */
export interface TourCandidate {
  id: string;
  title: string;
  /** Where the camera looks. */
  position: { lat: number; lng: number };
  /** The item's own lines, as its card states them. */
  lines: readonly string[];
  /** Why it is on the tour, in one line: "Critical, as Mecha Jono tagged it". */
  why: string;
  /** Lower comes first: the layer's own order of how bad. */
  rank: number;
  /** Among equal ranks, the larger first: when it was reported, or minus a start time for soonest first. */
  at: number;
  /** The theatre or region it is toured with. */
  group: string;
  /** Its lines, by index, a caption burned into a clip never cuts: a field mission's safety limits (HW13). */
  neverCut?: readonly number[];
}

/** What a layer offers a tour: its candidates, and whether its read of The Record is done. */
export interface TourOffer {
  candidates: TourCandidate[];
  /** False while the layer is still reading: what has arrived may not be all there is. */
  complete: boolean;
}

export interface TourStop {
  candidate: TourCandidate;
  pose: Pose;
  holdMs: number;
}

export interface Playlist {
  id: PlaylistId;
  title: string;
  /** The whole planet, over the first stop (IM9). */
  opening: Pose;
  stops: TourStop[];
  /** How many the layer offered: more than the stops when the tour left some out (BP7). */
  total: number;
  /** Planned before the layer finished reading: it tours what had arrived. */
  partial: boolean;
}

/** At most this many stops (BP7). */
export const MAX_STOPS = 12;
/** One item, framed as Show on globe frames it (BP8). */
export const STOP_ALTITUDE = 1.8;
/** The whole planet: the opening, and the top of a long flight (BP8). */
export const PLANET_ALTITUDE = 2.5;
/** The camera's vertical field of view: globe.gl's, three.js's default, which the app does not change. */
const VIEW_FOV_DEG = 50;
/**
 * How far above the middle of the frame a stop's item is drawn, in normalized device units (critique C34): 0.36
 * puts it about a third of the way down, above the caption at the foot of the screen (whose top is about two thirds
 * down) and a clip's (at most 38% of the frame, above a 5% margin).
 */
export const ITEM_ABOVE_CENTRE = 0.36;

/**
 * Where the camera aims for a stop (critique C34: "the details block the globe"): south of the item, so the item is
 * drawn ITEM_ABOVE_CENTRE above the frame's middle, north being up. The camera looks at the planet's centre from over
 * its aim; a surface point `δ` north of the aim is drawn sin δ / ((1 + altitude − cos δ) tan(fov/2)) above the middle,
 * so δ is found from that, short of the horizon. Never past the pole: an item near it is drawn a little lower.
 */
export function framedPose(position: { lat: number; lng: number }, altitude: number, above = ITEM_ABOVE_CENTRE): Pose {
  const distance = 1 + altitude;
  const tan = Math.tan((VIEW_FOV_DEG * Math.PI) / 360);
  const drawnAbove = (delta: number) => Math.sin(delta) / ((distance - Math.cos(delta)) * tan);
  let lo = 0;
  let hi = Math.acos(1 / distance) * 0.8;
  if (drawnAbove(hi) > above) {
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (drawnAbove(mid) < above) lo = mid; else hi = mid;
    }
  }
  const southDeg = ((lo + hi) / 2) * (180 / Math.PI);
  return { lat: Math.max(-89, position.lat - southDeg), lng: position.lng, altitude };
}
/** A flight between stops (BP4). */
export const FLIGHT_MS = 2500;
/** Past this much arc, a flight rises to the whole planet on the way (BP8). */
export const RISE_OVER_DEG = 30;
/** Reading time, as a clip's end card holds its pages (clipEndCard.ts; BP4). */
export const HOLD = { baseMs: 4000, perLineMs: 1200, maxMs: 9000 } as const;

const byWorst = (a: TourCandidate, b: TourCandidate) =>
  a.rank - b.rank || b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const RAD = Math.PI / 180;

/** The angle between two places, in degrees, along the sphere. */
export function arcDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const cos = Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD)
    + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lng - a.lng) * RAD);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / RAD;
}

/** The stops a playlist visits, in order: the worst twelve, by region (BP2, BP7). */
export function orderStops(candidates: readonly TourCandidate[]): TourCandidate[] {
  const chosen = [...candidates].sort(byWorst).slice(0, MAX_STOPS);
  // Groups in the order their worst member was chosen in.
  const groups = new Map<string, TourCandidate[]>();
  for (const c of chosen) {
    const members = groups.get(c.group);
    if (members) members.push(c);
    else groups.set(c.group, [c]);
  }
  const order: TourCandidate[] = [];
  for (const members of groups.values()) {
    const left = [...members];
    let previous: TourCandidate | null = null;
    while (left.length) {
      const rank = Math.min(...left.map((c) => c.rank));
      const tied = left.filter((c) => c.rank === rank);
      // The worst of the group opens it; among equals after that, the nearest to the stop before.
      const next: TourCandidate = previous === null ? tied[0] : nearestTo(previous, tied);
      order.push(next);
      left.splice(left.indexOf(next), 1);
      previous = next;
    }
  }
  return order;
}

/** The nearest of `among` to `from`; the first of equals, so the same items make the same tour. */
function nearestTo(from: TourCandidate, among: readonly TourCandidate[]): TourCandidate {
  return among.reduce((best, c) => (arcDegrees(from.position, c.position) < arcDegrees(from.position, best.position) ? c : best));
}

/** How long a stop is held: reading time for its why and its lines (BP4). */
export function holdMsFor(candidate: TourCandidate): number {
  return Math.min(HOLD.maxMs, HOLD.baseMs + HOLD.perLineMs * (1 + candidate.lines.length));
}

/** A playlist of the candidates its layer offered, or null when there are none. */
export function planPlaylist(id: PlaylistId, candidates: readonly TourCandidate[], options: { partial?: boolean } = {}): Playlist | null {
  const order = orderStops(candidates);
  if (!order.length) return null;
  const first = order[0].position;
  return {
    id,
    title: PLAYLIST_TITLES[id],
    opening: { lat: first.lat, lng: first.lng, altitude: PLANET_ALTITUDE },
    stops: order.map((candidate) => ({
      candidate,
      // Framed so the caption never covers it (C34); the item itself stays where it is, for its ping.
      pose: framedPose(candidate.position, STOP_ALTITUDE),
      holdMs: holdMsFor(candidate),
    })),
    total: candidates.length,
    partial: options.partial ?? false,
  };
}

/** Longitude in (-180, 180]. */
const wrap = (lng: number) => {
  const l = ((lng + 180) % 360 + 360) % 360 - 180;
  return l === -180 ? 180 : l;
};

/**
 * The keyframes of a flight from one pose to the next: straight between near
 * stops, and up to the whole planet midway across more than 30° of arc, so a
 * long flight shows where it is going rather than skimming the ground (BP8).
 * Midway the short way round, as the camera track interpolates.
 */
export function flightKeyframes(from: Pose, to: Pose, ms = FLIGHT_MS): CameraKeyframe[] {
  const start = { ...from, atMs: 0 };
  const end = { ...to, atMs: ms };
  if (arcDegrees(from, to) <= RISE_OVER_DEG) return [start, end];
  const dLng = ((to.lng - from.lng + 540) % 360) - 180;
  const mid = {
    lat: (from.lat + to.lat) / 2,
    lng: wrap(from.lng + dLng / 2),
    altitude: Math.max(PLANET_ALTITUDE, from.altitude, to.altitude),
    atMs: ms / 2,
  };
  return [start, mid, end];
}
