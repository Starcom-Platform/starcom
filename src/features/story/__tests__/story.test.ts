/**
 * Stories kept in this browser (D-ST, ST2): made, changed, reordered and removed; a story or step that cannot be read
 * is passed over; twenty stories and twelve steps at most.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { changeStory, keepStory, moveStep, newStory, removeStory, resetStoriesForTests, stories, storyFrom, STORIES_MAX, STEPS_MAX, type StoryStep } from '../story';

const step = (caption: string): StoryStep => ({ view: { lat: 1, lng: 2, altitude: 1.5 }, layer: 'EarthWeather', pins: [], choices: {}, window: null, caption, holdS: 4 });

beforeEach(() => { localStorage.clear(); resetStoriesForTests(); });

describe('a kept story', () => {
  it('is made, changed and kept across a reload', () => {
    const made = newStory('Heat', 100)!;
    changeStory(made.id, (s) => ({ ...s, steps: [step('a'), step('b')] }));
    resetStoriesForTests();
    expect(stories()[0]).toMatchObject({ id: made.id, title: 'Heat', steps: [{ caption: 'a' }, { caption: 'b' }] });
    removeStory(made.id);
    expect(stories()).toEqual([]);
  });

  it('is twenty at most, and a link\'s story replaces the one with its id', () => {
    for (let i = 0; i < STORIES_MAX; i += 1) newStory(`s${i}`, i);
    expect(newStory('one more')).toBeNull();
    const first = stories()[3];
    keepStory({ ...first, title: 'from a link' });
    expect(stories().filter((s) => s.id === first.id)).toHaveLength(1);
    expect(stories()[0].title).toBe('from a link');
  });

  it('passes over what it cannot read, and holds twelve steps at most', () => {
    expect(storyFrom({ id: 'x' })).toBeNull();
    const many = storyFrom({ id: 'x', title: 't', steps: [...Array.from({ length: 15 }, (_, i) => step(String(i))), { view: {} }], madeMs: 1 })!;
    expect(many.steps).toHaveLength(STEPS_MAX);
    expect(storyFrom({ id: 'x', steps: [{ ...step('a'), holdS: 7, window: { from: 5, until: 1 } }] })!.steps[0]).toMatchObject({ holdS: 6, window: null });
  });

  it('moves a step up and down, never past either end', () => {
    const steps = [step('a'), step('b'), step('c')];
    expect(moveStep(steps, 1, -1).map((s) => s.caption)).toEqual(['b', 'a', 'c']);
    expect(moveStep(steps, 2, 1).map((s) => s.caption)).toEqual(['a', 'b', 'c']);
  });
});
