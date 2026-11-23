/**
 * A story's clip through the recorder (D-ST, ST7, ST8): a minute's frames for a story only, every other clip keeping
 * 900; frames handed to an encoder in order, footage then end card, and not kept when the caller streams them.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { recordGlobeClip, ClipRecordingError, MAX_FRAMES, STORY_FRAMES_LIMIT } from '../recordGlobeClip';
import { buildCameraTrack } from '../cameraTrack';
import type { ClipStory } from '../clipProvenance';

const T0 = Date.parse('2026-11-10T12:00:00.000Z');
const BUILD = { sha: 'a'.repeat(40), builtAt: new Date(T0).toISOString() };
const track = (seconds: number) => buildCameraTrack([{ atMs: 0, lat: 0, lng: 0, altitude: 2 }, { atMs: seconds * 1000, lat: 10, lng: 10, altitude: 2 }]);
const STORY: ClipStory = { title: 'T', shown: 1, total: 1, partial: false, steps: [{ index: 0, fromMs: 0, toMs: 1000, layer: 'EarthWeather', pins: [], window: null, caption: 'c' }] };

const depsWith = (layersAt: (wall: number) => string) => {
  let wall = 0;
  return {
    applyPose: vi.fn(async () => { wall += 1; }),
    captureFrame: vi.fn(() => ({ dataUrl: 'data:image/jpeg;base64,F', width: 2, height: 2, mimeType: 'image/jpeg' })),
    sample: vi.fn((at: Date) => ({
      at, camera: { lat: 0, lon: 0, altitude: 2 }, layers: [{ label: layersAt(wall), active: true, implemented: true }],
      feeds: [], marks: null, build: BUILD,
    })),
    now: () => wall,
    wallClock: () => new Date(T0),
    renderEndCard: vi.fn(async (last: { width: number; height: number }) => [{ frame: { dataUrl: 'data:image/jpeg;base64,END', width: last.width, height: last.height, mimeType: 'image/jpeg' }, holdMs: 100 }]),
  };
};

describe('a story\'s clip', () => {
  it('may run to a minute; any other clip keeps 900 frames', async () => {
    expect(STORY_FRAMES_LIMIT).toBe(1800);
    await expect(recordGlobeClip(track(40), depsWith(() => 'Earth Weather'), { fps: 30 })).rejects.toThrow(ClipRecordingError);
    await expect(recordGlobeClip(track(40), depsWith(() => 'Earth Weather'), { fps: 30, maxFrames: 1800 })).rejects.toThrow(`${MAX_FRAMES}-frame`);
    const clip = await recordGlobeClip(track(40), depsWith(() => 'Earth Weather'), { fps: 30, story: STORY, maxFrames: 1800, keepFrames: false });
    expect(clip.stats.footageFrames).toBe(1201);
  });

  it('hands every frame to the encoder in order and keeps none when streamed, its layers changing as the story drives them', async () => {
    const handed: number[] = [];
    const deps = { ...depsWith((wall) => (wall < 15 ? 'Earth Weather' : 'Eco Disasters')), onFrame: vi.fn(async (_f: unknown, i: number) => { handed.push(i); }) };
    const clip = await recordGlobeClip(track(1), deps, { fps: 30, story: STORY, maxFrames: 1800, keepFrames: false });
    expect(clip.frames).toEqual([]);
    expect(handed).toEqual(Array.from({ length: clip.stats.frames }, (_, i) => i));
    expect(clip.stats.frames).toBe(clip.stats.footageFrames + clip.stats.endCardFrames);
    expect(clip.provenance.tracks).toContain('story');
    expect(clip.provenance.layersShown.sort()).toEqual(['Earth Weather', 'Eco Disasters']);
    expect(clip.provenance.story).toEqual(STORY);
    expect(clip.provenance.caveats.join(' ')).toMatch(/A story, "T": its captions are its author's words/);
  });

  it('refuses layers that change in a clip no story drives, as ever', async () => {
    await expect(recordGlobeClip(track(1), depsWith((wall) => (wall < 15 ? 'Earth Weather' : 'Eco Disasters')), { fps: 30 })).rejects.toThrow(/layers shown changed/);
  });
});
