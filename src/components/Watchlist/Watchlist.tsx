/**
 * The Watchlist (D-WL, WL4, WL8, WL9): the header's button, with the count of pings not yet opened, and the panel it
 * opens: each watch with what it counts (quakes from a magnitude, hazards from an alert, and Intel Reports, War &
 * Conflict and Civil Unrest on or off), a circle's radius, what has
 * landed in it since the page opened (each opens in the inspector), and a way to stop watching. A place is watched
 * from the palette ("watch Japan", "watch around here") or a place's card. Kept in this browser; nothing leaves it.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Glyph } from '../../symbols/Glyph';
import { fill, useMessages } from '../../i18n/app/i18n';
import { openPalette, registerPaletteSource } from '../../features/palette/palette';
import { watchResults } from '../../features/watch/watchPalette';
import {
  CIRCLE_KM, HAZARD_FROM, QUAKE_FROM, removeWatch, setWatchKinds, setWatchRadius, useWatches,
  type HazardFrom, type QuakeFrom, type Watch,
} from '../../features/watch/watchlist';
import { useLandedPings, useWatchPings, type WatchPing } from '../../services/watch/watchPings';
import { pingNotice, placeWords, RECORD_LAYER, type WatchMessages } from '../../features/watch/watchWords';
import { openWatchPing } from '../Globe/Hooks/useGlobeWatchPings';
import styles from './Watchlist.module.css';

/** What has landed in a watch, newest first: at most this many shown. */
const LANDED_SHOWN = 5;

const WatchRow: React.FC<{ watch: Watch; landed: readonly WatchPing[]; pending: ReadonlySet<string>; w: WatchMessages; onOpened: () => void }> = ({
  watch, landed, pending, w, onOpened,
}) => {
  const name = placeWords(watch.place, w);
  const mine = landed.filter((p) => p.watches.some((x) => x.id === watch.id)).slice(0, LANDED_SHOWN);
  const now = Date.now();
  return (
    <li className={styles.watch} data-testid="watch-row">
      <div className={styles.row}>
        <strong className={styles.name}>{name}</strong>
        <button type="button" className={styles.minor} onClick={() => removeWatch(watch.id)} aria-label={`${w.remove}: ${name}`}>{w.remove}</button>
      </div>
      <div className={styles.controls}>
        <label className={styles.control}>
          <span>{w.quakes}</span>
          <select
            value={watch.kinds.quakes ?? 'off'}
            onChange={(e) => setWatchKinds(watch.id, { ...watch.kinds, quakes: e.target.value === 'off' ? null : e.target.value as QuakeFrom })}
            data-testid="watch-quakes"
          >
            <option value="off">{w.off}</option>
            {QUAKE_FROM.map((m) => <option key={m} value={m}>{fill(w.quakeFrom, { m })}</option>)}
          </select>
        </label>
        <label className={styles.control}>
          <span>{w.hazards}</span>
          <select
            value={watch.kinds.hazards ?? 'off'}
            onChange={(e) => setWatchKinds(watch.id, { ...watch.kinds, hazards: e.target.value === 'off' ? null : e.target.value as HazardFrom })}
            data-testid="watch-hazards"
          >
            <option value="off">{w.off}</option>
            {HAZARD_FROM.map((level) => <option key={level} value={level}>{w.hazardFrom[level]}</option>)}
          </select>
        </label>
        {/* What The Record carries, each on or off (WL10–WL13), named as its layer names itself. */}
        {(['intel', 'war', 'unrest'] as const).map((kind) => (
          <label key={kind} className={styles.control}>
            <input
              type="checkbox"
              checked={watch.kinds[kind]}
              onChange={(e) => setWatchKinds(watch.id, { ...watch.kinds, [kind]: e.target.checked })}
              data-testid={`watch-${kind}`}
            />
            <span>{RECORD_LAYER[kind]}</span>
          </label>
        ))}
        {watch.place.kind === 'circle' ? (
          <span className={styles.control} role="group" aria-label={w.radius}>
            <span>{w.radius}</span>
            {CIRCLE_KM.map((km) => (
              <button
                key={km}
                type="button"
                className={styles.chip}
                aria-pressed={watch.place.kind === 'circle' && watch.place.km === km}
                onClick={() => setWatchRadius(watch.id, km)}
              >
                {km} km
              </button>
            ))}
          </span>
        ) : null}
      </div>
      {mine.length ? (
        <ul className={styles.landed} aria-label={w.landed}>
          {mine.map((ping) => (
            <li key={ping.item.id}>
              <button
                type="button"
                className={`${styles.item} ${pending.has(ping.item.id) ? styles.unseen : ''}`}
                onClick={() => { openWatchPing(ping, w); onOpened(); }}
                data-testid="watch-landed"
              >
                {pingNotice(ping, w, now).message}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className={styles.quiet}>{w.nothingYet}</p>}
    </li>
  );
};

const WatchlistPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { m: { watch: w } } = useMessages();
  const list = useWatches();
  const landed = useLandedPings();
  const pending = new Set(useWatchPings().map((p) => p.item.id));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal((
    <aside className={styles.panel} role="dialog" aria-labelledby="watchlist-heading" data-testid="watchlist">
      <div className={styles.head}>
        <h2 id="watchlist-heading" className={styles.heading}>{w.label}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label={w.close}>×</button>
      </div>
      {list.length ? (
        <>
          <p className={styles.quiet}>{w.landed}</p>
          <ul className={styles.watches}>
            {list.map((watch) => <WatchRow key={watch.id} watch={watch} landed={landed} pending={pending} w={w} onOpened={onClose} />)}
          </ul>
        </>
      ) : <p className={styles.body}>{w.empty}</p>}
      <div className={styles.foot}>
        <button type="button" className={styles.add} onClick={() => { onClose(); openPalette(`${w.verb} `); }} data-testid="watchlist-add">
          {w.add}
        </button>
      </div>
      <p className={styles.quiet}>{w.inApp}</p>
    </aside>
  ), document.body);
};

/** The header's button: the eye, the count of pings not yet opened, and the panel. */
const Watchlist: React.FC<{ className?: string }> = ({ className }) => {
  const [open, setOpen] = useState(false);
  const { m: { watch: w } } = useMessages();
  const unseen = useWatchPings().length;
  // "Watch Japan", "watch around here" in the palette (WL4, WL9), wherever the header is.
  useEffect(() => registerPaletteSource({ id: 'watch', results: watchResults }), []);
  const label = unseen ? `${w.label}: ${fill(w.newCount, { n: unseen })}` : w.label;
  return (
    <span className={styles.anchor}>
      <button
        type="button"
        className={className}
        aria-label={label}
        title={w.opens}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        data-testid="watchlist-button"
      >
        <Glyph name="action:watchlist" size={20} />
      </button>
      {unseen ? <span className={styles.count} aria-hidden="true" data-testid="watchlist-count">{unseen}</span> : null}
      {open && <WatchlistPanel onClose={() => setOpen(false)} />}
    </span>
  );
};

export default Watchlist;
