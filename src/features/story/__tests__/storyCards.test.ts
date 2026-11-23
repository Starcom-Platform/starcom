/**
 * A card of every step, one zip (D-ST, ST5): each step set and its card made in order, its record written back into
 * the file with the caveat that the caption is the author's, story.txt listing the captions and the link, and the
 * view before put back after.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { captionCaveat, stepCaption, storyCardsZip, type StoryCardHandle } from '../storyCards';
import { readXmp } from '../../globe/capture/cardFileRecord';
import { messagesNow } from '../../../i18n/app/i18n';
import type { Story, StoryStep } from '../story';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const step = (lat: number): StoryStep => ({ view: { lat, lng: 0, altitude: 1.5 }, layer: 'EarthWeather', pins: [], choices: {}, window: null, caption: '', holdS: 6 });
const story: Story = { id: 's', title: 'Two views', steps: [step(10), step(20)], madeMs: 1 };

describe('a story\'s cards', () => {
  it('says the story and the step above each caption, and whose words it is', () => {
    const w = messagesNow().story;
    const withCaption: Story = { ...story, steps: [{ ...step(1), caption: 'Look here' }] };
    expect(stepCaption(withCaption, 0, w)).toMatchObject({ playlist: 'Two views', progress: 'Step 1 of 1', title: 'Look here' });
    expect(captionCaveat(withCaption, 0, w)).toBe('Two views, Step 1 of 1: the caption is the story\'s author\'s words, as written.');
  });

  it('makes each step\'s card in order, keeps its record, lists the captions and the link, and puts the view back', async () => {
    const views: number[] = [];
    const handle: StoryCardHandle = {
      getView: () => ({ lat: 50, lng: 10, altitude: 2.2 }),
      listLayers: () => [{ id: 'EcologicalDisasters', active: true, primary: true, pinned: false }],
      getLayerChoices: () => ({ choices: {} }),
      getTimeWindow: () => ({ from: null, until: null, live: true }),
      setLayer: () => ({}), pinLayers: () => ({}), setLayerChoices: () => ({}),
      setTimeWindow: async () => ({}),
      setView: async (v) => { views.push(v.lat); return {}; },
      whenReady: async () => ({}),
      compose: async () => ({
        dataUrl: PNG, mimeType: 'image/png', width: 1, height: 1, alt: 'A card',
        provenance: { schemaVersion: 37, capturedAt: '2026-11-10T09:00:00.000Z', caveats: ['Unsigned capture'] } as never, regions: { picture: { x: 0, y: 0, width: 1, height: 1 } },
      }),
    };
    const told: number[] = [];
    const zip = await JSZip.loadAsync(await storyCardsZip(handle, story, messagesNow().story, 'https://starcom.app/?story=abc', (i) => told.push(i)));
    expect(Object.keys(zip.files).sort()).toEqual(['step-01.png', 'step-02.png', 'story.txt']);
    expect(told).toEqual([0, 1]);
    expect(views).toEqual([10, 20, 50]);
    const xmp = readXmp(await zip.file('step-02.png')!.async('uint8array'), 'image/png')!;
    expect(xmp).toContain('Two views, Step 2 of 2: the caption is the story&apos;s author&apos;s words, as written.'.replace(/&apos;/g, "'"));
    expect(await zip.file('story.txt')!.async('string')).toBe('Two views\n\nStep 1 of 2: \nStep 2 of 2: \n\nhttps://starcom.app/?story=abc\n');
  });
});
