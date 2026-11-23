/**
 * The Finder in the Psi Watch panel (decision D-PW, PW28, PW29, PW61, PW70): the archetypes it scries, the two positive
 * controls first, whose answers are already known. Opening one draws its chart here, drawn as data, no sentence
 * reading it: a Zone on a plate boundary, the Zones in ten groups by their resonance, least to most, each group's
 * earthquakes per million km² beside the usual, the Zones filled on the globe by it; a 27-day return of geomagnetic
 * activity, the storms that began each day 1 to 60 days after a storm, beside the usual.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fill, numbered, useMessages } from '../../i18n/app/i18n';
import { DATA_SCALES, GUNMETAL } from '../../styles/tokens';
import { FINDER_ARCHETYPES, platesByTenth, setFinderOpen, stormsAfterStorms, useFinderOpen } from '../../services/psiWatch/finder';
import { useEventSet } from './Timestream/useEventSet';
import { useFinderPlates } from './useFinderPlates';
import { WITHHELD } from '../../services/psiWatch/timestream/withheld';
import styles from './PsiWatchPanel.module.css';

const CHART_W = 260;
const CHART_H = 64;
/** The 27-day control's days, and the one its Sun turns in. */
const DAYS = 60;
const ROTATION_DAY = 27;

interface BarsProps {
  values: readonly number[];
  usual: number;
  /** A bar marked a little brighter: the day the Sun turns in. */
  marked?: number;
  read: (i: number) => string;
  testId: string;
}

/** Bars from zero with the usual as a faint line across them; a hover reads a bar. */
const Bars: React.FC<BarsProps> = ({ values, usual, marked, read, testId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(1, usual * 1.2, ...values);
  const step = CHART_W / Math.max(1, values.length);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(CHART_W * ratio);
    canvas.height = Math.round(CHART_H * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, CHART_W, CHART_H);
    const yOf = (v: number) => CHART_H - 1 - (v / top) * (CHART_H - 2);
    values.forEach((v, i) => {
      ctx.fillStyle = DATA_SCALES.psiGround;
      ctx.globalAlpha = i === marked || i === hover ? 1 : 0.75;
      ctx.fillRect(i * step + 0.5, yOf(v), Math.max(1, step - 1), CHART_H - 1 - yOf(v));
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = GUNMETAL[300];
    ctx.fillRect(0, Math.round(yOf(usual)), CHART_W, 1);
  }, [values, usual, top, step, marked, hover]);
  const indexAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / step);
    return i >= 0 && i < values.length ? i : null;
  };
  return (
    <>
      <canvas ref={canvasRef} className={styles.finderChart} style={{ width: CHART_W, height: CHART_H }} data-testid={testId}
        onMouseMove={(e) => setHover(indexAt(e))} onMouseLeave={() => setHover(null)} />
      <span className={styles.muted} data-testid={`${testId}-reading`}>{hover !== null ? read(hover) : ' '}</span>
    </>
  );
};

const FinderSection: React.FC = () => {
  const { m } = useMessages();
  const w = m.psiWatch.panel;
  const open = useFinderOpen();
  const plates = useFinderPlates(open === 'plates');
  const storms = useEventSet('storms', open === 'rotation');
  const tenths = useMemo(() => (plates ? platesByTenth(plates) : null), [plates]);
  const rotation = useMemo(() => (storms ? stormsAfterStorms(storms, DAYS) : null), [storms]);
  // The Finder's archetype stays open only while the panel shows it.
  useEffect(() => () => setFinderOpen(null), []);
  const pct = (share: number) => numbered(Math.round(share * 100));
  const one = (v: number) => numbered(Math.round(v * 10) / 10);

  return (
    <details data-testid="psi-finder">
      <summary>{w.finder}</summary>
      <ul className={styles.list}>
        {FINDER_ARCHETYPES.map((id) => (
          <li key={id}>
            <button type="button" className={styles.pick} aria-pressed={open === id} onClick={() => setFinderOpen(open === id ? null : id)}>
              {w.finderArchetypes[id]}
              <span className={styles.muted}> · {w.finderKinds[id]}</span>
            </button>
          </li>
        ))}
      </ul>
      {open === 'plates' ? (
        tenths ? (
          <div className={styles.finderResult}>
            <Bars values={tenths.tenths.map((t) => t.rate)} usual={tenths.usual} testId="psi-finder-plates"
              read={(i) => {
                const t = tenths.tenths[i];
                return fill(w.finderTenth, { n: i + 1, least: pct(t.least), most: pct(t.most), zones: t.zones, quakes: numbered(t.quakes), rate: one(t.rate), usual: one(tenths.usual) });
              }} />
            <span className={styles.muted}>{fill(w.finderPlatesAxis, { km: plates!.withinKm })}</span>
            {plates!.heldBack ? <span className={styles.muted}>{fill(w.finderWithheld, { years: plates!.heldBack })}</span> : null}
          </div>
        ) : <p className={styles.muted} role="status">{w.finderLoading}</p>
      ) : null}
      {open === 'rotation' ? (
        rotation ? (
          <div className={styles.finderResult}>
            <Bars values={rotation.counts} usual={rotation.usual} marked={ROTATION_DAY - 1} testId="psi-finder-rotation"
              read={(i) => fill(w.finderLag, { day: i + 1, count: numbered(rotation.counts[i]), usual: one(rotation.usual) })} />
            <span className={styles.muted}>{fill(w.finderRotationAxis, { days: DAYS, marked: ROTATION_DAY })}</span>
            <span className={styles.muted}>{fill(w.finderWithheld, { years: WITHHELD.storms.map((h) => h.years).join(', ') })}</span>
          </div>
        ) : <p className={styles.muted} role="status">{w.finderLoading}</p>
      ) : null}
    </details>
  );
};

export default FinderSection;
