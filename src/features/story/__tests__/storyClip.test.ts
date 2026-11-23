/**
 * A story as one clip, planned (D-ST, ST3, ST7): the first step held where the footage opens, each later step a flight
 * and its hold; each span from its flight's start to its hold's end, its caption under the story's title; up to
 * 1,800 frames, the steps that fit, the rest left out and said so.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { planStoryClip, spanAt, STORY_MAX_FRAMES } from '../storyClip';
import { messagesNow } from '../../../i18n/app/i18n';
import type { Story, StoryStep } from '../story';

const step = (lat: number, lng: number, holdS: 4 | 6 | 10, caption = ''): StoryStep => ({
  view: { lat, lng, altitude: 1.5 }, layer: 'EcologicalDisasters', pins: [], choices: {}, window: null, caption, holdS,
});
const w = messagesNow().story;

describe('a story\'s clip', () => {
  it('holds the first step, then flies to each next and holds it', () => {
    const story: Story = { id: 's', title: 'Two plates', steps: [step(36, 138, 4, 'Japan'), step(-20, -70, 6, 'The Andes')], madeMs: 1 };
    const plan = planStoryClip(story, w, { fps: 30 });
    expect(plan.durationMs).toBe(4000 + 2500 + 6000);
    expect(plan.spans.map((s) => [s.index, s.fromMs, s.toMs])).toEqual([[0, 0, 4000], [1, 4000, 12500]]);
    expect(plan.spans[1].caption).toMatchObject({ playlist: 'Two plates', progress: 'Step 2 of 2', title: 'The Andes' });
    // Japan to the Andes is a long way: the flight rises to the whole planet midway.
    expect(plan.keyframes.some((k) => k.altitude >= 2.5)).toBe(true);
    expect(plan.keyframes[0]).toMatchObject({ lat: 36, lng: 138, atMs: 0 });
    expect(plan.keyframes.at(-1)).toMatchObject({ lat: -20, lng: -70, atMs: 12500 });
    expect(spanAt(plan, 3999).index).toBe(0);
    expect(spanAt(plan, 4000).index).toBe(1);
  });

  it('holds a minute at 30 fps, and leaves out the steps past it, saying so', () => {
    const steps = Array.from({ length: 12 }, (_, i) => step(i, i * 10, 10));
    const plan = planStoryClip({ id: 's', title: '', steps, madeMs: 1 }, w, { fps: 30 });
    expect(Math.round((plan.durationMs / 1000) * 30) + 1).toBeLessThanOrEqual(STORY_MAX_FRAMES);
    expect(plan).toMatchObject({ shown: 4, total: 12, partial: true });
    expect(plan.spans[0].caption.playlist).toBe('Untitled story');
  });

  it('refuses a story with no step', () => {
    expect(() => planStoryClip({ id: 's', title: '', steps: [], madeMs: 1 }, w, { fps: 30 })).toThrow(/a step/);
  });
});
