/**
 * Read a still frame out of the live globe.
 *
 * ─── WHY THIS IS NOT `canvas.toDataURL()` ──────────────────────────────────
 *
 * Globe.tsx passes `rendererConfig={{ preserveDrawingBuffer: false, ... }}`,
 * and that is the right setting: with it true, WebGL keeps a second copy of
 * every frame's colour buffer alive so the canvas can be read at any moment.
 * That is a permanent memory and bandwidth cost on every frame for every
 * viewer, paid to enable an occasional snapshot.
 *
 * With it false, the buffer is invalidated once the frame is composited, so a
 * `toDataURL()` called from an event handler, a timeout, or a promise
 * continuation returns a blank image — and blank is the dangerous answer,
 * because it looks like a picture.
 *
 * The way through is to render and read in the SAME synchronous block, before
 * the browser gets a chance to composite. `renderer.render(...)` leaves the
 * buffer valid until control returns to the event loop, so a `toDataURL()` on
 * the very next line sees real pixels. Nothing between those two statements
 * may await.
 *
 * That is the whole reason this file exists rather than a one-line helper: the
 * constraint is not obvious, and getting it wrong produces a plausible-looking
 * empty PNG.
 *
 * ─── AND WHY IT REFUSES RATHER THAN RETURNING A BLANK ──────────────────────
 *
 * Every failure mode here — an oversized canvas, a lost context, a read after
 * compositing — produces a uniform image rather than an error. A capture
 * function that hands back a blank PNG is the same defect this codebase has
 * spent a long time removing: a call that reports success while producing
 * nothing. So the result is inspected before it is returned, and an empty
 * frame throws with the reason.
 */
import type * as THREE from 'three';
import { releaseMotion, stillMotion } from '../../../globe-engine/captureClock';
import { renderThroughBloom } from '../../../globe-engine/sunBloom';

/**
 * The subset of react-globe.gl's GlobeMethods this needs.
 *
 * Declared structurally rather than importing GlobeMethods so the capture path
 * can be exercised with a stub renderer in a test, and so it does not couple
 * to the globe library's whole surface.
 */
export interface GlobeCaptureTarget {
  renderer(): THREE.WebGLRenderer;
  scene(): THREE.Scene;
  camera(): THREE.Camera;
}

export interface CaptureOptions {
  /**
   * Linear multiplier on the current canvas size. 2 gives four times the
   * pixels. Ignored when `width`/`height` are given.
   *
   * This is the "customised scaling" a share card needs: the globe on screen
   * is whatever size the viewport made it, and a published image should not
   * inherit that accident.
   */
  scale?: number;
  /** Explicit output width in device pixels. Requires `height`. */
  width?: number;
  /** Explicit output height in device pixels. Requires `width`. */
  height?: number;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  /** 0..1, honoured for jpeg and webp only. */
  quality?: number;
  /**
   * The moment motion is held at for this render, in ms since the epoch: glows
   * at rest, clouds and space weather at its phase (decision IM23), so the same
   * shot makes the same picture. Default: the capture's own moment.
   */
  stillAt?: number;
  /**
   * A window of the view to render instead of the whole canvas, in the canvas's
   * device pixels: what the camera shows now, cut to this box, and extended
   * past the canvas where the box reaches beyond it (block I, item 2). It is
   * rendered through the camera's view offset at `width` x `height`, which
   * must be the window's own shape, so a card's frame is its own picture at
   * its own resolution: never letterboxed, never upscaled.
   */
  view?: CaptureView;
  /**
   * Something drawn over the frame, as a tour's caption is into a clip's
   * (briefing-playlists.md, BP15): the rendered frame is copied onto `surface` in
   * the same read as the render, `draw` paints on it, and the surface is what is
   * encoded. The blank-frame refusal still reads the render itself.
   */
  overlay?: CaptureOverlay;
  /**
   * The run of frames this one belongs to, as a clip's are (captureSession): the buffer sized once for them all and
   * put back once, at the session's end, rather than around every frame. Not with `view`.
   */
  session?: CaptureSession;
}

/** A 2D canvas to draw over a frame on, and what to draw. */
export interface CaptureOverlay {
  surface: {
    width: number;
    height: number;
    getContext(kind: '2d'): { drawImage(image: CanvasImageSource, x: number, y: number): void } | null;
    toDataURL(type?: string, quality?: number): string;
  };
  draw(ctx: NonNullable<ReturnType<CaptureOverlay['surface']['getContext']>>, width: number, height: number): void;
}

export interface CaptureView {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A camera that can render a window of its frustum: three.js's PerspectiveCamera. */
interface WindowCamera {
  aspect: number;
  view: { enabled: boolean; fullWidth: number; fullHeight: number; offsetX: number; offsetY: number; width: number; height: number } | null;
  setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void;
  clearViewOffset(): void;
}

export interface CaptureResult {
  /** A `data:` URL of the encoded frame. */
  dataUrl: string;
  /** Device pixels actually rendered — not what was asked for, what happened. */
  width: number;
  height: number;
  mimeType: string;
}

/** WebGL implementations cap renderbuffer dimensions; past it, reads go blank. */
const MAX_DIMENSION = 8192;

export class GlobeCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlobeCaptureError';
  }
}

function resolveSize(
  canvas: { width: number; height: number },
  options: CaptureOptions,
): { width: number; height: number } {
  if (options.width !== undefined || options.height !== undefined) {
    if (options.width === undefined || options.height === undefined) {
      throw new GlobeCaptureError(
        'width and height must be given together — one alone would silently '
        + 'change the aspect ratio of the published image.',
      );
    }
    return { width: Math.round(options.width), height: Math.round(options.height) };
  }
  const scale = options.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new GlobeCaptureError(`scale must be a positive finite number, got ${scale}`);
  }
  return {
    width: Math.round(canvas.width * scale),
    height: Math.round(canvas.height * scale),
  };
}

/** A window is a box of positive size, rendered at its own shape, by a camera that can. */
function checkWindow(
  view: CaptureView,
  options: CaptureOptions,
  requested: { width: number; height: number },
  camera: THREE.Camera,
): void {
  if (options.width === undefined || options.height === undefined) {
    throw new GlobeCaptureError('A window is rendered at a size given as width and height: the card\'s own.');
  }
  if (![view.x, view.y, view.width, view.height].every(Number.isFinite) || view.width <= 0 || view.height <= 0) {
    throw new GlobeCaptureError(`The window ${JSON.stringify(view)} is not a box of positive size.`);
  }
  const shape = view.width / view.height;
  const output = requested.width / requested.height;
  if (Math.abs(shape - output) / output > 0.01) {
    throw new GlobeCaptureError(
      `The window is ${shape.toFixed(3)}:1 and the output ${output.toFixed(3)}:1: rendering one into the other `
      + 'would stretch the picture. Refusing rather than distorting it.',
    );
  }
  const windowed = camera as unknown as Partial<WindowCamera>;
  if (typeof windowed.setViewOffset !== 'function' || typeof windowed.clearViewOffset !== 'function') {
    throw new GlobeCaptureError('This camera cannot render a window of its view: it has no view offset.');
  }
}

/**
 * True when the rendered frame carries no image.
 *
 * ─── THE FIRST VERSION OF THIS GUESSED FROM BYTE SIZE, AND WAS WRONG ───────
 *
 * It estimated the encoded PNG's length and called anything under
 * `area / 2000` bytes blank — about 500 bytes for a 1400x708 frame — on the
 * reasoning that a flat image compresses to almost nothing.
 *
 * Measured against the real globe, a BLANK 1400x708 frame encodes to 22,084
 * bytes and a rendered one to 439,117. The threshold was off by a factor of
 * forty, and it would have waved a blank frame straight through as real
 * content — the exact failure this function exists to prevent, in the function
 * written to prevent it.
 *
 * PNG overhead, the alpha channel and row filtering all put a floor on the
 * encoded size that has nothing to do with whether anything was drawn. Byte
 * length was never evidence.
 *
 * So it reads pixels now. `gl.readPixels` in the same synchronous block as the
 * render sees the same buffer `toDataURL` did, and a scattered sample is
 * enough: a frame containing a globe has variation, a blank one does not,
 * whatever the encoder makes of it.
 */
function frameIsBlank(renderer: THREE.WebGLRenderer): boolean {
  const gl = renderer.getContext?.();
  if (!gl || typeof gl.readPixels !== 'function') {
    /*
     * No context to sample. Reporting "not blank" would be a guess dressed as
     * a check — and this function's whole purpose is refusing to do that — but
     * throwing here would break capture on any renderer that does not expose a
     * context. The caller is told instead, via a distinct error, so the
     * ambiguity surfaces rather than resolving itself silently.
     */
    throw new GlobeCaptureError(
      'Cannot sample the rendered frame: the renderer exposes no WebGL context, '
      + 'so whether the capture is blank is unknown. Refusing rather than guessing.',
    );
  }

  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const SAMPLES_PER_AXIS = 9;
  const pixel = new Uint8Array(4);
  let first: string | null = null;

  for (let iy = 1; iy < SAMPLES_PER_AXIS; iy++) {
    for (let ix = 1; ix < SAMPLES_PER_AXIS; ix++) {
      const x = Math.floor((width * ix) / SAMPLES_PER_AXIS);
      const y = Math.floor((height * iy) / SAMPLES_PER_AXIS);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const key = `${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]}`;
      if (first === null) first = key;
      else if (key !== first) return false;
    }
  }
  /*
   * Every sample alike is not yet a blank frame. A far view of the dark sky can be: a small Earth in the middle, between
   * the samples, and the solar system's names too thin to meet one. Found 25 Oct, a card at 40 radii out refused as
   * blank. So the whole frame is read once before it is called blank.
   */
  const all = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, all);
  for (let k = 4; k < all.length; k += 4) {
    if (all[k] !== all[0] || all[k + 1] !== all[1] || all[k + 2] !== all[2] || all[k + 3] !== all[3]) return false;
  }
  return true;
}

/** The rendered frame copied onto the overlay's surface, drawn on, and encoded: called between the render and the read. */
function overlaid(
  overlay: CaptureOverlay,
  frame: CanvasImageSource,
  size: { width: number; height: number },
  mimeType: string,
  quality: number | undefined,
): string {
  const { surface } = overlay;
  surface.width = size.width;
  surface.height = size.height;
  const ctx = surface.getContext('2d');
  if (!ctx) throw new GlobeCaptureError('There is no 2D canvas to draw over the frame on, so the frame would go out without what belongs on it.');
  ctx.drawImage(frame, 0, 0);
  overlay.draw(ctx, size.width, size.height);
  return surface.toDataURL(mimeType, quality);
}

/** The size the renderer keeps, in CSS pixels: what setSize is given back (see the note where it is read). */
function cssSizeOf(renderer: THREE.WebGLRenderer, canvas: { width: number; height: number }, pixelRatio: number): { x: number; y: number } {
  const css = { x: canvas.width / pixelRatio, y: canvas.height / pixelRatio };
  if (typeof renderer.getSize === 'function') {
    renderer.getSize({ set(w: number, h: number) { css.x = w; css.y = h; return this; } } as unknown as THREE.Vector2);
  }
  return css;
}

/**
 * Motion held still, then the render and the read: what every frame is, alone or in a session. The caller releases
 * motion in its own `finally`, before the live view draws again.
 */
function renderAndRead(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  requested: { width: number; height: number },
  mimeType: string,
  options: CaptureOptions,
): { dataUrl: string; blank: boolean } {
  const canvas = renderer.domElement;
  // Motion held still for this render only (IM23); released before the live view draws again.
  stillMotion(options.stillAt ?? Date.now());

  // ─── these three statements must stay adjacent ────────────────────────
  // The sample has to happen here too: gl.readPixels reads the same buffer
  // toDataURL does, and it is invalidated by the same composite. Through the
  // Sun's glow while it is on, as the live view draws it (decision K6, SS2).
  if (!renderThroughBloom()) renderer.render(scene, camera);
  const dataUrl = options.overlay ? overlaid(options.overlay, canvas, requested, mimeType, options.quality) : canvas.toDataURL(mimeType, options.quality);
  const blank = frameIsBlank(renderer);
  // ──────────────────────────────────────────────────────────────────────
  return { dataUrl, blank };
}

function blankFrameError(): GlobeCaptureError {
  return new GlobeCaptureError(
    'The captured frame is blank — every sampled pixel is identical. The usual '
    + 'cause is a read that did not happen in the same synchronous block as the '
    + 'render: with preserveDrawingBuffer false the colour buffer is invalidated '
    + 'once the frame is composited, and the app sets it false deliberately. '
    + 'Measured against the live globe, that produces a 22KB PNG where a rendered '
    + 'frame is 439KB — which is why this is sampled rather than inferred from '
    + 'byte length. A lost WebGL context looks the same. Refusing rather than '
    + 'returning an empty image.',
  );
}

/**
 * Render the globe at a chosen size and return the frame.
 *
 * MUST NOT be made async, and nothing may be awaited between the render and
 * the read — see the note at the top of this file. The signature is
 * deliberately synchronous so that constraint is enforced by the type.
 */
export function captureGlobeFrame(
  target: GlobeCaptureTarget,
  options: CaptureOptions = {},
): CaptureResult {
  const renderer = target.renderer?.();
  const scene = target.scene?.();
  const camera = target.camera?.();

  if (!renderer || !scene || !camera) {
    throw new GlobeCaptureError(
      'The globe is not ready to capture: renderer, scene or camera is absent. '
      + 'This is the state before the first frame, not an error condition — '
      + 'wait for the globe to initialise.',
    );
  }

  const session = options.session ? sessionStateOf(options.session, renderer, options) : null;
  const canvas = renderer.domElement;
  // In a session past its first frame the canvas is at the capture's size; the live canvas's is the one noted then.
  const requested = resolveSize(session?.base ?? canvas, options);
  const view = options.view;
  if (view) checkWindow(view, options, requested, camera);

  if (requested.width > MAX_DIMENSION || requested.height > MAX_DIMENSION) {
    throw new GlobeCaptureError(
      `Requested ${requested.width}x${requested.height}, over the ${MAX_DIMENSION}px `
      + 'limit WebGL implementations enforce. Past it the read succeeds and returns '
      + 'a blank image, so this refuses instead.',
    );
  }

  const mimeType = options.mimeType ?? 'image/png';
  if (session) return sessionFrame(session, renderer, scene, camera, requested, mimeType, options);

  // Everything that must be put back, captured before anything changes.
  const previousSize = { width: canvas.width, height: canvas.height };
  const previousPixelRatio = renderer.getPixelRatio();
  /*
   * The size to give back, in CSS pixels, as the renderer keeps it: setSize multiplies what it is given by the pixel
   * ratio, so the canvas's own width (device pixels) given back to it doubled the canvas on every capture on a 2x
   * screen, until the drawing buffer gave out and everything drew small (found 3 Nov: a 1,440-px globe at 23,040).
   */
  const previousCss = cssSizeOf(renderer, canvas, previousPixelRatio);
  const perspective = camera as THREE.PerspectiveCamera;
  const previousAspect = typeof perspective.aspect === 'number' ? perspective.aspect : null;
  const windowed = camera as unknown as WindowCamera;
  const previousView = view && windowed.view?.enabled ? { ...windowed.view } : null;

  let frame: { dataUrl: string; blank: boolean };
  try {
    // setSize's third argument false leaves the CSS size alone, so resizing for
    // the capture does not make the live globe visibly jump.
    renderer.setPixelRatio(1);
    renderer.setSize(requested.width, requested.height, false);
    if (view) {
      // A window of the frustum as it stands: the aspect stays the canvas's, so
      // the window is exactly that fraction of it, wherever it reaches.
      windowed.setViewOffset(previousSize.width, previousSize.height, view.x, view.y, view.width, view.height);
    } else if (previousAspect !== null) {
      perspective.aspect = requested.width / requested.height;
      perspective.updateProjectionMatrix();
    }
    frame = renderAndRead(renderer, scene, camera, requested, mimeType, options);
  } finally {
    releaseMotion();
    // Restored in `finally` so a throw between the resize and the read cannot
    // leave the live globe stuck at capture dimensions.
    renderer.setPixelRatio(previousPixelRatio);
    renderer.setSize(previousCss.x, previousCss.y, false);
    if (view) {
      if (previousView) {
        windowed.setViewOffset(previousView.fullWidth, previousView.fullHeight, previousView.offsetX, previousView.offsetY, previousView.width, previousView.height);
      } else {
        windowed.clearViewOffset();
      }
    } else if (previousAspect !== null) {
      perspective.aspect = previousAspect;
      perspective.updateProjectionMatrix();
    }
    try {
      if (!renderThroughBloom()) renderer.render(scene, camera);
    } catch {
      // The live view will correct itself on the next animation frame. Not
      // worth masking the original error for.
    }
  }

  if (frame.blank) throw blankFrameError();

  return { dataUrl: frame.dataUrl, width: requested.width, height: requested.height, mimeType };
}

/**
 * Frames read one after another at one size, as a clip's are: the buffer sized once for them all, put back once.
 *
 * ─── WHY A CLIP'S FRAMES SHARE ONE SIZING ──────────────────────────────────
 *
 * A capture on its own sizes the drawing buffer for itself, renders and reads, then puts the size back and renders
 * again, so the live view is right the moment it returns. For one card that is the right shape. A clip paid it on
 * every frame: two resizes and two renders, and the live globe's own loop drew a third time between two frames, at
 * a moment no frame keeps. On the Jetson Mecha Jono records on, headless Chromium draws WebGL in software and each
 * draw is the cost: about 2.3 to 3 s a footage frame (measured 4-5 Nov).
 *
 * In a session the first frame sizes the buffer and the camera's aspect, and they stay so; the live loop's draws are
 * held (`holdLive`: liveDraws.ts) from then until the end; and every frame is rendered and read exactly as a capture
 * on its own is: motion held still for its render, the render and the read in one synchronous block, the blank-frame
 * refusal. `end()` gives back the size, the pixel ratio and the aspect, lets the live draws go, and draws the live
 * view once, as a capture on its own does after its frame.
 *
 * `end()` MUST be called however the frames end, from a `finally`. Until it is, the live globe stays at the capture's
 * size and its own loop draws nothing.
 *
 * Every frame of a session is worked out against the canvas as the first frame found it, so no two frames differ in
 * size. What the live globe changes between two frames (a window resized, say) is what `end()` gives back: it is
 * noted, and the capture's own size put back for the next frame.
 */
export interface CaptureSession {
  /** Gives the live view back, lets its draws go, and draws it once. Again, it does nothing. */
  end(): void;
}

interface LiveView {
  pixelRatio: number;
  /** In CSS pixels, as the renderer keeps it. */
  css: { x: number; y: number };
  aspect: number | null;
}

interface SessionState {
  holdLive?: () => () => void;
  /** The globe the first frame was read from; null until then, and nothing to give back. */
  target: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera } | null;
  /** The canvas's size, device pixels, as the first frame found it: what every frame's size is worked out against. */
  base: { width: number; height: number } | null;
  /** What the live view has, to give back at the end. */
  live: LiveView | null;
  /** What this session set, to tell it from what the live globe changes between two frames. */
  set: { width: number; height: number; aspect: number | null } | null;
  letGo: (() => void) | null;
  ended: boolean;
}

const sessions = new WeakMap<CaptureSession, SessionState>();

/**
 * A session for a run of frames. `holdLive` holds the live loop's draws from the first frame and returns how to let
 * them go; it is called once, and what it returns once, at the end.
 */
export function captureSession(options: { holdLive?: () => () => void } = {}): CaptureSession {
  const state: SessionState = { holdLive: options.holdLive, target: null, base: null, live: null, set: null, letGo: null, ended: false };
  const session: CaptureSession = { end: () => endSession(state) };
  sessions.set(session, state);
  return session;
}

function sessionStateOf(session: CaptureSession, renderer: THREE.WebGLRenderer, options: CaptureOptions): SessionState {
  const state = sessions.get(session);
  if (!state) throw new GlobeCaptureError('That session is not one captureSession made.');
  if (state.ended) throw new GlobeCaptureError('This session has ended: the live view is back. A new run of frames takes a new session.');
  if (options.view) {
    throw new GlobeCaptureError('A window of the view is captured on its own, not in a session: a session holds one whole-frame size for all its frames.');
  }
  if (state.target && state.target.renderer !== renderer) {
    throw new GlobeCaptureError('The globe was replaced between two frames of this session: its frames would not be of one globe.');
  }
  return state;
}

/** What the live globe changed since this session last set it (a window resized, say): that is now what to give back. */
function noteLiveChanges(state: SessionState): void {
  if (!state.target || !state.live || !state.set) return;
  const { renderer, camera } = state.target;
  const ratio = renderer.getPixelRatio();
  if (ratio !== 1) state.live.pixelRatio = ratio;
  const css = cssSizeOf(renderer, renderer.domElement, ratio);
  if (css.x !== state.set.width || css.y !== state.set.height) state.live.css = css;
  const aspect = (camera as THREE.PerspectiveCamera).aspect;
  if (state.set.aspect !== null && typeof aspect === 'number' && aspect !== state.set.aspect) state.live.aspect = aspect;
}

function sessionFrame(
  state: SessionState,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  requested: { width: number; height: number },
  mimeType: string,
  options: CaptureOptions,
): CaptureResult {
  const canvas = renderer.domElement;
  const perspective = camera as THREE.PerspectiveCamera;
  const aspect = typeof perspective.aspect === 'number' ? requested.width / requested.height : null;
  if (!state.target) {
    // The first frame. Everything that must be put back, captured before anything changes, as a capture on its own does.
    state.target = { renderer, scene, camera };
    state.base = { width: canvas.width, height: canvas.height };
    const pixelRatio = renderer.getPixelRatio();
    state.live = { pixelRatio, css: cssSizeOf(renderer, canvas, pixelRatio), aspect: typeof perspective.aspect === 'number' ? perspective.aspect : null };
    // setSize's third argument false leaves the CSS size alone, so the live globe does not visibly jump.
    renderer.setPixelRatio(1);
    renderer.setSize(requested.width, requested.height, false);
    if (aspect !== null) {
      perspective.aspect = aspect;
      perspective.updateProjectionMatrix();
    }
    state.set = { width: requested.width, height: requested.height, aspect };
    if (state.holdLive) state.letGo = state.holdLive();
  } else {
    noteLiveChanges(state);
    const css = cssSizeOf(renderer, canvas, renderer.getPixelRatio());
    if (renderer.getPixelRatio() !== 1 || css.x !== requested.width || css.y !== requested.height) {
      renderer.setPixelRatio(1);
      renderer.setSize(requested.width, requested.height, false);
    }
    if (aspect !== null && perspective.aspect !== aspect) {
      perspective.aspect = aspect;
      perspective.updateProjectionMatrix();
    }
    state.set = { width: requested.width, height: requested.height, aspect };
  }

  let frame: { dataUrl: string; blank: boolean };
  try {
    frame = renderAndRead(renderer, scene, camera, requested, mimeType, options);
  } finally {
    releaseMotion();
  }
  if (frame.blank) throw blankFrameError();
  return { dataUrl: frame.dataUrl, width: requested.width, height: requested.height, mimeType };
}

function endSession(state: SessionState): void {
  if (state.ended) return;
  state.ended = true;
  const target = state.target;
  try {
    if (!target || !state.live) return;
    noteLiveChanges(state);
    const { renderer, camera } = target;
    renderer.setPixelRatio(state.live.pixelRatio);
    renderer.setSize(state.live.css.x, state.live.css.y, false);
    if (state.live.aspect !== null) {
      const perspective = camera as THREE.PerspectiveCamera;
      perspective.aspect = state.live.aspect;
      perspective.updateProjectionMatrix();
    }
  } finally {
    // Let go before the live view is drawn: through the Sun's glow, it is drawn by the composer the hold holds.
    state.letGo?.();
    state.letGo = null;
  }
  try {
    if (!renderThroughBloom()) target.renderer.render(target.scene, target.camera);
  } catch {
    // The live view will correct itself on the next animation frame.
  }
}
