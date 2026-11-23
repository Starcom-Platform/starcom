/**
 * The debris spread's lapse, drawn (D-GV GV2, step 6; the owner chose a modelled spread, 2026-10-24): each piece of
 * the three clouds where it is today, turned back about the pole by how far its plane has turned since its breakup
 * (debrisSpread.ts), played from the first breakup to now. A piece is drawn from its own cloud's breakup on: before
 * it, it did not exist, so it waits at the Earth's centre, where the planet hides it.
 *
 * A step a frame turns about 3,000 points on the page's thread: a few hundred sines and cosines a millisecond is
 * nothing beside a frame, and the screen points' shader, which ten layers draw through, stays as it is.
 */
import * as THREE from 'three';
import { buildSatellitePoints } from './satellitePoints';
import { disposeScreenPoints, type ScreenPointStyle } from './screenPoints';
import { turnBack, DAY_MS, type SpreadTurn } from '../../services/Satellites/debrisSpread';

/** The years since the first breakup, played in this long. */
export const LAPSE_PLAY_MS = 24_000;
/** Today, held this long at the end before the live view returns. */
export const LAPSE_HOLD_MS = 2_500;
/** How a probe or a test finds the lapse's marks. */
export const DEBRIS_LAPSE_TYPE = 'debrisLapse';

export interface DebrisLapse {
  points: THREE.Points;
  /** When the lapse starts: the first breakup, in ms since the epoch. */
  startMs: number;
  /** Draws the moment `progress` of the way from the first breakup to now, 0 to 1, and returns that moment. */
  at(progress: number): number;
  dispose(): void;
}

/**
 * The lapse for these pieces, from today's positions (x, y, z per catalogue index, as the snapshots hold them) at
 * `nowMs`; null when there is nothing to play.
 */
export function buildDebrisLapse(
  turns: readonly SpreadTurn[], today: ArrayLike<number>, nowMs: number, style?: ScreenPointStyle,
): DebrisLapse | null {
  if (turns.length === 0) return null;
  const startMs = Math.min(...turns.map((turn) => turn.bornMs));
  const points = buildSatellitePoints(
    turns.map((turn) => ({
      position: new THREE.Vector3(today[turn.index * 3], today[turn.index * 3 + 1], today[turn.index * 3 + 2]),
      type: 'debris',
    })),
    { type: DEBRIS_LAPSE_TYPE, count: turns.length },
    { style },
  );
  const position = points.geometry.getAttribute('position') as THREE.BufferAttribute;
  const out = position.array as Float32Array;
  const at = (progress: number): number => {
    const t = startMs + Math.min(1, Math.max(0, progress)) * (nowMs - startMs);
    const daysBack = (nowMs - t) / DAY_MS;
    turns.forEach((turn, k) => {
      if (t < turn.bornMs) {
        out[k * 3] = 0; out[k * 3 + 1] = 0; out[k * 3 + 2] = 0;
        return;
      }
      const i = turn.index * 3;
      turnBack(today[i], today[i + 1], today[i + 2], turn.relRateRadPerDay, daysBack, out, k * 3);
    });
    position.needsUpdate = true;
    return t;
  };
  at(0);
  return { points, startMs, at, dispose: () => disposeScreenPoints(points) };
}
