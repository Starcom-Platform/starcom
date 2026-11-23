/**
 * The frame loop, against a fake world.
 *
 * ─── WHAT THIS FILE CANNOT PROVE ───────────────────────────────────────────
 *
 * That real frames come out. jsdom has no WebGL, so the footage is proven by
 * scripts/smoke-share-clip.mjs, which renders against the live globe and checks
 * the assembled video with ffprobe and ffmpeg — outside the browser that made
 * it, which is what caught the first design's timing drift.
 *
 * What IS checkable here is the property that replaced real-time recording:
 * frame i depicts track time i/fps, exactly, however slow the machine is — and
 * the world's changes are placed on that same footage timeline.
 */
import { describe, it, expect, vi } from 'vitest';
import { recordGlobeClip, ClipRecordingError, MAX_FRAMES } from '../recordGlobeClip';
import { buildCameraTrack } from '../cameraTrack';

const T0 = Date.parse('2026-09-11T12:00:00.000Z');
const BUILD = { sha: 'a'.repeat(40), builtAt: new Date(T0).toISOString() };
const LAYERS = [{ label: 'Space Weather', active: true, implemented: true }];

/** Two seconds, three keyframes. */
const TRACK = buildCameraTrack([
  { atMs: 0, lat: 0, lng: -40, altitude: 2.5 },
  { atMs: 1000, lat: 10, lng: 0, altitude: 2 },
  { atMs: 2000, lat: 20, lng: 40, altitude: 1.5 },
]);

/**
 * A SLOW machine: every camera move costs 200ms of wall time — six times
 * slower than 30fps needs. Real time would drift on this machine; the frame
 * loop must not. NOAA fails `failAfterWallMs` into rendering, and its state is
 * read at the moment `sample` is called.
 */
function makeWorld(over: {
  failAfterWallMs?: number;
  blankOnFrame?: number;
  endCard?: 'none' | 'wrong-size';
} = {}) {
  let wall = 0;
  let renderStartedAt: number | null = null;
  let frameCount = 0;
  const log: string[] = [];

  const deps = {
    applyPose: vi.fn(async (pose: { lng: number }, settleMs?: number) => {
      log.push(settleMs ? `warm:${pose.lng}` : `pose:${pose.lng.toFixed(3)}`);
      wall += 200;
    }),
    captureFrame: vi.fn(() => {
      if (renderStartedAt === null) renderStartedAt = wall;
      frameCount++;
      if (over.blankOnFrame === frameCount) {
        throw new Error('The captured frame is blank — every sampled pixel is identical.');
      }
      log.push('frame');
      return { dataUrl: `data:image/jpeg;base64,F${frameCount}`, width: 1400, height: 708, mimeType: 'image/jpeg' };
    }),
    sample: vi.fn((at: Date) => {
      const intoRender = renderStartedAt === null ? 0 : wall - renderStartedAt;
      const down = over.failAfterWallMs !== undefined && intoRender >= over.failAfterWallMs;
      return {
        at,
        camera: { lat: 0, lon: 0, altitude: 2.5 },
        layers: LAYERS,
        feeds: [down
          ? { name: 'NOAA', lastUpdated: null, error: 'offline' }
          : { name: 'NOAA', lastUpdated: at.toISOString() }],
        marks: null,
        build: BUILD,
      };
    }),
    now: () => wall,
    wallClock: () => new Date(T0 + wall),
    /** One page held for a second, drawn over the last footage frame. */
    renderEndCard: vi.fn(async (last: { width: number; height: number }) => {
      if (over.endCard === 'none') return [];
      const w = over.endCard === 'wrong-size' ? last.width - 2 : last.width;
      return [{
        frame: { dataUrl: 'data:image/jpeg;base64,END', width: w, height: last.height, mimeType: 'image/jpeg' },
        holdMs: 1000,
      }];
    }),
  };
  return { deps, log };
}

describe('frame i depicts track time i/fps, whatever the machine', () => {
  it('states the clip\'s country names in its record when it asked for them (clip schema 7)', async () => {
    const named = await recordGlobeClip(TRACK, makeWorld().deps, { fps: 10, settleMs: 10, countryNames: true });
    expect(named.provenance.countryNames).toBe(true);
    const plain = await recordGlobeClip(TRACK, makeWorld().deps, { fps: 10, settleMs: 10 });
    expect(plain.provenance).not.toHaveProperty('countryNames');
  });

  // A briefing playlist as a clip (briefing-playlists.md, BP15, BP18; clip schema 8).
  it('gives each frame its footage time, for the caption drawn on it, and keeps a tour in the record', async () => {
    const tour = {
      playlist: 'war', title: 'War & Conflict today', shown: 1, total: 4, partial: false,
      opening: { why: 'The worst 1 of 4, worst first, by region', fromMs: 0, toMs: 1000 },
      stops: [{ id: 'a', title: 'Item a', progress: '1 of 1 · 4 in all', why: 'Why a', lines: [], fromMs: 1000, toMs: 2000 }],
    };
    const { deps } = makeWorld();
    const clip = await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10, tour });
    expect(deps.captureFrame.mock.calls.map((call) => (call as unknown[])[0])).toEqual(Array.from({ length: 21 }, (_, i) => i * 100));
    expect(clip.provenance.tracks).toEqual(['camera', 'tour']);
    expect(clip.provenance.tour).toEqual(tour);
    expect((await recordGlobeClip(TRACK, makeWorld().deps, { fps: 10, settleMs: 10 })).provenance).not.toHaveProperty('tour');
  });

  it('renders duration×fps + 1 footage frames — frame 0 at t=0, the last on the final keyframe', async () => {
    const { deps } = makeWorld();
    const clip = await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 });
    expect(clip.stats.footageFrames).toBe(21);
    expect(clip.stats.durationMs).toBe(2000);
  });

  it('poses every frame at exactly its moment on the track', async () => {
    const { deps } = makeWorld();
    await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 });
    const posed = deps.applyPose.mock.calls
      .filter(([, settle]) => !settle)
      .map(([pose]) => (pose as { lng: number }).lng);
    for (let i = 0; i < posed.length; i++) {
      expect(posed[i]).toBeCloseTo(TRACK.at((i / 10) * 1000).lng, 9);
    }
    expect(posed.at(-1)).toBeCloseTo(40, 9);
  });

  /**
   * The property MediaRecorder could not give. On a machine six times too
   * slow, footage length is still the track's length — the render just takes
   * longer, and that is reported separately rather than folded into the video.
   */
  it('keeps footage time fixed while render time follows the machine', async () => {
    const { deps } = makeWorld();
    const clip = await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 });
    expect(clip.stats.durationMs).toBe(2000);
    expect(clip.stats.renderMs).toBeGreaterThan(4000);
  });

  it('reads every frame through the capture path, so every frame is blank-checked', async () => {
    const { deps } = makeWorld();
    const clip = await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 });
    expect(deps.captureFrame).toHaveBeenCalledTimes(clip.stats.footageFrames);
  });

  it('refuses a clip with a blank frame in it, rather than returning one with a hole', async () => {
    const { deps } = makeWorld({ blankOnFrame: 7 });
    await expect(recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 })).rejects.toThrow(/blank/);
  });
});

describe('warming the path', () => {
  it('visits every keyframe before frame 0', async () => {
    const { deps, log } = makeWorld();
    await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 });
    const firstFrame = log.indexOf('frame');
    expect(log.slice(0, firstFrame).filter((e) => e.startsWith('warm:')))
      .toEqual(['warm:-40', 'warm:0', 'warm:40']);
  });
});

describe('the world, placed on the footage timeline', () => {
  /**
   * NOAA fails 2s of WALL time into a render that takes ~4.2s, which is
   * roughly frame 10 — one second into the FOOTAGE. The caveat must say 0:01,
   * the moment in the file where the affected frames begin, not 0:02.
   */
  it('states a mid-render failure at the footage moment it affected', async () => {
    const { deps } = makeWorld({ failAfterWallMs: 2000 });
    const clip = await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 });
    const noaa = clip.provenance.feeds.find((f) => f.name === 'NOAA')!;
    expect(noaa.runs.map((r) => r.state)).toEqual(['fresh', 'unreachable']);
    expect(noaa.runs[1].fromMs).toBe(1000);
    expect(clip.provenance.caveats.join(' ')).toMatch(/current 0:00–0:01, failed 0:01–0:02/);
  });

  it('says the footage was rendered over a longer span of real time', async () => {
    const { deps } = makeWorld();
    const clip = await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 });
    expect(clip.provenance.renderedOverMs).toBeGreaterThan(4000);
    expect(clip.provenance.caveats.join(' ')).toMatch(/Rendered frame by frame over 0:0\d of real time/);
  });
});

describe('refusals', () => {
  it('refuses more frames than can cross the automation boundary', async () => {
    const long = buildCameraTrack([
      { atMs: 0, lat: 0, lng: 0, altitude: 2 },
      { atMs: 60_000, lat: 0, lng: 90, altitude: 2 },
    ]);
    const { deps } = makeWorld();
    await expect(recordGlobeClip(long, deps, { fps: 30, settleMs: 10 }))
      .rejects.toThrow(new RegExp(`${MAX_FRAMES}-frame limit`));
    expect(deps.captureFrame).not.toHaveBeenCalled();
  });

  it('refuses a frame rate outside (0, 60]', async () => {
    const { deps } = makeWorld();
    await expect(recordGlobeClip(TRACK, deps, { fps: 0 })).rejects.toBeInstanceOf(ClipRecordingError);
    await expect(recordGlobeClip(TRACK, deps, { fps: 120 })).rejects.toBeInstanceOf(ClipRecordingError);
  });
});


describe('the end card — the caveats, as frames of the video', () => {
  /**
   * Before this, provenance came back as data beside the frames, and a clip
   * posted without that data had no caveats at all. The end card frames are in
   * `frames` itself, so assembling the video includes them.
   */
  it('appends the card after the footage, held for its reading time', async () => {
    const { deps } = makeWorld();
    const clip = await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 });
    // One page held 1000ms at 10 fps is ten frames.
    expect(clip.stats.endCardFrames).toBe(10);
    expect(clip.stats.endCardPages).toBe(1);
    expect(clip.frames).toHaveLength(clip.stats.footageFrames + 10);
    for (const f of clip.frames.slice(clip.stats.footageFrames)) expect(f.dataUrl).toContain('END');
    // And the footage is untouched: its last frame is still footage.
    expect(clip.frames[clip.stats.footageFrames - 1].dataUrl).not.toContain('END');
  });

  it('draws the card over the LAST footage frame, from the clip\'s own provenance', async () => {
    const { deps } = makeWorld();
    const clip = await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 });
    const [last, provenance, fps] = deps.renderEndCard.mock.calls[0] as unknown as [
      { dataUrl: string }, { schema: string }, number,
    ];
    expect(last.dataUrl).toBe(clip.frames[clip.stats.footageFrames - 1].dataUrl);
    expect(provenance).toBe(clip.provenance);
    expect(fps).toBe(10);
  });

  it('refuses a clip whose end card produced nothing, rather than returning it bare', async () => {
    const { deps } = makeWorld({ endCard: 'none' });
    await expect(recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 })).rejects.toThrow(/without its caveats/);
  });

  it('refuses an end card that does not match the footage size', async () => {
    const { deps } = makeWorld({ endCard: 'wrong-size' });
    await expect(recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 })).rejects.toThrow(/Every frame of a video must match/);
  });
});

/*
 * A short end card for a promotional post (decision D-F, section 18, item 5;
 * Mecha Jono's ask). Every page, so every caveat, is still in the clip — each
 * held for one frame instead of the seconds it takes to read, which a caller
 * can use as the clip's closing frame or its poster.
 */
describe('a poster end card', () => {
  it('keeps every page, one frame each', async () => {
    const { deps } = makeWorld();
    deps.renderEndCard.mockImplementationOnce(async (last: { width: number; height: number }) => [1, 2].map((n) => ({
      frame: { dataUrl: `data:image/jpeg;base64,END${n}`, width: last.width, height: last.height, mimeType: 'image/jpeg' },
      holdMs: 6000,
    })));
    const clip = await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10, endCard: 'poster' });
    expect(clip.stats.endCardPages).toBe(2);
    expect(clip.stats.endCardFrames).toBe(2);
    expect(clip.frames.slice(-2).map((f) => f.dataUrl)).toEqual(['data:image/jpeg;base64,END1', 'data:image/jpeg;base64,END2']);
  });

  it('holds each page long enough to read by default', async () => {
    const { deps } = makeWorld();
    const clip = await recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10 });
    // The world's one page, held a second at 10 fps.
    expect(clip.stats.endCardFrames).toBe(10);
  });

  it('refuses an end card it does not know', async () => {
    const { deps } = makeWorld();
    await expect(recordGlobeClip(TRACK, deps, { fps: 10, settleMs: 10, endCard: 'none' as never }))
      .rejects.toThrow(/endCard/);
  });
});

/*
 * A replay drives time beside the camera (decision D-F, section 18, item 5).
 * Each frame's moment is set before that frame is captured, so the frame shows it.
 */
describe('a clip that drives time', () => {
  it('sets each frame\'s moment before capturing it, in order', async () => {
    const { deps, log } = makeWorld();
    const moments: number[] = [];
    const withTime = { ...deps, applyTime: vi.fn((tMs: number) => { moments.push(tMs); log.push(`time:${tMs}`); }) };
    await recordGlobeClip(TRACK, withTime, { fps: 10, settleMs: 10 });
    expect(moments[0]).toBe(0);
    expect(moments[moments.length - 1]).toBe(2000);
    expect(moments).toEqual([...moments].sort((a, b) => a - b));
    // Time before the frame it belongs to: no footage frame is captured before
    // the first moment is set, and every frame follows its own moment.
    expect(log.indexOf('frame')).toBeGreaterThan(log.indexOf('time:0'));
    const sequence = log.filter((e) => e === 'frame' || e.startsWith('time:'));
    for (let i = 0; i < sequence.length; i += 2) {
      expect(sequence[i].startsWith('time:')).toBe(true);
      expect(sequence[i + 1]).toBe('frame');
    }
  });
});

describe('a clip that replays', () => {
  it('says so in its provenance, with the window it swept', async () => {
    const { deps } = makeWorld();
    const replay = { fromIso: '2026-09-20T00:00:00.000Z', toIso: '2026-09-25T00:00:00.000Z', pace: 'even' as const, untimed: 0 };
    const clip = await recordGlobeClip(TRACK, { ...deps, applyTime: () => {} }, { fps: 10, settleMs: 10, replay });
    expect(clip.provenance.tracks).toEqual(['camera', 'time']);
    expect(clip.provenance.replay).toEqual(replay);
  });
});

/*
 * A clip that sweeps the shared moment (decision D-W, step 5c). Moving the
 * moment reaches the weather a render later, so the recorder waits for it:
 * each frame is captured only once its moment is drawn.
 */
describe('a clip that sweeps the moment', () => {
  it('waits for each frame\'s moment to be drawn before posing and capturing it', async () => {
    const { deps, log } = makeWorld();
    const sweepTo = vi.fn(async (tMs: number) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      log.push(`drawn:${tMs}`);
    });
    await recordGlobeClip(TRACK, { ...deps, applyTime: sweepTo }, { fps: 1, settleMs: 10 });
    const footage = log.filter((entry) => !entry.startsWith('warm:'));
    expect(footage.slice(0, 3)).toEqual(['drawn:0', 'pose:-40.000', 'frame']);
    expect(footage.filter((entry) => entry.startsWith('drawn:'))).toEqual(['drawn:0', 'drawn:1000', 'drawn:2000']);
  });

  it('says it drove the moment, over which span', async () => {
    const { deps } = makeWorld();
    const sweep = { fromIso: '2026-10-07T00:00:00.000Z', toIso: '2026-10-07T12:00:00.000Z' };
    const clip = await recordGlobeClip(TRACK, { ...deps, applyTime: async () => {} }, { fps: 10, settleMs: 10, sweep });
    expect(clip.provenance.tracks).toEqual(['camera', 'moment']);
    expect(clip.provenance.sweep).toEqual(sweep);
  });
});
