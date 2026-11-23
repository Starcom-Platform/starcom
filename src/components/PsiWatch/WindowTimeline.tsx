import React, { useMemo } from 'react';
import { counted, fill, useMessages } from '../../i18n/app/i18n';
import { formatUtcDateTime, localTimeTitle } from '../../utils/utcTime';
import { ageOf, windowCurve, windowWeightAt, type EventWindow } from '../../services/psiWatch/windowProfile';
import styles from './WindowTimeline.module.css';

const W = 320;
const H = 56;
const PAD = 6;

export interface WindowTimelineProps {
  window: EventWindow;
  /** What the window is of, for its label. */
  title: string;
  /** The layer's own hue (a CSS colour): the curve is drawn in it. */
  hue: string;
  /** The state to show, already in words (`shownState`, then the catalogue). */
  stateLabel?: string;
  /** When its note was last published, unix seconds, for "Updated … ago". */
  updatedAt?: number;
  /** Now and the shared cursor, unix seconds. */
  now: number;
  cursor: number;
  /** Moves the shared cursor (decision D-E) to a moment in the window. */
  onSeek?: (unix: number) => void;
  /** The peak is a sky event's exact moment, or a recurrence window's busiest. */
  peakWord?: 'exact' | 'peak';
}

/**
 * WindowTimeline — one event's window through time, the one timeline PsiOps and RLSH share (Mecha Jono's kit v0,
 * `schemas_psi.md` §1, `schemas_rlsh.md` §5.3; decision D-PW, step 2): its curve from its profile, its opening,
 * peak and end, the shared cursor with the weight under it, its state and its age. A station, or a kind the kit has
 * not named, is a band. Times in UTC, marked Z, the viewer's own on hover (D-E).
 */
export const WindowTimeline: React.FC<WindowTimelineProps> = ({
  window, title, hue, stateLabel, updatedAt, now, cursor, onSeek, peakWord = 'exact',
}) => {
  const { m } = useMessages();
  const words = m.psiWatch.timeline;
  const span = Math.max(1, window.until - window.from);
  const x = (t: number) => PAD + ((t - window.from) / span) * (W - 2 * PAD);
  const y = (w: number) => H - PAD - w * (H - 2 * PAD);
  const curve = useMemo(() => windowCurve(window), [window]);
  const band = window.profile === null || window.profile.kind === 'band';
  const path = band
    ? ''
    : `M ${x(window.from)} ${y(0)} ` + curve.map(([t, w]) => `L ${x(t).toFixed(2)} ${y(w ?? 0).toFixed(2)}`).join(' ') + ` L ${x(window.until)} ${y(0)} Z`;
  const inside = cursor >= window.from && cursor <= window.until;
  const weight = windowWeightAt(window, cursor);
  const age = updatedAt === undefined ? null : ageOf(Math.max(0, now - updatedAt));
  const ageText =
    age === null ? null
      : age.unit === 'now' ? words.updatedNow
        : counted(age.unit === 'minutes' ? words.updatedMinutes : age.unit === 'hours' ? words.updatedHours : words.updatedDays, age.n);
  const seekAt = (clientX: number, rect: DOMRect) => {
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek?.(Math.round(window.from + fraction * span));
  };
  const step = Math.max(60, Math.round(span / 100));
  const marks: { t: number; word: string }[] = [
    { t: window.from, word: words.from },
    { t: window.peak, word: peakWord === 'exact' ? words.exact : words.peak },
    { t: window.until, word: words.until },
  ];
  return (
    <figure className={styles.timeline} data-testid="window-timeline">
      <figcaption className={styles.head}>
        {stateLabel ? <span className={styles.state}>{stateLabel}</span> : null}
        {ageText ? <span className={styles.age}>{ageText}</span> : null}
      </figcaption>
      <svg
        className={styles.plot}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="slider"
        tabIndex={onSeek ? 0 : -1}
        aria-label={fill(words.label, { title, from: formatUtcDateTime(window.from * 1000), until: formatUtcDateTime(window.until * 1000) })}
        aria-valuemin={window.from}
        aria-valuemax={window.until}
        aria-valuenow={Math.min(window.until, Math.max(window.from, cursor))}
        aria-valuetext={formatUtcDateTime(cursor * 1000, { year: true })}
        onClick={(event) => seekAt(event.clientX, event.currentTarget.getBoundingClientRect())}
        onKeyDown={(event) => {
          if (!onSeek) return;
          const at = Math.min(window.until, Math.max(window.from, cursor));
          if (event.key === 'ArrowRight') onSeek(Math.min(window.until, at + step));
          else if (event.key === 'ArrowLeft') onSeek(Math.max(window.from, at - step));
          else if (event.key === 'Home') onSeek(window.from);
          else if (event.key === 'End') onSeek(window.until);
          else return;
          event.preventDefault();
        }}
      >
        {band ? (
          <rect x={x(window.from)} y={PAD} width={x(window.until) - x(window.from)} height={H - 2 * PAD} fill={hue} fillOpacity={0.22} />
        ) : (
          <path d={path} fill={hue} fillOpacity={0.24} stroke={hue} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        )}
        {marks.map((mark) => (
          <line key={mark.word} className={styles.mark} x1={x(mark.t)} x2={x(mark.t)} y1={PAD} y2={H - PAD} vectorEffect="non-scaling-stroke" />
        ))}
        {inside ? (
          <line className={styles.cursor} x1={x(cursor)} x2={x(cursor)} y1={0} y2={H} vectorEffect="non-scaling-stroke" data-testid="window-timeline-cursor" />
        ) : null}
      </svg>
      <div className={styles.marks}>
        {marks.map((mark) => (
          <span key={mark.word} className={styles.markLabel} title={localTimeTitle(mark.t * 1000)}>
            <span className={styles.markWord}>{mark.word}</span> {formatUtcDateTime(mark.t * 1000)}
          </span>
        ))}
      </div>
      <p className={styles.reading} aria-live="polite">
        {!inside ? words.outside : band || weight === null ? words.band : fill(words.weightAt, { w: weight.toFixed(2) })}
      </p>
    </figure>
  );
};

export default WindowTimeline;
