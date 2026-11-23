/**
 * The briefing tour's button, its picker and its caption (block G, item 6.1;
 * record docs/missions/01-architecture-decisions/briefing-playlists.md, BP1–BP4).
 *
 * The button sits with the camera's (BP3). It opens a picker of the three
 * playlists (BP1); while a tour runs it ends it. The caption says, at each stop,
 * what it is and why it is shown (BP4), with Pause or Resume and End; Esc ends
 * it too. A tour that could not play says why, until dismissed.
 */
import React, { useState } from 'react';
import { Glyph } from '../../../symbols/Glyph';
import type { GlyphName } from '../../../symbols/uiSymbols';
import { PLAYLISTS, PLAYLIST_TITLES, type PlaylistId } from './briefingPlaylist';
import type { BriefingTour } from './useBriefingTour';
import styles from './BriefingTour.module.css';

/** Each playlist by its layer's glyph. */
const PLAYLIST_GLYPHS: Readonly<Record<PlaylistId, GlyphName>> = {
  war: 'layer:WarConflict',
  raves: 'layer:SceneEvents',
  heat: 'layer:HeatRisk',
  heroes: 'mode:HeroWatch',
};

export const BriefingTourButton: React.FC<{ tour: BriefingTour; ready: boolean }> = ({ tour, ready }) => {
  const [open, setOpen] = useState(false);
  if (tour.state !== 'off') {
    return (
      <div className={styles.control}>
        <button type="button" className={styles.button} onClick={tour.end} title="End the tour (Esc)">
          End tour
        </button>
      </div>
    );
  }
  return (
    <div className={styles.control}>
      <button
        type="button"
        className={styles.button}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!ready}
        onClick={() => setOpen((was) => !was)}
        title={ready ? 'Tour a brief, stop by stop' : 'The globe is still initialising'}
      >
        Tour
      </button>
      {open && (
        <div role="menu" aria-label="Briefing playlists" className={styles.picker}>
          {PLAYLISTS.map((id) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className={styles.pick}
              onClick={() => {
                setOpen(false);
                tour.start(id);
              }}
            >
              <Glyph name={PLAYLIST_GLYPHS[id]} size={14} />
              {PLAYLIST_TITLES[id]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const BriefingTourCaption: React.FC<{ tour: BriefingTour }> = ({ tour }) => {
  if (tour.state === 'off') {
    if (!tour.notice) return null;
    return (
      <div role="status" className={styles.caption}>
        <p className={styles.why}>{tour.notice}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={tour.dismissNotice}>Dismiss</button>
        </div>
      </div>
    );
  }
  const paused = tour.state === 'paused';
  const { caption } = tour;
  return (
    <section className={styles.caption} aria-label="Briefing tour">
      {tour.state === 'loading' || !caption ? (
        <p className={styles.why} role="status">
          Loading {tour.playlist ? PLAYLIST_TITLES[tour.playlist] : 'the tour'}…
        </p>
      ) : (
        <>
          <div className={styles.meta}>
            {/* At the opening the title is the playlist's name: no need to say it twice. */}
            {caption.progress ? `${caption.playlist} · ${caption.progress}` : 'Briefing tour'}
            {paused ? ' · Paused' : ''}
          </div>
          <div aria-live="polite">
            {/* Two lines at most over the globe; the whole title on hover and to a screen reader. */}
            <h2 className={styles.title} title={caption.title}>{caption.title}</h2>
            <p className={styles.why}>{caption.why}</p>
          </div>
          {caption.lines.length > 0 && (
            <ul className={styles.lines}>
              {caption.lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
        </>
      )}
      <div className={styles.actions}>
        {tour.state !== 'loading' && (paused
          ? <button type="button" className={styles.action} onClick={tour.resume}>Resume</button>
          : <button type="button" className={styles.action} onClick={tour.pause}>Pause</button>)}
        {/* Round again after the last stop, until ended (critique C34). */}
        <button
          type="button"
          className={styles.action}
          aria-pressed={tour.loop}
          onClick={() => tour.setLoop(!tour.loop)}
          title={tour.loop ? 'It goes round again after its last stop. Press to end there instead.' : 'Go round again after the last stop, until ended'}
        >
          {tour.loop ? 'Looping' : 'Loop'}
        </button>
        <button type="button" className={styles.action} onClick={tour.end}>End</button>
        <span className={styles.hint}>A touch pauses it · Esc ends it</span>
      </div>
    </section>
  );
};
