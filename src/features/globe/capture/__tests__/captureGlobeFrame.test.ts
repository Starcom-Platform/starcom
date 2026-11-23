/**
 * The parts of capture that are testable without a GPU.
 *
 * ─── WHAT THIS FILE CANNOT PROVE ───────────────────────────────────────────
 *
 * The central claim of captureGlobeFrame — that rendering and reading in one
 * synchronous block returns real pixels even with preserveDrawingBuffer false
 * — is a claim about a real WebGL implementation. A stub renderer here would
 * return whatever data URL I told it to, so a green test would mean nothing
 * about the behaviour that matters.
 *
 * That claim is verified separately, headlessly, against SwiftShader:
 * `scripts/smoke-globe-capture.mjs`, which renders the actual globe and
 * asserts the PNG has real content and real variation.
 *
 * What IS worth pinning here is everything around the render: size
 * resolution, the restore-on-throw contract, the refusals, and above all that
 * a blank result is refused rather than returned. Those are ordinary logic and
 * a stub exercises them honestly.
 */
import { describe, it, expect, vi } from 'vitest';
import { onStill, stilledAt } from '../../../../globe-engine/captureClock';
import { captureGlobeFrame, captureSession, GlobeCaptureError } from '../captureGlobeFrame';
import { attachSunBloom } from '../../../../globe-engine/sunBloom';

/** Enough of a PNG data URL to clear the blank-detection threshold. */
const realish = (w: number, h: number) =>
  'data:image/png;base64,' + 'A'.repeat(Math.ceil((w * h) / 1000) + 800);

function stub(over: {
  width?: number; height?: number; dataUrl?: string | ((w: number, h: number) => string);
  aspect?: number | null; renderThrows?: boolean;
  /** All-identical pixels means blank; varying means a real frame. */
  blankPixels?: boolean;
  /** Every sample alike, but the frame holds something between them: a far view of the dark sky. */
  sparse?: boolean;
  noGlContext?: boolean;
} = {}) {
  const canvas = {
    width: over.width ?? 800,
    height: over.height ?? 600,
    toDataURL: vi.fn((_type?: string, _q?: number) => {
      const d = over.dataUrl ?? realish;
      return typeof d === 'function' ? d(canvas.width, canvas.height) : d;
    }),
  };
  const calls: string[] = [];
  let readCount = 0;
  const gl = {
    RGBA: 0x1908, UNSIGNED_BYTE: 0x1401,
    readPixels: (_x: number, _y: number, w: number, h: number, _f: number, _t: number, out: Uint8Array) => {
      // Blank: every pixel identical. Sparse: every sample identical, one pixel of the whole frame not. Real: varies per read.
      const v = over.blankPixels || over.sparse ? 7 : (readCount++ % 251);
      for (let k = 0; k < w * h * 4; k += 4) { out[k] = v; out[k + 1] = v; out[k + 2] = v; out[k + 3] = 255; }
      if (over.sparse && w * h > 1) out[Math.floor((w * h) / 2) * 4] = 200;
    },
  };
  // As three.js's own: setSize takes CSS pixels and writes the canvas at the pixel ratio; getSize answers in CSS pixels.
  let ratio = 2;
  const css = { width: canvas.width / ratio, height: canvas.height / ratio };
  const renderer = {
    domElement: canvas,
    getContext: () => (over.noGlContext ? undefined : gl),
    getPixelRatio: () => ratio,
    setPixelRatio: vi.fn((r: number) => { ratio = r; calls.push(`pixelRatio:${r}`); }),
    getSize: (v: { set: (w: number, h: number) => unknown }) => v.set(css.width, css.height),
    setSize: vi.fn((w: number, h: number, updateStyle?: boolean) => {
      css.width = w; css.height = h;
      canvas.width = Math.floor(w * ratio); canvas.height = Math.floor(h * ratio);
      calls.push(`setSize:${w}x${h}:${updateStyle}`);
    }),
    render: vi.fn(() => {
      calls.push('render');
      if (over.renderThrows) throw new Error('context lost');
    }),
  };
  const camera: Record<string, unknown> = { updateProjectionMatrix: vi.fn() };
  if (over.aspect !== null) camera.aspect = over.aspect ?? 800 / 600;
  const scene = {};
  return {
    calls, renderer, camera, canvas,
    target: { renderer: () => renderer, scene: () => scene, camera: () => camera } as never,
  };
}

describe('size resolution', () => {
  it('defaults to the canvas size as it stands', () => {
    const s = stub();
    expect(captureGlobeFrame(s.target)).toMatchObject({ width: 800, height: 600 });
  });

  it('scales linearly, so scale 2 is four times the pixels', () => {
    const s = stub();
    expect(captureGlobeFrame(s.target, { scale: 2 })).toMatchObject({ width: 1600, height: 1200 });
  });

  it('takes an explicit size', () => {
    const s = stub();
    expect(captureGlobeFrame(s.target, { width: 1200, height: 630 }))
      .toMatchObject({ width: 1200, height: 630 });
  });

  /**
   * A width without a height would silently restretch the globe. For an image
   * whose whole purpose is being published, a quietly wrong aspect ratio is
   * worse than a refusal.
   */
  it('refuses a width without a height, and vice versa', () => {
    expect(() => captureGlobeFrame(stub().target, { width: 1200 }))
      .toThrow(/must be given together/);
    expect(() => captureGlobeFrame(stub().target, { height: 630 }))
      .toThrow(/must be given together/);
  });

  it.each([0, -1, NaN, Infinity])('refuses scale %s', (scale) => {
    expect(() => captureGlobeFrame(stub().target, { scale })).toThrow(/positive finite/);
  });

  /**
   * Past the WebGL renderbuffer limit the read SUCCEEDS and returns a blank
   * image, so a size check is the only place this can be caught honestly.
   */
  it('refuses a size over the WebGL limit rather than returning a blank', () => {
    expect(() => captureGlobeFrame(stub().target, { scale: 20 })).toThrow(/8192px limit/);
  });
});

describe('the live view is left as it was found', () => {
  it('restores size, pixel ratio and aspect, and re-renders', () => {
    const s = stub();
    captureGlobeFrame(s.target, { scale: 2 });

    expect(s.calls).toEqual([
      'pixelRatio:1', 'setSize:1600x1200:false', 'render',
      'pixelRatio:2', 'setSize:400x300:false', 'render',
    ]);
    expect((s.camera as { aspect: number }).aspect).toBeCloseTo(800 / 600);
  });

  it('gives the canvas back its own size on a 2x screen, capture after capture (found 3 Nov: it doubled each time)', () => {
    const s = stub();
    const { width, height } = s.target.renderer().domElement;
    for (let i = 0; i < 5; i += 1) captureGlobeFrame(s.target, { width: 64, height: 64 });
    expect(s.target.renderer().domElement.width).toBe(width);
    expect(s.target.renderer().domElement.height).toBe(height);
  });

  // IM23: motion is still for the capture's own render, and moving again before the live view draws.
  it('stills motion at the moment given for its render only, released before the live view draws again', () => {
    const s = stub();
    const leave = onStill({ still: (at) => s.calls.push(`still:${at}`), release: () => s.calls.push('release') });
    try {
      captureGlobeFrame(s.target, { scale: 2, stillAt: 1_790_967_291_000 });
      expect(s.calls).toEqual([
        'pixelRatio:1', 'setSize:1600x1200:false', 'still:1790967291000', 'render', 'release',
        'pixelRatio:2', 'setSize:400x300:false', 'render',
      ]);
    } finally {
      leave();
    }
  });

  it('stills motion at the capture\'s own moment when given none, and releases it when the render throws', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T08:00:00.000Z'));
    const s = stub({ renderThrows: true });
    const leave = onStill({ still: (at) => s.calls.push(`still:${at}`), release: () => s.calls.push('release') });
    try {
      expect(() => captureGlobeFrame(s.target)).toThrow();
      expect(s.calls).toContain(`still:${Date.parse('2026-10-03T08:00:00.000Z')}`);
      expect(s.calls).toContain('release');
      expect(stilledAt()).toBeNull();
    } finally {
      leave();
      vi.useRealTimers();
    }
  });

  it('passes updateStyle false so the on-screen globe does not jump', () => {
    const s = stub();
    captureGlobeFrame(s.target, { scale: 2 });
    for (const call of s.renderer.setSize.mock.calls) expect(call[2]).toBe(false);
  });

  /**
   * The reason the restore is in a `finally`. Without it a throw mid-capture
   * would leave the live globe stuck at capture dimensions — a visible,
   * permanent defect caused by a failed screenshot.
   */
  it('restores even when the render throws', () => {
    const s = stub({ renderThrows: true });
    expect(() => captureGlobeFrame(s.target, { scale: 4 })).toThrow('context lost');
    expect(s.canvas.width).toBe(800);
    expect(s.canvas.height).toBe(600);
    expect(s.renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
  });

  it('leaves an orthographic camera (no aspect) alone', () => {
    const s = stub({ aspect: null });
    expect(() => captureGlobeFrame(s.target, { scale: 2 })).not.toThrow();
    expect(s.camera).not.toHaveProperty('aspect');
  });
});

describe('the Sun\'s glow (decision K6, SS2)', () => {
  const composerFor = (calls: string[]) => ({
    addPass: vi.fn(), removePass: vi.fn(), setPixelRatio: vi.fn(), setSize: vi.fn(),
    render: vi.fn(() => { calls.push('glow'); }),
  });
  const rendererOfSize = {
    getSize: (v: { set: (w: number, h: number) => unknown }) => v.set(800, 600),
    getPixelRatio: () => 1,
    getClearColor: (c: { setHex: (hex: number) => unknown }) => c.setHex(0x000011),
  };

  it('renders the capture, and the live view after it, through the glow while it is on', () => {
    const s = stub();
    const bloom = attachSunBloom(composerFor(s.calls) as never, rendererOfSize as never, { background: null } as never);
    bloom.setActive(true);
    try {
      captureGlobeFrame(s.target, { scale: 2 });
    } finally {
      bloom.dispose();
    }
    expect(s.calls.filter((call) => call === 'glow')).toHaveLength(2);
    expect(s.calls).not.toContain('render');
  });

  it('renders as it always has while the glow is off', () => {
    const s = stub();
    const bloom = attachSunBloom(composerFor(s.calls) as never, rendererOfSize as never, { background: null } as never);
    try {
      captureGlobeFrame(s.target, { scale: 2 });
    } finally {
      bloom.dispose();
    }
    expect(s.calls.filter((call) => call === 'render')).toHaveLength(2);
    expect(s.calls).not.toContain('glow');
  });
});

describe('a blank frame is refused, not returned', () => {
  /**
   * The behaviour the whole file exists for. Every WebGL read failure — a
   * stale buffer, a lost context, an oversized target — produces a uniform
   * image rather than an error, and a capture function that hands one back has
   * reported success while producing nothing.
   */
  it('throws when every sampled pixel is identical', () => {
    expect(() => captureGlobeFrame(stub({ blankPixels: true }).target))
      .toThrow(GlobeCaptureError);
    expect(() => captureGlobeFrame(stub({ blankPixels: true }).target))
      .toThrow(/blank/i);
  });

  it('names the actual cause, so the reader is not left guessing', () => {
    expect(() => captureGlobeFrame(stub({ blankPixels: true }).target))
      .toThrow(/same synchronous block/);
  });

  it('accepts a frame whose pixels vary', () => {
    expect(captureGlobeFrame(stub().target).dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('accepts a far view of the dark sky, whose samples all miss the little drawn in it (25 Oct)', () => {
    expect(captureGlobeFrame(stub({ sparse: true }).target).dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  /**
   * ─── BYTE LENGTH WAS NEVER EVIDENCE ──────────────────────────────────────
   *
   * The first version of the blank check estimated the encoded PNG's size and
   * called anything under area/2000 bytes blank. Measured against the live
   * globe, a BLANK 1400x708 frame encodes to 22,084 bytes — forty times that
   * threshold — so it would have waved a blank frame through as real content.
   *
   * This pins the replacement: a large encoded payload does not make a frame
   * non-blank, because PNG overhead and the alpha channel put a floor on size
   * that has nothing to do with whether anything was drawn.
   */
  it('still refuses a blank frame that encodes to a large payload', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(30000);
    expect(() => captureGlobeFrame(stub({
      width: 1400, height: 708, blankPixels: true, dataUrl: big,
    }).target)).toThrow(/blank/i);
  });

  /**
   * Unable to sample is not the same as "fine". Reporting not-blank here would
   * be a guess dressed as a check.
   */
  it('refuses rather than guessing when it cannot sample', () => {
    expect(() => captureGlobeFrame(stub({ noGlContext: true }).target))
      .toThrow(/Refusing rather than guessing/);
  });
});

describe('before the globe exists', () => {
  it.each(['renderer', 'scene', 'camera'] as const)('refuses when %s is absent', (missing) => {
    const s = stub();
    const target = {
      renderer: () => (missing === 'renderer' ? undefined : s.renderer),
      scene: () => (missing === 'scene' ? undefined : {}),
      camera: () => (missing === 'camera' ? undefined : s.camera),
    } as never;
    // Not an error condition — it is the state before the first frame, and the
    // message says so rather than implying breakage.
    expect(() => captureGlobeFrame(target)).toThrow(/not ready to capture/);
  });
});

describe('encoding', () => {
  it('passes the mime type and quality through', () => {
    const s = stub();
    captureGlobeFrame(s.target, { mimeType: 'image/webp', quality: 0.8 });
    expect(s.canvas.toDataURL).toHaveBeenCalledWith('image/webp', 0.8);
  });

  it('defaults to png with no quality, which png ignores anyway', () => {
    const s = stub();
    captureGlobeFrame(s.target);
    expect(s.canvas.toDataURL).toHaveBeenCalledWith('image/png', undefined);
  });
});

/*
 * A window of the view (block I, item 2): the card's own frame. The camera's
 * view offset renders exactly the part of the current frustum the card shows,
 * at the size the card needs, so a square card on a landscape canvas is neither
 * letterboxed nor upscaled. Its aspect is left as the canvas's, because the
 * window is a fraction of that frustum; reaching past the canvas extends it.
 */
describe('a window of the view', () => {
  const withViewOffset = () => {
    const s = stub();
    const offsets: string[] = [];
    s.camera.setViewOffset = vi.fn((fw: number, fh: number, x: number, y: number, w: number, h: number) => {
      offsets.push(`setViewOffset:${fw}x${fh}@${x},${y} ${w}x${h} aspect ${s.camera.aspect}`);
      s.calls.push('setViewOffset');
    });
    s.camera.clearViewOffset = vi.fn(() => { s.calls.push('clearViewOffset'); });
    return { ...s, offsets };
  };

  it('renders the window asked for, at the size asked, through the view offset, the canvas\'s aspect kept', () => {
    const s = withViewOffset();
    const frame = captureGlobeFrame(s.target, { width: 1080, height: 1080, view: { x: 100, y: -200, width: 600, height: 600 } });
    expect(frame).toMatchObject({ width: 1080, height: 1080 });
    expect(s.offsets).toEqual([`setViewOffset:800x600@100,-200 600x600 aspect ${800 / 600}`]);
    expect(s.calls).toEqual([
      'pixelRatio:1', 'setSize:1080x1080:false', 'setViewOffset', 'render',
      'pixelRatio:2', 'setSize:400x300:false', 'clearViewOffset', 'render',
    ]);
    expect(s.camera.aspect).toBe(800 / 600);
  });

  it('puts back a view offset the camera already had', () => {
    const s = withViewOffset();
    s.camera.view = { enabled: true, fullWidth: 10, fullHeight: 20, offsetX: 1, offsetY: 2, width: 3, height: 4 };
    captureGlobeFrame(s.target, { width: 300, height: 300, view: { x: 0, y: 0, width: 600, height: 600 } });
    expect(s.offsets.at(-1)).toMatch(/^setViewOffset:10x20@1,2 3x4/);
    expect(s.calls).not.toContain('clearViewOffset');
  });

  it('refuses a window whose shape is not the output\'s, which would stretch the picture', () => {
    const s = withViewOffset();
    expect(() => captureGlobeFrame(s.target, { width: 1080, height: 1080, view: { x: 0, y: 0, width: 600, height: 300 } }))
      .toThrow(/stretch/);
    expect(s.calls).toEqual([]);
  });

  it('refuses a window without the size to render it at', () => {
    const s = withViewOffset();
    expect(() => captureGlobeFrame(s.target, { view: { x: 0, y: 0, width: 600, height: 600 } })).toThrow(/width and height/);
  });

  it('refuses an empty or unreadable window', () => {
    const s = withViewOffset();
    for (const view of [{ x: 0, y: 0, width: 0, height: 0 }, { x: Number.NaN, y: 0, width: 10, height: 10 }]) {
      expect(() => captureGlobeFrame(s.target, { width: 10, height: 10, view })).toThrow(/window/);
    }
  });

  it('refuses a window on a camera that cannot render one', () => {
    const s = stub();
    expect(() => captureGlobeFrame(s.target, { width: 100, height: 100, view: { x: 0, y: 0, width: 50, height: 50 } }))
      .toThrow(/cannot render a window/);
  });

  it('clears the window even when the render throws', () => {
    const s = withViewOffset();
    s.renderer.render.mockImplementationOnce(() => { throw new Error('context lost'); });
    expect(() => captureGlobeFrame(s.target, { width: 100, height: 100, view: { x: 0, y: 0, width: 50, height: 50 } })).toThrow();
    expect(s.calls).toContain('clearViewOffset');
  });
});

// A tour's caption burned into a clip's frame (briefing-playlists.md, BP15, BP19).
describe('an overlay drawn into the frame', () => {
  const surfaceFor = (calls: string[]) => {
    const ctx = { drawImage: vi.fn(() => calls.push('copy')) };
    const surface = { width: 0, height: 0, getContext: vi.fn(() => ctx), toDataURL: vi.fn((_t?: string, _q?: number) => `${realish(640, 360)}OVERLAID`) };
    return { ctx, surface };
  };

  it('copies the rendered frame onto its surface in the same read, draws on it, and encodes that', () => {
    const s = stub();
    const { ctx, surface } = surfaceFor(s.calls);
    const draw = vi.fn(() => { s.calls.push('overlay'); });
    const result = captureGlobeFrame(s.target, { width: 640, height: 360, mimeType: 'image/jpeg', quality: 0.9, overlay: { surface, draw } });
    const rendered = s.calls.indexOf('render');
    expect(s.calls.slice(rendered, rendered + 3)).toEqual(['render', 'copy', 'overlay']);
    expect(ctx.drawImage).toHaveBeenCalledWith(s.canvas, 0, 0);
    expect(draw).toHaveBeenCalledWith(ctx, 640, 360);
    expect(surface).toMatchObject({ width: 640, height: 360 });
    expect(surface.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);
    expect(s.canvas.toDataURL).not.toHaveBeenCalled();
    expect(result.dataUrl.endsWith('OVERLAID')).toBe(true);
  });

  it('still refuses a blank frame, drawn on or not', () => {
    const s = stub({ blankPixels: true });
    const { surface } = surfaceFor(s.calls);
    expect(() => captureGlobeFrame(s.target, { overlay: { surface, draw: () => undefined } })).toThrow(GlobeCaptureError);
  });
});

/*
 * A clip's frames (captureSession). Each capture on its own resizes, renders, reads, resizes back and renders the live
 * view again, and the live loop drew once more between two frames: three draws and two resizes a frame, on a machine
 * where each draw is the cost (the Jetson, software WebGL, about 2.3 to 3 s a footage frame, measured 4-5 Nov).
 */
describe('a run of frames in one session, as a clip\'s', () => {
  const aspectOf = (s: ReturnType<typeof stub>) => (s.camera as { aspect: number }).aspect;

  it('sizes the buffer at the first frame only, renders each frame once, and gives the live view back once at the end', () => {
    const s = stub();
    const session = captureSession();
    const frames = [0, 1, 2].map(() => captureGlobeFrame(s.target, { session, width: 640, height: 360 }));
    expect(frames.map((f) => [f.width, f.height])).toEqual([[640, 360], [640, 360], [640, 360]]);
    expect(s.calls).toEqual(['pixelRatio:1', 'setSize:640x360:false', 'render', 'render', 'render']);
    expect(aspectOf(s)).toBeCloseTo(640 / 360);

    session.end();
    expect(s.calls.slice(5)).toEqual(['pixelRatio:2', 'setSize:400x300:false', 'render']);
    expect(s.canvas).toMatchObject({ width: 800, height: 600 });
    expect(aspectOf(s)).toBeCloseTo(800 / 600);
  });

  it('works out every frame against the canvas as the first frame found it, so a scaled run does not compound', () => {
    const s = stub();
    const session = captureSession();
    const frames = [0, 1, 2].map(() => captureGlobeFrame(s.target, { session, scale: 2 }));
    session.end();
    expect(frames.map((f) => [f.width, f.height])).toEqual([[1600, 1200], [1600, 1200], [1600, 1200]]);
    expect(s.canvas).toMatchObject({ width: 800, height: 600 });
  });

  it('holds motion still for each frame\'s own render, and releases it before the next frame and the live view', () => {
    const s = stub();
    const leave = onStill({ still: (at) => s.calls.push(`still:${at}`), release: () => s.calls.push('release') });
    try {
      const session = captureSession();
      captureGlobeFrame(s.target, { session, stillAt: 1 });
      captureGlobeFrame(s.target, { session, stillAt: 2 });
      session.end();
      expect(s.calls).toEqual([
        'pixelRatio:1', 'setSize:800x600:false', 'still:1', 'render', 'release', 'still:2', 'render', 'release',
        'pixelRatio:2', 'setSize:400x300:false', 'render',
      ]);
    } finally {
      leave();
    }
  });

  it('holds the live loop\'s draws from the first frame until the end, and lets them go before the live view is drawn', () => {
    const s = stub();
    const letGo = vi.fn(() => { s.calls.push('let go'); });
    const holdLive = vi.fn(() => { s.calls.push('hold'); return letGo; });
    const session = captureSession({ holdLive });
    expect(holdLive).not.toHaveBeenCalled();
    captureGlobeFrame(s.target, { session });
    captureGlobeFrame(s.target, { session });
    expect(holdLive).toHaveBeenCalledTimes(1);
    expect(letGo).not.toHaveBeenCalled();
    session.end();
    session.end();
    expect(letGo).toHaveBeenCalledTimes(1);
    expect(s.calls.slice(-2)).toEqual(['let go', 'render']);
  });

  it('refuses a blank frame as a capture on its own does, and its end still gives the live view back', () => {
    const s = stub({ blankPixels: true });
    const letGo = vi.fn();
    const session = captureSession({ holdLive: () => letGo });
    expect(() => captureGlobeFrame(s.target, { session })).toThrow(/blank/);
    expect(stilledAt()).toBeNull();
    session.end();
    expect(s.canvas).toMatchObject({ width: 800, height: 600 });
    expect(s.renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(letGo).toHaveBeenCalledTimes(1);
  });

  it('releases motion when a frame\'s render throws, and its end gives the live view back', () => {
    const s = stub({ renderThrows: true });
    const session = captureSession();
    expect(() => captureGlobeFrame(s.target, { session, scale: 4 })).toThrow('context lost');
    expect(stilledAt()).toBeNull();
    session.end();
    expect(s.canvas).toMatchObject({ width: 800, height: 600 });
    expect(s.renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(aspectOf(s)).toBeCloseTo(800 / 600);
  });

  it('gives back what the live globe changed between two frames (a window resized), and keeps every frame one size', () => {
    const s = stub();
    const session = captureSession();
    captureGlobeFrame(s.target, { session });
    // The page resizes the globe between two frames, as react-globe.gl does: a CSS size at the pixel ratio in force
    // (the session's 1), and the camera's aspect.
    s.renderer.setSize(500, 250, false);
    (s.camera as { aspect: number }).aspect = 2;
    const second = captureGlobeFrame(s.target, { session });
    expect([second.width, second.height]).toEqual([800, 600]);
    expect(s.calls.slice(-3)).toEqual(['pixelRatio:1', 'setSize:800x600:false', 'render']);
    session.end();
    expect(s.calls.slice(-3)).toEqual(['pixelRatio:2', 'setSize:500x250:false', 'render']);
    expect(aspectOf(s)).toBe(2);
  });

  it('changes nothing at its end when it read no frame', () => {
    const s = stub();
    const holdLive = vi.fn(() => () => undefined);
    captureSession({ holdLive }).end();
    expect(s.calls).toEqual([]);
    expect(holdLive).not.toHaveBeenCalled();
  });

  it('refuses a frame once it has ended, and a window of the view', () => {
    const s = stub();
    const ended = captureSession();
    captureGlobeFrame(s.target, { session: ended });
    ended.end();
    expect(() => captureGlobeFrame(s.target, { session: ended })).toThrow(/has ended/);
    const windowed = { ...stub().camera, setViewOffset: vi.fn(), clearViewOffset: vi.fn(), view: null };
    const w = stub();
    const target = { renderer: () => w.renderer, scene: () => ({}), camera: () => windowed } as never;
    expect(() => captureGlobeFrame(target, { session: captureSession(), width: 400, height: 300, view: { x: 0, y: 0, width: 400, height: 300 } }))
      .toThrow(/captured on its own/);
    expect(w.calls).toEqual([]);
  });

  it('renders each frame through the Sun\'s glow while it is on, and the live view at its end', () => {
    const s = stub();
    const composer = { addPass: vi.fn(), removePass: vi.fn(), setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(() => { s.calls.push('glow'); }) };
    const rendererOfSize = {
      getSize: (v: { set: (w: number, h: number) => unknown }) => v.set(800, 600),
      getPixelRatio: () => 1,
      getClearColor: (c: { setHex: (hex: number) => unknown }) => c.setHex(0x000011),
    };
    const bloom = attachSunBloom(composer as never, rendererOfSize as never, { background: null } as never);
    bloom.setActive(true);
    try {
      const session = captureSession();
      captureGlobeFrame(s.target, { session });
      captureGlobeFrame(s.target, { session });
      session.end();
    } finally {
      bloom.dispose();
    }
    expect(s.calls.filter((call) => call === 'glow')).toHaveLength(3);
    expect(s.calls).not.toContain('render');
  });
});
