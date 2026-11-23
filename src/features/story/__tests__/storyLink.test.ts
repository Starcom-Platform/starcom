/**
 * A story's steps and its link (D-ST, ST1, ST2, ST6): a step is the view as the handle reads it (the layers drawn, each
 * one's choices, the window or live, the camera); a step is set back in that order, choices for this page only and
 * given back after; the link carries the whole story, deflated, and reads back the same.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { applyStep, captureStep, decodeStory, encodeStory, releaseChoices, storyLink, type Story, type StoryHandle, type StoryStep } from '../story';

const handleWith = (over: Partial<StoryHandle> = {}) => {
  const calls: string[] = [];
  const handle: StoryHandle = {
    getView: () => ({ lat: 35.6812, lng: 139.7671, altitude: 1.2345 }),
    listLayers: () => [
      { id: 'EcologicalDisasters', label: 'Eco Disasters', active: true, primary: true, pinned: false },
      { id: 'EarthWeather', label: 'Earth Weather', active: true, primary: false, pinned: true },
      { id: 'IntelReports', label: 'Intel Reports', active: false, primary: false, pinned: false },
    ],
    getLayerChoices: (layer) => ({ choices: layer === 'EcologicalDisasters' ? { 'eco:magnitudes': ['5', '6', '7'] } : {} }),
    getTimeWindow: () => ({ from: 1762560000, until: 1762646400, live: false }),
    setLayer: (layer) => { calls.push(`layer ${layer}`); return {}; },
    pinLayers: (layers) => { calls.push(`pins ${layers.join(',')}`); return {}; },
    setLayerChoices: (layer, choices) => { calls.push(`choices ${layer} ${choices ? Object.keys(choices).join(',') : 'null'}`); return {}; },
    setTimeWindow: async (w) => { calls.push(`window ${w ? `${w.from}..${w.until}` : 'live'}`); },
    setView: async (v, o) => { calls.push(`view ${v.lat},${v.lng} in ${o?.transitionMs}`); },
    whenReady: async () => { calls.push('ready'); },
    ...over,
  };
  return { handle, calls };
};

describe('a step', () => {
  it('is the view as it is: the layers drawn, each one\'s choices, the window, the camera to 0.01', () => {
    const step = captureStep(handleWith().handle);
    expect(step).toEqual({
      view: { lat: 35.68, lng: 139.77, altitude: 1.23 }, layer: 'EcologicalDisasters', pins: ['EarthWeather'],
      choices: { EcologicalDisasters: { 'eco:magnitudes': ['5', '6', '7'] } }, window: { from: 1762560000, until: 1762646400 },
      caption: '', holdS: 6,
    });
  });

  it('is live when the time bar is', () => {
    expect(captureStep(handleWith({ getTimeWindow: () => ({ from: null, until: null, live: true }) }).handle).window).toBeNull();
  });

  it('is set back layers first, then choices, the window, the camera, and waits for the globe', async () => {
    const { handle, calls } = handleWith();
    const step = captureStep(handle);
    await applyStep(handle, step, { transitionMs: 2500 });
    expect(calls).toEqual([
      'layer EcologicalDisasters', 'pins EarthWeather', 'choices EcologicalDisasters eco:magnitudes',
      'window 1762560000..1762646400', 'view 35.68,139.77 in 2500', 'ready',
    ]);
  });

  it('passes over a choice a layer refuses, and gives every layer\'s choices back after', async () => {
    const { handle, calls } = handleWith({ setLayerChoices: (layer, choices) => { if (choices) throw new Error('kept in its own settings'); calls.push(`release ${layer}`); return {}; } });
    const step = captureStep(handleWith().handle);
    await expect(applyStep(handle, step, { ready: false })).resolves.toBeUndefined();
    releaseChoices(handle, [step]);
    expect(calls).toContain('release EcologicalDisasters');
  });
});

describe('a story\'s link', () => {
  const step = (caption: string): StoryStep => ({
    view: { lat: 35.68, lng: 139.77, altitude: 1.2 }, layer: 'EcologicalDisasters', pins: ['EarthWeather'],
    choices: { EcologicalDisasters: { 'eco:magnitudes': ['5', '6', '7'], 'eco:depths': ['0', '33', '70', '150', '300', '500'] } },
    window: { from: 1762560000, until: 1762646400 }, caption, holdS: 6,
  });
  const story: Story = { id: 's1', title: 'The Tokyo quakes', steps: [step('The swarm south of Tokyo'), step('A year earlier: quiet'), step('The plate under it')], madeMs: 1 };

  it('reads back the whole story', async () => {
    expect(await decodeStory(await encodeStory(story))).toEqual(story);
  });

  it('stays short: about 200 characters a step, or less', async () => {
    const link = await storyLink(story, 'https://starcom.app');
    expect(link.startsWith('https://starcom.app/?story=')).toBe(true);
    expect(link.length).toBeLessThan(200 * story.steps.length);
  });

  it('reads nothing from a link it cannot read', async () => {
    expect(await decodeStory('not-a-story')).toBeNull();
    expect(await decodeStory('')).toBeNull();
  });
});
