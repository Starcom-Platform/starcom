/**
 * Side by side (decision D-PW, PW63, PW73): the Psi layers at now, drawn in the globe's left half while it is split,
 * the cursor's in the right, every other layer once; a divider down the middle names each half's moment. A component
 * of its own, so its minute clock re-renders it alone, never the globe. While mounted the split is on; unmounted,
 * every Psi layer is whole again.
 */
import React, { useEffect, useState } from 'react';
import type * as THREE from 'three';
import { fill, useMessages } from '../../i18n/app/i18n';
import { formatUtcDateTime } from '../../utils/utcTime';
import { installSplit, setSplitOn } from '../../globe-engine/splitView';
import { useGlobePsiLines } from '../Globe/Hooks/useGlobePsiLines';
import { useGlobePsiZones } from '../Globe/Hooks/useGlobePsiZones';
import { useGlobePsiCalls } from '../Globe/Hooks/useGlobePsiCalls';
import { useGlobeMagneticShield } from '../Globe/Hooks/useGlobeMagneticShield';
import { useGlobePsiModel } from '../Globe/Hooks/useGlobePsiModel';
import type { PsiPlaceLayer } from '../../services/psiWatch/psiPlaces';
import styles from './PsiSplitNow.module.css';

const MINUTE = 60_000;

/** Now, to the minute: the left half moves on as the minutes pass. */
function useMinuteNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / MINUTE) * MINUTE);
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / MINUTE) * MINUTE), 5_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export interface PsiSplitNowProps {
  scene: THREE.Scene | null;
  /** The cursor's moment, which the right half shows. */
  cursorMs: number;
  lines: boolean;
  places: Readonly<Record<PsiPlaceLayer, boolean>>;
  /** The magnetic shield is on: its poles and field at now. */
  shield: boolean;
  /** The ψ field is on: its field at now. */
  psiModel: boolean;
}

const PsiSplitNow: React.FC<PsiSplitNowProps> = ({ scene, cursorMs, lines, places, shield, psiModel }) => {
  const { m } = useMessages();
  const w = m.psiWatch.timestream;
  const now = useMinuteNow();
  useEffect(() => {
    if (!scene) return undefined;
    setSplitOn(true);
    const stop = installSplit(scene);
    return () => { setSplitOn(false); stop(); };
  }, [scene]);
  useGlobePsiLines({ scene, active: lines, cursorMs: now, split: 'now' });
  useGlobePsiZones({ scene, active: places, cursorMs: now, split: 'now' });
  useGlobePsiCalls({ scene, active: true, cursorMs: now, split: 'now' });
  useGlobeMagneticShield({ scene, active: shield, cursorMs: now, split: 'now' });
  useGlobePsiModel({ scene, active: psiModel, cursorMs: now, split: 'now' });
  return (
    <div className={styles.split} data-testid="psi-split" aria-hidden="true">
      <span className={styles.divider} />
      <span className={`${styles.label} ${styles.left}`}>{fill(w.splitNow, { time: formatUtcDateTime(now, { year: true }) })}</span>
      <span className={`${styles.label} ${styles.right}`}>{fill(w.splitCursor, { time: formatUtcDateTime(cursorMs, { year: true }) })}</span>
    </div>
  );
};

export default PsiSplitNow;
