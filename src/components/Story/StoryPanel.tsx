/**
 * The Story panel (D-ST, ST1, ST2, ST4, ST6): the stories kept in this browser, and a story's steps. "Add this view"
 * takes the view as it is; each step has its caption and its hold, moves up and down, is taken again from the view or
 * shown; a story is played, and its link copied (the whole story in its address, nothing published). The Story button
 * beside Tour opens and closes it, and the caption over the globe plays it (StoryCaption).
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fill, useMessages } from '../../i18n/app/i18n';
import {
  captureStep, CAPTION_MAX, changeStory, HOLD_CHOICES_S, moveStep, newStory, removeStory, STEPS_MAX, storyLink,
  useStories, applyStep, type Story, type StoryHandle,
} from '../../features/story/story';
import { closeStoryPanel, openStoryPanel, showStoryList, useStoryPanel } from '../../features/story/storyPanel';
import type { StoryPlay } from '../../features/story/useStoryPlayer';
import { storyCardsZip, type StoryCardHandle } from '../../features/story/storyCards';
import { mp4Refusal, recordStoryMp4 } from '../../features/story/storyMp4';
import { planStoryClip } from '../../features/story/storyClip';
import styles from './Story.module.css';

type Words = ReturnType<typeof useMessages>['m']['story'];

const StoryList: React.FC<{ list: readonly Story[]; w: Words; player: StoryPlay }> = ({ list, w, player }) => {
  const [refused, setRefused] = useState<string | null>(null);
  return (
    <>
      {list.length ? (
        <ul className={styles.list}>
          {list.map((story) => (
            <li key={story.id} className={styles.row} data-testid="story-row">
              <button type="button" className={styles.name} onClick={() => openStoryPanel(story.id)}>{story.title || w.untitled}</button>
              <span className={styles.quiet}>{fill(w.stepsCount, { n: story.steps.length })}</span>
              <button type="button" className={styles.minor} disabled={!story.steps.length} onClick={() => player.play(story.id)}>{w.play}</button>
            </li>
          ))}
        </ul>
      ) : <p className={styles.body}>{w.empty}</p>}
      <div className={styles.foot}>
        <button
          type="button"
          className={styles.primary}
          data-testid="story-new"
          onClick={() => {
            const made = newStory('');
            if (made) openStoryPanel(made.id); else setRefused(w.storiesFull);
          }}
        >
          {w.newStory}
        </button>
      </div>
      {refused ? <p className={styles.warn} role="status">{refused}</p> : null}
    </>
  );
};

const StoryEditor: React.FC<{ story: Story; w: Words; player: StoryPlay; handle: () => StoryHandle | null }> = ({ story, w, player, handle }) => {
  const [said, setSaid] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const change = (next: (s: Story) => Story) => changeStory(story.id, next);
  const add = () => {
    const h = handle();
    if (!h) return;
    if (story.steps.length >= STEPS_MAX) { setSaid(w.full); return; }
    try {
      const step = captureStep(h);
      change((s) => ({ ...s, steps: [...s.steps, step] }));
      setSaid(null);
    } catch (e) { setSaid(String((e as Error).message ?? e)); }
  };
  const retake = (i: number) => {
    const h = handle();
    if (!h) return;
    try {
      const fresh = captureStep(h);
      change((s) => ({ ...s, steps: s.steps.map((step, j) => (j === i ? { ...fresh, caption: step.caption, holdS: step.holdS } : step)) }));
    } catch (e) { setSaid(String((e as Error).message ?? e)); }
  };
  const copy = async () => {
    const made = await storyLink(story, window.location.origin, window.location.pathname);
    setLink(made);
    try { await navigator.clipboard.writeText(made); setSaid(w.copied); } catch { setSaid(null); }
  };
  const [making, setMaking] = useState<number | null>(null);
  const cards = async () => {
    const h = handle() as StoryCardHandle | null;
    if (!h || making !== null) return;
    setSaid(null);
    try {
      const made = await storyLink(story, window.location.origin, window.location.pathname);
      const zip = await storyCardsZip(h, story, w, made, (i) => setMaking(i));
      const file = `${(story.title || 'story').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'story'}-cards.zip`;
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setSaid(fill(w.cardsDone, { file }));
    } catch (e) {
      setSaid(fill(w.cardsFailed, { why: String((e as Error).message ?? e) }));
    } finally {
      setMaking(null);
    }
  };
  const [recording, setRecording] = useState<number | null>(null);
  const [cannotClip, setCannotClip] = useState<string | null>(null);
  useEffect(() => { let live = true; void mp4Refusal().then((why) => { if (live) setCannotClip(why); }); return () => { live = false; }; }, []);
  const fileOf = (ext: string) => `${(story.title || 'story').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'story'}.${ext}`;
  const download = (blob: Blob, file: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  // About how many frames the footage runs to, for the progress: the end card's are on top.
  let frames = 0;
  try { frames = Math.round((planStoryClip(story, w, { fps: 30 }).durationMs / 1000) * 30) + 1; } catch { frames = 0; }
  const clip = async () => {
    if (recording !== null || making !== null) return;
    setSaid(null);
    setRecording(0);
    try {
      const mp4 = await recordStoryMp4(story, (i) => setRecording(i));
      const file = fileOf('mp4');
      download(mp4, file);
      setSaid(fill(w.clipDone, { file }));
    } catch (e) {
      setSaid(fill(w.clipFailed, { why: String((e as Error).message ?? e) }));
    } finally {
      setRecording(null);
    }
  };
  const playing = player.phase !== 'off' && player.story?.id === story.id;
  const labels = new Map((handle()?.listLayers() ?? []).map((l) => [l.id, l.label ?? l.id] as const));
  const named = (id: string) => labels.get(id) ?? id;
  return (
    <>
      <label className={styles.field}>
        <span>{w.titleLabel}</span>
        <input
          type="text"
          value={story.title}
          maxLength={120}
          placeholder={w.untitled}
          onChange={(e) => change((s) => ({ ...s, title: e.target.value }))}
          data-testid="story-title"
        />
      </label>
      {story.steps.length ? (
        <ol className={styles.steps}>
          {story.steps.map((step, i) => (
            <li key={i} className={`${styles.step} ${playing && player.index === i ? styles.current : ''}`} data-testid="story-step">
              <div className={styles.row}>
                <strong>{fill(w.step, { i: i + 1, n: story.steps.length })}</strong>
                <span className={styles.quiet}>{[step.layer, ...step.pins].map(named).join(' + ')}</span>
              </div>
              <label className={styles.field}>
                <span className={styles.hidden}>{w.caption}</span>
                <textarea
                  value={step.caption}
                  maxLength={CAPTION_MAX}
                  rows={2}
                  placeholder={w.captionHint}
                  onChange={(e) => change((s) => ({ ...s, steps: s.steps.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)) }))}
                  data-testid="story-caption"
                />
              </label>
              <div className={styles.controls}>
                <span className={styles.group} role="group" aria-label={w.hold}>
                  <span className={styles.quiet}>{w.hold}</span>
                  {HOLD_CHOICES_S.map((holdS) => (
                    <button
                      key={holdS}
                      type="button"
                      className={styles.chip}
                      aria-pressed={step.holdS === holdS}
                      onClick={() => change((s) => ({ ...s, steps: s.steps.map((x, j) => (j === i ? { ...x, holdS } : x)) }))}
                    >
                      {holdS} s
                    </button>
                  ))}
                </span>
                <span className={styles.group}>
                  <button type="button" className={styles.chip} aria-label={w.up} title={w.up} disabled={i === 0} onClick={() => change((s) => ({ ...s, steps: moveStep(s.steps, i, -1) }))}>↑</button>
                  <button type="button" className={styles.chip} aria-label={w.down} title={w.down} disabled={i === story.steps.length - 1} onClick={() => change((s) => ({ ...s, steps: moveStep(s.steps, i, 1) }))}>↓</button>
                  <button type="button" className={styles.chip} onClick={() => { const h = handle(); if (h) void applyStep(h, step, { transitionMs: 800 }); }}>{w.show}</button>
                  <button type="button" className={styles.chip} onClick={() => retake(i)} data-testid="story-retake">{w.retake}</button>
                  <button type="button" className={styles.chip} onClick={() => change((s) => ({ ...s, steps: s.steps.filter((_, j) => j !== i) }))}>{w.remove}</button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className={styles.body}>{w.noSteps}</p>}
      <div className={styles.foot}>
        <button type="button" className={styles.primary} onClick={add} disabled={story.steps.length >= STEPS_MAX} data-testid="story-add">{w.addView}</button>
        <button type="button" className={styles.minor} onClick={() => player.play(story.id)} disabled={!story.steps.length} data-testid="story-play">{w.play}</button>
        <button type="button" className={styles.minor} onClick={() => { void copy(); }} disabled={!story.steps.length} data-testid="story-link">{w.copyLink}</button>
        <button
          type="button"
          className={styles.minor}
          onClick={() => { void clip(); }}
          disabled={!story.steps.length || !!cannotClip || recording !== null || making !== null || player.phase === 'playing'}
          title={cannotClip ?? undefined}
          data-testid="story-clip"
        >
          {recording !== null ? fill(w.recording, { i: recording + 1, n: frames }) : w.clip}
        </button>
        <button type="button" className={styles.minor} onClick={() => { void cards(); }} disabled={!story.steps.length || making !== null || recording !== null || player.phase === 'playing'} data-testid="story-cards">
          {making !== null ? fill(w.making, { i: making + 1, n: story.steps.length }) : w.cards}
        </button>
      </div>
      {link ? <input className={styles.link} readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={w.copyLink} data-testid="story-link-text" /> : null}
      {said ? <p className={styles.quiet} role="status">{said}</p> : null}
      {cannotClip ? <p className={styles.quiet}>{cannotClip}</p> : null}
      <p className={styles.quiet}>{w.linkHint}</p>
      <div className={styles.foot}>
        <button type="button" className={styles.minor} onClick={showStoryList}>{w.back}</button>
        <button type="button" className={styles.minor} onClick={() => { removeStory(story.id); showStoryList(); }}>{w.removeStory}</button>
      </div>
    </>
  );
};

/** The panel, while open. */
export const StoryPanel: React.FC<{ player: StoryPlay; handle: () => StoryHandle | null }> = ({ player, handle }) => {
  const { m: { story: w } } = useMessages();
  const panel = useStoryPanel();
  const list = useStories();
  useEffect(() => {
    if (!panel.open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && player.phase === 'off') closeStoryPanel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel.open, player.phase]);
  if (!panel.open) return null;
  const story = panel.storyId ? list.find((s) => s.id === panel.storyId) ?? null : null;
  return createPortal((
    <aside className={styles.panel} role="dialog" aria-labelledby="story-heading" data-testid="story-panel">
      <div className={styles.head}>
        <h2 id="story-heading" className={styles.heading}>{story ? (story.title || w.untitled) : w.heading}</h2>
        <button type="button" className={styles.close} onClick={closeStoryPanel} aria-label={w.close}>×</button>
      </div>
      {story ? <StoryEditor story={story} w={w} player={player} handle={handle} /> : <StoryList list={list} w={w} player={player} />}
      <p className={styles.quiet}>{w.inApp}</p>
    </aside>
  ), document.body);
};

export default StoryPanel;
