/**
 * A story reached from outside its panel (D-ST, ST4, ST6): the palette's "New story", "Open story: …" and "Play story:
 * …", and a story's link, which keeps the story in this browser, opens its panel and sets its first step, Play ready.
 */
import { useEffect, useRef } from 'react';
import { fill, messagesNow } from '../../i18n/app/i18n';
import { paletteMatch, registerPaletteSource, type PaletteResult } from '../palette/palette';
import { decodeStory, keepStory, newStory, stories, STORY_PARAM, type StoryHandle } from './story';
import { openStoryPanel } from './storyPanel';
import type { StoryPlay } from './useStoryPlayer';

/** The palette's story commands, found by their words. */
export function storyResults(query: string, play: (id: string) => void): readonly PaletteResult[] {
  const w = messagesNow().story;
  const results: PaletteResult[] = [
    {
      id: 'story:new', section: 'commands', title: w.newStory, description: w.opens, glyph: 'action:story', keywords: 'story stories new', quiet: true,
      run: () => { const made = newStory(''); if (made) openStoryPanel(made.id); },
    },
    ...stories().flatMap((story): PaletteResult[] => {
      const title = story.title || w.untitled;
      return [
        {
          id: `story:open:${story.id}`, section: 'commands', title: fill(w.openStory, { title }), description: fill(w.stepsCount, { n: story.steps.length }),
          glyph: 'action:story', keywords: 'story stories open', quiet: true, run: () => openStoryPanel(story.id),
        },
        ...(story.steps.length ? [{
          id: `story:play:${story.id}`, section: 'commands' as const, title: fill(w.playStory, { title }), description: fill(w.stepsCount, { n: story.steps.length }),
          glyph: 'action:story' as const, keywords: 'story stories play', quiet: true, run: () => play(story.id),
        }] : []),
      ];
    }),
  ];
  return query ? paletteMatch(results, query) : [];
}

export function useStoryPaletteSource(player: StoryPlay): void {
  const playRef = useRef(player.play);
  playRef.current = player.play;
  useEffect(() => registerPaletteSource({ id: 'story', results: (query) => storyResults(query, (id) => playRef.current(id)) }), []);
}

/** A story's link, once the globe can be driven: kept, its panel opened, its first step set, Play ready (ST6). */
export function useStoryFromLink(player: StoryPlay, handle: () => StoryHandle | null | undefined): void {
  const readyRef = useRef(player.ready);
  readyRef.current = player.ready;
  const handleRef = useRef(handle);
  handleRef.current = handle;
  useEffect(() => {
    const param = new URLSearchParams(globalThis.location?.search ?? '').get(STORY_PARAM);
    if (!param) return undefined;
    let live = true;
    void (async () => {
      const story = await decodeStory(param);
      if (!story || !live) return;
      for (let i = 0; i < 180 && live && !handleRef.current(); i += 1) await new Promise((r) => setTimeout(r, 500));
      const h = handleRef.current();
      if (!h || !live) return;
      try { await h.whenReady({ timeoutMs: 60_000 }); } catch { /* the first step is set all the same */ }
      if (!live) return;
      keepStory(story);
      openStoryPanel(story.id);
      await readyRef.current(story);
    })();
    return () => { live = false; };
  }, []);
}
