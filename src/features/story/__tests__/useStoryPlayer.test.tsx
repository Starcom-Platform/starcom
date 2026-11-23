/**
 * Playing a story (D-ST, ST1, ST6): each step set and held for its own hold, a pause holding the clock, Resume setting
 * the step again and holding it in full, the end putting back the view before Play and giving back every layer's
 * choices; a link's story opens ready, nothing moving until Play.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStoryPlayer } from '../useStoryPlayer';
import { keepStory, resetStoriesForTests, type Story, type StoryHandle, type StoryStep } from '../story';

const step = (lat: number, holdS: 4 | 6 | 10, caption = ''): StoryStep => ({
  view: { lat, lng: 0, altitude: 1.5 }, layer: 'EarthWeather', pins: [], choices: { EarthWeather: { colour: 'temperature' } }, window: null, caption, holdS,
});
const story: Story = { id: 's1', title: 'T', steps: [step(10, 4, 'first'), step(20, 6, 'second')], madeMs: 1 };

let views: number[];
let released: string[];
const handle: StoryHandle = {
  getView: () => ({ lat: 0, lng: 0, altitude: 2.5 }),
  listLayers: () => [{ id: 'EcologicalDisasters', active: true, primary: true, pinned: false }],
  getLayerChoices: () => ({ choices: {} }),
  getTimeWindow: () => ({ from: null, until: null, live: true }),
  setLayer: () => ({}), pinLayers: () => ({}),
  setLayerChoices: (layer, choices) => { if (!choices) released.push(layer); return {}; },
  setTimeWindow: async () => ({}),
  setView: async (v) => { views.push(v.lat); return {}; },
  whenReady: async () => ({}),
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] });
  localStorage.clear(); resetStoriesForTests(); keepStory(story);
  views = []; released = [];
});
afterEach(() => { vi.useRealTimers(); });

const mount = () => renderHook(() => useStoryPlayer({ handle: () => handle, controls: () => undefined, reducedMotion: true }));

describe('playing a story', () => {
  it('sets each step and holds it for its hold, then puts back the view before Play', async () => {
    const { result } = mount();
    act(() => result.current.play('s1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.phase).toBe('playing');
    expect(result.current.index).toBe(0);
    expect(views).toEqual([10]);
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(result.current.index).toBe(1);
    expect(views).toEqual([10, 20]);
    await act(async () => { await vi.advanceTimersByTimeAsync(6100); });
    expect(result.current.phase).toBe('off');
    expect(views).toEqual([10, 20, 0]);
    expect(released).toEqual(['EarthWeather']);
  });

  it('holds the clock while paused, and Resume holds the step again in full', async () => {
    const { result } = mount();
    act(() => result.current.play('s1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    act(() => result.current.pause());
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(result.current.phase).toBe('paused');
    expect(result.current.index).toBe(0);
    act(() => result.current.resume());
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(result.current.index).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(result.current.index).toBe(1);
    act(() => result.current.end());
    expect(result.current.phase).toBe('off');
  });

  it('opens a link\'s story ready: the first step set, nothing moving until Play', async () => {
    const { result } = mount();
    await act(async () => { await result.current.ready(story); });
    expect(result.current.phase).toBe('ready');
    expect(views).toEqual([10]);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(views).toEqual([10]);
  });

  it('says so when there is nothing to play', () => {
    keepStory({ ...story, id: 'empty', steps: [] });
    const { result } = mount();
    act(() => result.current.play('empty'));
    expect(result.current.phase).toBe('off');
    expect(result.current.notice).toBe('A story needs a step to play.');
  });
});
