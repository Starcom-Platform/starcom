/**
 * The Timestream's View menu (decision D-PW, PW38, PW65; Cosmic Cypher's `LaneManagerModal`): the psi lanes on or
 * off; every lane body on or off, and moved up or down; the lanes' fill, gradient or solid; and their palette, Cosmic Cypher's or a
 * colour-blind-safe one. The choices kept in this browser for the next visit.
 */
import React, { useEffect, useRef, useState } from 'react';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { LANE_BODIES, type LaneBody } from '../../../services/psiWatch/timestream/skyColumns';
import type { ElementPalette } from './laneRenderer';
import styles from './TimestreamDrawer.module.css';

const LANES_KEY = 'starcom:psi-timestream-lanes';
const PSI_LANES_KEY = 'starcom:psi-timestream-psi-lanes';
/** The psi lanes this browser has been offered, so a lane added since joins as it would at first. */
const PSI_LANES_KNOWN_KEY = 'starcom:psi-timestream-psi-lanes-known';

/**
 * The lanes over the sky's (PW42, PW45, PW46, PW52, PW72): Busy, the notes' windows, Psi Alerts, the operative's calls, the field's Kp, the events
 * of a chosen set, and the graphs: the Resonance Score, tidal stress, the elements and the modalities.
 */
export const PSI_LANES = ['busy', 'windows', 'alerts', 'calls', 'kp', 'events', 'resonance', 'tide', 'elements', 'modalities'] as const;
export type PsiLane = (typeof PSI_LANES)[number];
/** The graph lanes, which the sky worker computes. */
export const GRAPH_LANES: readonly PsiLane[] = ['resonance', 'tide', 'elements', 'modalities'];
/** On at first: all but the element and modality shares, which take room the sky's own colours already give. */
const DEFAULT_PSI_LANES: readonly PsiLane[] = PSI_LANES.filter((l) => l !== 'elements' && l !== 'modalities');
/** The lanes there were before the graphs, for a choice saved then. */
const FIRST_PSI_LANES: readonly PsiLane[] = ['busy', 'windows', 'alerts', 'kp'];

/** The psi lanes this browser chose last, a lane it has not met yet as it is at first. */
export function readPsiLanes(): PsiLane[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PSI_LANES_KEY) ?? 'null') as unknown;
    if (Array.isArray(saved)) {
      const knownSaved = JSON.parse(localStorage.getItem(PSI_LANES_KNOWN_KEY) ?? 'null') as unknown;
      const known: readonly string[] = Array.isArray(knownSaved) ? knownSaved : FIRST_PSI_LANES;
      return PSI_LANES.filter((l) => saved.includes(l) || (!known.includes(l) && DEFAULT_PSI_LANES.includes(l)));
    }
  } catch { /* storage unavailable */ }
  return [...DEFAULT_PSI_LANES];
}

export function savePsiLanes(lanes: readonly PsiLane[]): void {
  try {
    localStorage.setItem(PSI_LANES_KEY, JSON.stringify(lanes));
    localStorage.setItem(PSI_LANES_KNOWN_KEY, JSON.stringify(PSI_LANES));
  } catch { /* storage unavailable */ }
}

/** The lanes this browser chose last, or the given default. */
export function readLanes(fallback: readonly LaneBody[]): LaneBody[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LANES_KEY) ?? 'null') as unknown;
    if (Array.isArray(saved)) {
      const known = saved.filter((b): b is LaneBody => (LANE_BODIES as readonly string[]).includes(b as string));
      if (known.length) return [...new Set(known)];
    }
  } catch { /* storage unavailable */ }
  return [...fallback];
}

export function saveLanes(lanes: readonly LaneBody[]): void {
  try { localStorage.setItem(LANES_KEY, JSON.stringify(lanes)); } catch { /* storage unavailable */ }
}

/** The lanes with one turned on (at the end) or off. */
export const toggleLane = (lanes: readonly LaneBody[], body: LaneBody): LaneBody[] =>
  lanes.includes(body) ? lanes.filter((b) => b !== body) : [...lanes, body];

/** The lanes with one moved a place up (-1) or down (+1). */
export function moveLane(lanes: readonly LaneBody[], body: LaneBody, by: -1 | 1): LaneBody[] {
  const i = lanes.indexOf(body);
  const j = i + by;
  if (i < 0 || j < 0 || j >= lanes.length) return [...lanes];
  const next = [...lanes];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export interface LaneManagerProps {
  lanes: readonly LaneBody[];
  nameOf: (body: LaneBody) => string;
  onChange: (lanes: LaneBody[]) => void;
  fillMode: 'gradient' | 'solid';
  onFill: (mode: 'gradient' | 'solid') => void;
  palette: ElementPalette;
  onPalette: (palette: ElementPalette) => void;
  psiLanes: readonly PsiLane[];
  onPsiLanes: (lanes: PsiLane[]) => void;
}

const LaneManager: React.FC<LaneManagerProps> = ({ lanes, nameOf, onChange, fillMode, onFill, palette, onPalette, psiLanes, onPsiLanes }) => {
  const { m } = useMessages();
  const w = m.psiWatch.timestream;
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (event: PointerEvent) => { if (!boxRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', escape); };
  }, [open]);
  const shown = [...lanes, ...LANE_BODIES.filter((b) => !lanes.includes(b))];
  return (
    <div className={styles.laneManager} ref={boxRef}>
      <button type="button" className={styles.chip} aria-expanded={open} onClick={() => setOpen(!open)}>{w.view}</button>
      {open ? (
        <div className={styles.laneMenu} data-testid="psi-timestream-view-menu">
        <div className={styles.menuRow} role="group" aria-label={w.fill}>
          <span>{w.fill}</span>
          <span className={styles.group}>
            <button type="button" className={styles.chip} aria-pressed={fillMode === 'gradient'} onClick={() => onFill('gradient')}>{w.gradient}</button>
            <button type="button" className={styles.chip} aria-pressed={fillMode === 'solid'} onClick={() => onFill('solid')}>{w.solid}</button>
          </span>
        </div>
        <div className={styles.menuRow} role="group" aria-label={w.palette}>
          <span>{w.palette}</span>
          <span className={styles.group}>
            <button type="button" className={styles.chip} aria-pressed={palette === 'classic'} onClick={() => onPalette('classic')}>{w.palettes.classic}</button>
            <button type="button" className={styles.chip} aria-pressed={palette === 'safe'} onClick={() => onPalette('safe')}>{w.palettes.safe}</button>
          </span>
        </div>
        <ul className={`${styles.laneList} ${styles.psiLaneList}`} aria-label={w.psiLanes} data-testid="psi-timestream-psi-lane-menu">
          {PSI_LANES.map((lane) => (
            <li key={lane} className={styles.laneMenuRow}>
              <label>
                <input type="checkbox" checked={psiLanes.includes(lane)}
                  onChange={() => onPsiLanes(PSI_LANES.filter((l) => (l === lane ? !psiLanes.includes(l) : psiLanes.includes(l))))} /> {w.psiLaneNames[lane]}
              </label>
            </li>
          ))}
        </ul>
        <ul className={styles.laneList} aria-label={w.lanesButton} data-testid="psi-timestream-lane-menu">
          {shown.map((body) => {
            const on = lanes.includes(body);
            return (
              <li key={body} className={styles.laneMenuRow}>
                <label>
                  <input type="checkbox" checked={on} onChange={() => onChange(toggleLane(lanes, body))} /> {nameOf(body)}
                </label>
                {on ? (
                  <span className={styles.group}>
                    <button type="button" className={styles.chip} aria-label={fill(w.laneUp, { lane: nameOf(body) })}
                      disabled={lanes.indexOf(body) === 0} onClick={() => onChange(moveLane(lanes, body, -1))}>{w.up}</button>
                    <button type="button" className={styles.chip} aria-label={fill(w.laneDown, { lane: nameOf(body) })}
                      disabled={lanes.indexOf(body) === lanes.length - 1} onClick={() => onChange(moveLane(lanes, body, 1))}>{w.down}</button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        </div>
      ) : null}
    </div>
  );
};

export default LaneManager;
