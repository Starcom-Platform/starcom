/**
 * An event chart, then and now (decision D-PW, PW60, PW85–PW87): opened by the inspector's "Chart" for an item with
 * a time and a place; docked on the left, one of the left panels. The wheel on top, the event's chart inside and the
 * sky at the shared cursor outside, the aspects across drawn through the middle; then the bodies then, the bodies now
 * in the event's houses, and the aspects across; the frame (switchable), the houses and the orbs said, and what the
 * chart could not give. The Experimental badge, and nothing else said of it (PW34).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fill, numbered, useMessages } from '../../i18n/app/i18n';
import { useTemporalStateOptional } from '../../context/TemporalContext';
import { closeEventChart, setEventChartFrame, useEventChart } from '../../features/psi/eventChartPanel';
import { biWheel } from '../../services/psiWatch/astro/biWheel';
import { ZODIAC_FRAMES } from '../../services/psiWatch/astro/frames';
import type { ChartPoint } from '../../services/psiWatch/astro/chart';
import { formatUtcDateTime } from '../../utils/utcTime';
import { ChartWheel } from './ChartWheel';
import { makeChartCard } from '../../features/psi/chartCardMaker';
import { dataUrlToBlob } from '../../features/globe/capture/dataUrlToBlob';
import styles from './EventChartPanel.module.css';

type Words = ReturnType<typeof useMessages>['m']['psiWatch'];

/** A degree within its sign as charts write it: 12°34′. */
const degrees = (d: number): string => {
  const whole = Math.floor(d);
  const minutes = Math.min(59, Math.round((d - whole) * 60));
  return `${whole}°${String(minutes).padStart(2, '0')}′`;
};

const bodyName = (w: Words, body: string) => (body === 'NorthNode' ? w.timestream.lanes.NorthNode : (w.lines.bodies as Record<string, string>)[body] ?? body);

const Points: React.FC<{ points: readonly ChartPoint[]; w: Words; testId: string }> = ({ points, w, testId }) => (
  <ul className={styles.list} data-testid={testId}>
    {points.map((p) => (
      <li key={p.body} className={styles.row}>
        <span>{fill(p.retrograde ? w.timestream.readoutRetrograde : w.timestream.readout, {
          body: bodyName(w, p.body), degree: degrees(p.degree), sign: (w.timestream.signs as Record<string, string>)[p.sign] ?? p.sign,
        })}</span>
        {p.house ? <span className={styles.quiet}>{fill(w.chart.house, { n: p.house })}</span> : null}
      </li>
    ))}
  </ul>
);

export const EventChartPanel: React.FC = () => {
  const { open, subject, frame } = useEventChart();
  const { m } = useMessages();
  const w = m.psiWatch;
  const timeline = useTemporalStateOptional();
  // The cursor, by the minute: the outer ring moves as it does, no finer.
  const cursorMinute = Math.floor((timeline?.currentTime ?? Date.now()) / 60_000);
  const wheel = useMemo(
    () => (open && subject ? biWheel(new Date(subject.timeMs), subject.place, new Date(cursorMinute * 60_000), { frame }) : null),
    [open, subject, cursorMinute, frame],
  );
  const [said, setSaid] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  useEffect(() => { setSaid(null); }, [subject]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeEventChart(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open || !subject || !wheel) return null;
  const aspectWord = (kind: string) => (w.timestream.aspects as Record<string, string>)[kind] ?? kind;
  return createPortal((
    <aside className={styles.panel} role="dialog" aria-labelledby="event-chart-heading" data-testid="event-chart-panel">
      <div className={styles.head}>
        <h2 id="event-chart-heading" className={styles.heading}>{w.chart.heading}</h2>
        <span className={styles.badge}>{w.panel.experimental}</span>
        <button type="button" className={styles.close} aria-label={w.chart.close} title={w.chart.close} onClick={closeEventChart}>×</button>
      </div>
      <p className={styles.subject} data-testid="event-chart-subject">{subject.title}</p>
      <p className={styles.quiet}>
        {fill(w.chart.inside, { time: formatUtcDateTime(subject.timeMs, { year: true }) })}
        {` · ${Math.abs(subject.place.lat).toFixed(1)}° ${subject.place.lat >= 0 ? 'N' : 'S'}, ${Math.abs(subject.place.lng).toFixed(1)}° ${subject.place.lng >= 0 ? 'E' : 'W'}`}
      </p>
      <p className={styles.quiet}>{fill(w.chart.outside, { time: formatUtcDateTime(cursorMinute * 60_000, { year: true }) })}</p>

      <ChartWheel wheel={wheel} label={w.chart.wheel} />

      <div className={styles.frames}>
        <button type="button" className={styles.chip} title={w.chart.cardTitle} disabled={making} data-testid="event-chart-card"
          onClick={() => {
            setMaking(true);
            setSaid(w.chart.making);
            void makeChartCard(subject, cursorMinute * 60_000, frame).then((dataUrl) => {
              const file = `starcom-chart-${new Date(subject.timeMs).toISOString().replace(/[:.]/g, '-')}.png`;
              const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
              const a = Object.assign(document.createElement('a'), { href: url, download: file });
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              setSaid(fill(w.chart.made, { file }));
            }, (e: unknown) => setSaid(fill(w.chart.cardFailed, { why: String((e as Error)?.message ?? e) }))).finally(() => setMaking(false));
          }}>
          {w.chart.card}
        </button>
        {said ? <span className={styles.quiet} role="status" data-testid="event-chart-card-said">{said}</span> : null}
      </div>

      <div className={styles.frames} role="group" aria-label={w.chart.frame}>
        <span className={styles.quiet}>{w.chart.frame}</span>
        {ZODIAC_FRAMES.map((f) => (
          <button key={f} type="button" className={styles.chip} aria-pressed={frame === f} onClick={() => setEventChartFrame(f)} data-testid={`event-chart-frame-${f}`}>
            {w.chart.frames[f]}
          </button>
        ))}
      </div>

      <h3 className={styles.subheading}>{w.chart.then}</h3>
      <Points points={wheel.then.points} w={w} testId="event-chart-then" />
      <h3 className={styles.subheading}>{w.chart.now}</h3>
      <Points points={wheel.now.points} w={w} testId="event-chart-now" />
      <h3 className={styles.subheading}>{w.chart.across}</h3>
      {wheel.across.length ? (
        <ul className={styles.list} data-testid="event-chart-across">
          {wheel.across.map((a) => (
            <li key={`${a.then}:${a.now}`} className={styles.row}>
              {fill(w.chart.acrossLine, {
                now: bodyName(w, a.now), then: bodyName(w, a.then), kind: aspectWord(a.kind),
                orb: numbered(Math.round(a.orb * 10) / 10), state: a.applying ? w.chart.applying : w.chart.separating,
              })}
            </li>
          ))}
        </ul>
      ) : <p className={styles.quiet}>{w.chart.acrossNone}</p>}

      <p className={styles.stated} data-testid="event-chart-stated">
        {[wheel.then.frameName, wheel.then.housesName, wheel.then.orbsName].filter(Boolean).join(' · ')}
      </p>
      {wheel.then.caveats.map((c) => <p key={c} className={styles.quiet}>{c}</p>)}
    </aside>
  ), document.body);
};

export default EventChartPanel;
