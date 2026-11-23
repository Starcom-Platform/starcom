/**
 * The Echoes card (decision D-PW, PW39, PW47, PW53, PW69): the window echoed, how many times its kind came round, and
 * each return inside the events lane's set's record as a bar of the events its span gathered, the usual beside it, the
 * count any span that long holds: a thin bar while there is room for one, a line where the returns are many. No
 * sentence reads the bars (PW53). A click on a bar isolates that return and puts the cursor there; All shows every
 * one again. The globe draws the events in the look chosen here (PW54): dots, a heat, or the Zones filled. Align
 * opens the alignment lane, the returns stacked on their exact moments (PW55, PW71).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { counted, fill, numbered, useMessages } from '../../../i18n/app/i18n';
import { formatUtcDate } from '../../../utils/utcTime';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import { ECHO_LOOKS, echoReturns, setEcho, setEchoLook, updateEcho, useEchoLook, usualCount, type Echo } from '../../../services/psiWatch/timestream/echoes';
import type { EventSet, EventSetId } from '../../../services/psiWatch/timestream/eventSets';
import { eventColour } from './EventsLane';
import { WITHHELD } from '../../../services/psiWatch/timestream/withheld';
import { setAligned, useAligned } from '../../../services/psiWatch/timestream/alignment';
import styles from './TimestreamDrawer.module.css';

const CHART_W = 280;
const CHART_H = 48;
/** Under this width a bar has no room for its usual beside it. */
const PAIR_PX = 4;

export interface EchoesCardProps {
  echo: Echo;
  set: EventSet | null;
  setId: EventSetId;
  onSeek: (ms: number) => void;
}

const EchoesCard: React.FC<EchoesCardProps> = ({ echo, set, setId, onSeek }) => {
  const { m } = useMessages();
  const w = m.psiWatch.timestream;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const look = useEchoLook();
  const aligned = useAligned();
  const returns = useMemo(() => (set && echo.returns ? echoReturns(echo, set) : []), [echo, set]);
  const usual = set ? usualCount(set, echo.beforeMs + echo.afterMs) : 0;
  const top = Math.max(1, usual * 1.5, ...returns.map((r) => r.count));
  const step = returns.length ? CHART_W / returns.length : CHART_W;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(CHART_W * ratio);
    canvas.height = Math.round(CHART_H * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, CHART_W, CHART_H);
    if (!returns.length) return;
    const yOf = (v: number) => CHART_H - 1 - (v / top) * (CHART_H - 2);
    const paired = step >= PAIR_PX;
    returns.forEach((r, i) => {
      const x = i * step;
      const barW = paired ? Math.max(1, step * 0.6) : Math.max(0.5, step);
      ctx.fillStyle = eventColour(setId);
      ctx.globalAlpha = echo.isolated === null || echo.isolated === r.ms ? 1 : 0.3;
      if (r.count) ctx.fillRect(x, yOf(r.count), barW, CHART_H - 1 - yOf(r.count));
      if (paired) {
        ctx.fillStyle = GUNMETAL[300];
        ctx.fillRect(x + barW, yOf(usual), 1, CHART_H - 1 - yOf(usual));
      }
    });
    ctx.globalAlpha = 1;
    if (!paired) {
      ctx.fillStyle = GUNMETAL[300];
      ctx.fillRect(0, Math.round(yOf(usual)), CHART_W, 1);
    }
    if (hover !== null) {
      ctx.fillStyle = GUNMETAL[100];
      ctx.fillRect(hover * step, 0, Math.max(1, step), 1);
    }
  }, [returns, top, step, usual, setId, echo.isolated, hover]);

  const indexAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / step);
    return i >= 0 && i < returns.length ? i : null;
  };
  const hovered = hover !== null ? returns[hover] : null;
  const since = echo.returns?.length ? new Date(echo.returns[0]).getUTCFullYear() : null;

  return (
    <div className={styles.echoesCard} role="dialog" aria-label={fill(w.echoesTitle, { title: echo.title })} data-testid="psi-timestream-echoes">
      <span className={styles.aspectCardName} style={{ borderColor: DATA_SCALES.psiGround }}>{fill(w.echoesTitle, { title: echo.title })}</span>
      {echo.returns === null ? (
        <span role="status" className={styles.echoesFinding}>
          <span className={styles.echoesLoader} aria-hidden="true" />{w.echoesFinding}
        </span>
      ) : (
        <>
          <span className={styles.readoutTime}>
            {since !== null ? counted(w.echoesReturns, echo.returns.length, { year: since }) : w.echoesNone}
            {set ? ` · ${counted(w.echoesInRecord, returns.length, { set: w.eventSets[setId] })}` : ''}
            {WITHHELD[setId].length ? ` · ${fill(w.echoesWithheld, { years: WITHHELD[setId].map((h) => h.years).join(', ') })}` : ''}
          </span>
          <canvas ref={canvasRef} className={styles.echoesChart} style={{ width: CHART_W, height: CHART_H }} data-testid="psi-timestream-echoes-chart"
            onMouseMove={(e) => setHover(indexAt(e))} onMouseLeave={() => setHover(null)}
            onClick={(e) => { const i = indexAt(e); if (i === null) return; updateEcho(echo.address, { isolated: returns[i].ms }); onSeek(returns[i].ms); }} />
          <span className={styles.readoutTime} data-testid="psi-timestream-echoes-reading">
            {hovered ? fill(w.echoesBar, { date: formatUtcDate(hovered.ms, { year: true }), count: numbered(hovered.count), usual: numbered(Math.round(usual * 10) / 10) })
              : echo.isolated !== null ? fill(w.echoesIsolated, { date: formatUtcDate(echo.isolated, { year: true }) }) : ' '}
          </span>
          <ul className={styles.key} aria-hidden="true">
            <li><span className={styles.swatch} style={{ background: eventColour(setId) }} />{w.echoesCount}</li>
            <li><span className={styles.swatch} style={{ background: GUNMETAL[300] }} />{w.echoesUsual}</li>
          </ul>
        </>
      )}
      <span className={styles.group} role="group" aria-label={w.echoesLook}>
        {ECHO_LOOKS.map((l) => (
          <button key={l} type="button" className={styles.chip} aria-pressed={look === l} onClick={() => setEchoLook(l)}>{w.echoesLooks[l]}</button>
        ))}
      </span>
      <span className={styles.group}>
        {echo.isolated !== null ? <button type="button" className={styles.chip} onClick={() => updateEcho(echo.address, { isolated: null })}>{w.echoesAll}</button> : null}
        {echo.returns !== null ? (
          <button type="button" className={styles.chip} aria-pressed={aligned} onClick={() => setAligned(!aligned)}>{w.echoesAlign}</button>
        ) : null}
        <button type="button" className={styles.chip} onClick={() => { setAligned(false); setEcho(null); }}>{w.aspectClose}</button>
      </span>
    </div>
  );
};

export default EchoesCard;
