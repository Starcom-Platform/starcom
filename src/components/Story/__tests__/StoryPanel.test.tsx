/**
 * The Story panel (D-ST, ST1, ST2, ST4): a new story, "Add this view" taking the view as it is, a caption and a hold,
 * steps moved and taken again, Play handed to the player, the link copied; the palette's story commands; the caption
 * over the globe with Play ready for a link's story.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StoryPanel } from '../StoryPanel';
import { StoryButton, StoryCaption } from '../StoryControls';
import { resetStoriesForTests, stories, type StoryHandle } from '../../../features/story/story';
import { closeStoryPanel, openStoryPanel, resetStoryPanelForTests, storyPanel } from '../../../features/story/storyPanel';
import { storyResults } from '../../../features/story/useStoryWiring';
import type { StoryPlay } from '../../../features/story/useStoryPlayer';

let lat = 10;
const handle: StoryHandle = {
  getView: () => ({ lat, lng: 0, altitude: 1.5 }),
  listLayers: () => [{ id: 'EarthWeather', label: 'Earth Weather', active: true, primary: true, pinned: false }],
  getLayerChoices: () => ({ choices: {} }),
  getTimeWindow: () => ({ from: null, until: null, live: true }),
  setLayer: () => ({}), pinLayers: () => ({}), setLayerChoices: () => ({}),
  setTimeWindow: async () => ({}), setView: async () => ({}), whenReady: async () => ({}),
};
const player = (over: Partial<StoryPlay> = {}): StoryPlay => ({
  phase: 'off', story: null, index: 0, notice: null, ready: vi.fn(async () => undefined), play: vi.fn(), pause: vi.fn(), resume: vi.fn(), end: vi.fn(), ...over,
});

beforeEach(() => { localStorage.clear(); resetStoriesForTests(); resetStoryPanelForTests(); lat = 10; });
afterEach(() => { act(() => closeStoryPanel()); });

describe('the Story panel', () => {
  it('makes a story of views: added, captioned, held, moved and taken again', () => {
    const play = player();
    render(<StoryPanel player={play} handle={() => handle} />);
    act(() => openStoryPanel(null));
    expect(screen.getByTestId('story-panel')).toHaveTextContent('No stories yet.');
    fireEvent.click(screen.getByTestId('story-new'));
    fireEvent.change(screen.getByTestId('story-title'), { target: { value: 'Two views' } });
    fireEvent.click(screen.getByTestId('story-add'));
    lat = 20;
    fireEvent.click(screen.getByTestId('story-add'));
    expect(screen.getAllByTestId('story-step')).toHaveLength(2);
    expect(screen.getAllByTestId('story-step')[0]).toHaveTextContent('Earth Weather');
    fireEvent.change(screen.getAllByTestId('story-caption')[0], { target: { value: 'Where it starts' } });
    fireEvent.click(screen.getAllByRole('button', { name: '10 s' })[1]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);
    const kept = stories()[0];
    expect(kept.title).toBe('Two views');
    expect(kept.steps.map((s) => [s.view.lat, s.caption, s.holdS])).toEqual([[20, '', 10], [10, 'Where it starts', 6]]);
    lat = 30;
    fireEvent.click(screen.getAllByTestId('story-retake')[1]);
    expect(stories()[0].steps[1]).toMatchObject({ view: { lat: 30 }, caption: 'Where it starts' });
    fireEvent.click(screen.getByTestId('story-play'));
    expect(play.play).toHaveBeenCalledWith(kept.id);
  });

  it('copies the story\'s link, which holds the whole story', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<StoryPanel player={player()} handle={() => handle} />);
    act(() => openStoryPanel(null));
    fireEvent.click(screen.getByTestId('story-new'));
    fireEvent.click(screen.getByTestId('story-add'));
    await act(async () => { fireEvent.click(screen.getByTestId('story-link')); });
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0][0])).toMatch(/\?story=[\w-]+$/);
  });
});

describe('a story\'s clip in the panel (ST8)', () => {
  it('is greyed, with the reason, where the browser cannot encode video', async () => {
    render(<StoryPanel player={player()} handle={() => handle} />);
    act(() => openStoryPanel(null));
    fireEvent.click(screen.getByTestId('story-new'));
    fireEvent.click(screen.getByTestId('story-add'));
    await vi.waitFor(() => expect(screen.getByTestId('story-clip')).toBeDisabled());
    expect(screen.getByTestId('story-panel')).toHaveTextContent('This browser cannot encode video (no WebCodecs): the link and the cards still work.');
  });
});

describe('the palette and the globe', () => {
  it('offers "New story", and opening and playing each kept story', () => {
    const play = vi.fn();
    expect(storyResults('', play)).toEqual([]);
    storyResults('new story', play)[0].run();
    expect(storyPanel()).toMatchObject({ open: true, storyId: stories()[0].id });
    expect(storyResults('play story', play).map((r) => r.id)).toEqual([]); // no steps yet, nothing to play
  });

  it('shows a link\'s story ready to play, and the Story button opens the panel', () => {
    const story = { id: 's', title: 'From a link', steps: [{ view: { lat: 1, lng: 2, altitude: 1 }, layer: 'EarthWeather', pins: [], choices: {}, window: null, caption: 'Look here', holdS: 6 as const }], madeMs: 1 };
    const ready = player({ phase: 'ready', story });
    render(<><StoryCaption player={ready} /><StoryButton ready /></>);
    expect(screen.getByTestId('story-caption-card')).toHaveTextContent('From a link · Step 1 of 1');
    expect(screen.getByTestId('story-caption-card')).toHaveTextContent('Look here');
    fireEvent.click(screen.getByTestId('story-caption-play'));
    expect(ready.play).toHaveBeenCalledWith('s');
    fireEvent.click(screen.getByTestId('story-button'));
    expect(storyPanel().open).toBe(true);
  });
});
