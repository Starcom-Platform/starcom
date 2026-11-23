/**
 * The Story button beside Tour (D-ST, ST4), and a story's caption over the globe while it plays or waits to (ST6):
 * the story's title, the step and how many, the caption, and Play, Pause, Resume and End. In the tour's own style.
 */
import React from 'react';
import { fill, useMessages } from '../../i18n/app/i18n';
import { toggleStoryPanel, useStoryPanel } from '../../features/story/storyPanel';
import type { StoryPlay } from '../../features/story/useStoryPlayer';
import styles from '../../features/globe/tour/BriefingTour.module.css';

export const StoryButton: React.FC<{ ready: boolean }> = ({ ready }) => {
  const { m: { story: w } } = useMessages();
  const panel = useStoryPanel();
  return (
    <div className={styles.control}>
      <button
        type="button"
        className={styles.button}
        disabled={!ready}
        aria-expanded={panel.open}
        aria-haspopup="dialog"
        title={w.opens}
        onClick={toggleStoryPanel}
        data-testid="story-button"
      >
        {w.label}
      </button>
    </div>
  );
};

export const StoryCaption: React.FC<{ player: StoryPlay }> = ({ player }) => {
  const { m: { story: w } } = useMessages();
  const { story, phase, index } = player;
  if (phase === 'off' || !story) return player.notice ? <div role="status" className={styles.caption}><p className={styles.why}>{player.notice}</p></div> : null;
  const step = story.steps[index];
  return (
    <section className={styles.caption} aria-label={story.title || w.untitled} data-testid="story-caption-card">
      <div className={styles.meta}>{story.title || w.untitled} · {fill(w.step, { i: index + 1, n: story.steps.length })}</div>
      {step?.caption ? <p className={styles.why}>{step.caption}</p> : null}
      {player.notice ? <p className={styles.why} role="status">{player.notice}</p> : null}
      <div className={styles.actions}>
        {phase === 'ready' ? <button type="button" className={styles.action} onClick={() => player.play(story.id)} data-testid="story-caption-play">{w.play}</button> : null}
        {phase === 'playing' ? <button type="button" className={styles.action} onClick={player.pause}>{w.pause}</button> : null}
        {phase === 'paused' ? <button type="button" className={styles.action} onClick={player.resume}>{w.resume}</button> : null}
        <button type="button" className={styles.action} onClick={player.end}>{w.end}</button>
        <span className={styles.hint}>{phase === 'ready' ? w.readyHint : w.touchHint}</span>
      </div>
    </section>
  );
};
