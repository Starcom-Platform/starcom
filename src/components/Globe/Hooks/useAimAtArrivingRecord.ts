/**
 * Aim the camera at a received package's cited reports, or at what a key
 * published, once they arrive (plan item 9.14, decision G6).
 *
 * "Show on the globe" aims a Case or a Mission at the click, from records
 * already here. A package's reports are asked for at the click and arrive as
 * the relays answer, so there is nowhere to look yet. This aims once per shown
 * package or key, when its reports first give the camera somewhere to look,
 * and leaves the camera alone after that, since the person may have moved it.
 * Reports spread round the planet have no one place to look, and no aim.
 */
import { useEffect, useRef } from 'react';
import type { GlobeFocusPoint } from '../../../context/GlobeContext';
import type { ShownRecord } from './useShownRecord';

export function useAimAtArrivingRecord(shown: ShownRecord, aim: (point: GlobeFocusPoint) => void): void {
  const aimedFor = useRef<string | null>(null);
  const target = shown.status === 'none' ? null : shown.target;
  const key = target && (target.kind === 'package' || target.kind === 'publisher') ? JSON.stringify(target) : null;
  const point = shown.status === 'ready' ? shown.placement.cameraTarget : null;

  useEffect(() => {
    if (!key || !point || aimedFor.current === key) return;
    aimedFor.current = key;
    aim(point);
  }, [key, point, aim]);
}
