/**
 * How much the globe draws, and who decides: the viewer, or a measurement.
 *
 * ─── WHAT THIS REPLACES ────────────────────────────────────────────────────
 *
 * The only device check was a guess from the user agent. Phones got no antialiasing
 * and a low-power GPU hint whatever they could actually handle, and every other device
 * got everything however badly it ran. Decided on 2026-09-12: the best-looking globe
 * wherever a device can carry it, stepping down only where it cannot — measured, not
 * guessed — with a setting to override the measurement either way.
 *
 * ─── THE STEPS ─────────────────────────────────────────────────────────────
 *
 * Ordered so the first things given up are the ones a viewer notices least per frame
 * saved: the glow round the Sun (a bloom over the whole frame, drawn only while the Sun
 * is, decision K6 SS2), then sharpness on high-density screens, then the drifting cloud
 * shell, then the atmosphere's rim. Nothing that carries information is ever stepped down — marks,
 * fills, borders and the 3D report models stay, because a globe that drops data to
 * keep its frame rate is lying about the data. So every satellite stays on every device; only the faint
 * rings of the constellations' planes go, with the glow (the owner, 2026-10-24).
 *
 * ─── HOW AUTO DECIDES ──────────────────────────────────────────────────────
 *
 * From the median time between rendered frames, over two-second windows
 * (nextGovernorState, below):
 *
 *   slow   under 40 frames a second for two windows in a row → one step down
 *   fast   over 55 a second for eight windows (16 s)          → one step up
 *
 * Two traps, each handled rather than hoped away:
 *
 *   A frame rate capped by something other than drawing. Battery savers and some
 *   displays hold a page to 30 frames a second however little it draws, which reads
 *   as "slow" forever and would ratchet the globe down to its plainest for nothing.
 *   So every step down is a trial: if frames did not get at least 15% faster, the
 *   detail comes back and auto holds until frames get genuinely worse. The same
 *   happens when a step simply costs little on a device: under software rendering,
 *   dropping the atmosphere made no difference, so the atmosphere stayed.
 *
 *   A step that changes nothing on this screen. On a 1× display, "softer edges" is
 *   the same picture as full detail, and trialling it would find it "did not help"
 *   and wrongly conclude the frame rate is capped. Steps that change nothing for the
 *   device's pixel ratio are skipped, and so is dropping the glow while no Sun is
 *   drawn; coming back up, auto returns to the most detail that draws the same, so
 *   the glow comes back with full detail.
 *
 * And it does not oscillate: a step that proves too slow within 20 s of coming back is
 * not tried again this session.
 */
import { settingsStorage } from '../../utils/settingsStorage';

export type GlobeQualitySetting = 'auto' | 'high' | 'low';

export const GLOBE_QUALITY_LABELS: Record<GlobeQualitySetting, string> = {
  auto: 'Auto',
  high: 'High',
  low: 'Low',
};

export interface QualityStep {
  /** What is given up, in a viewer's words — for the popup and a share card. */
  name: string;
  /** Upper bound on the renderer's pixel ratio. 2 is the globe library's own clamp. */
  maxPixelRatio: number;
  clouds: boolean;
  atmosphere: boolean;
  /** The glow round the Sun: a bloom over the whole frame while the Sun is drawn (decision K6, SS2). */
  bloom: boolean;
  /**
   * The Earth's 8K maps, fetched once the camera comes in close (decision K7). Not a
   * trade the governor makes frame by frame: a device stepped below these steps does not
   * fetch them, and once fetched they stay.
   */
  sharpMaps: boolean;
  /**
   * The hatching of War & Conflict's outer countries, on a war's list where it is not
   * fought (theatre-lens.md, TL5): given up first, with the glow, as the owner decided.
   * Only the screen gives it up: every capture draws it, a still costing no frame time.
   */
  hatching: boolean;
  /**
   * A Zones partition's Sector lines drawn from a simplified copy, about 5 km off at most, with the softer edges
   * (decision D-ZR; the owner, 2026-10-18: where it lags, step detail down). Zone and Terra edges stay whole.
   */
  simpleSectorLines: boolean;
  /**
   * The faint rings of Starlink's and GPS's orbital planes (D-GV GV2, step 5): read from the satellites, not data of
   * their own, so given up with the glow (the owner, 2026-10-24). The satellites themselves are never stepped down.
   */
  planeRings: boolean;
}

export const QUALITY_STEPS: readonly QualityStep[] = [
  { name: 'full detail', maxPixelRatio: 2, clouds: true, atmosphere: true, bloom: true, sharpMaps: true, hatching: true, simpleSectorLines: false, planeRings: true },
  { name: 'no glow, hatching or orbit rings', maxPixelRatio: 2, clouds: true, atmosphere: true, bloom: false, sharpMaps: true, hatching: false, simpleSectorLines: false, planeRings: false },
  { name: 'softer edges', maxPixelRatio: 1.5, clouds: true, atmosphere: true, bloom: false, sharpMaps: false, hatching: false, simpleSectorLines: true, planeRings: false },
  { name: 'no clouds', maxPixelRatio: 1, clouds: false, atmosphere: true, bloom: false, sharpMaps: false, hatching: false, simpleSectorLines: true, planeRings: false },
  { name: 'no clouds or atmosphere', maxPixelRatio: 1, clouds: false, atmosphere: false, bloom: false, sharpMaps: false, hatching: false, simpleSectorLines: true, planeRings: false },
];

export const LOWEST_STEP = QUALITY_STEPS.length - 1;

export const GOVERNOR = {
  slowMs: 1000 / 40,
  fastMs: 1000 / 55,
  /**
   * Fewer gaps than this are not a median. Pauses never get here: the hook drops them.
   * This was 20, which silently discarded every window from a device drawing under 10
   * frames a second — the devices auto exists for.
   */
  minFrames: 2,
  slowWindowsToStep: 2,
  fastWindowsToStep: 8,
  trialWindows: 2,
  /** A step down "helped" if frames got at least this much faster. */
  helpedRatio: 0.85,
  /** Coming back to a step and failing within this long retires that step. */
  relapseMs: 20_000,
  /** A capped device resumes stepping only if frames get this much worse than the cap. */
  cappedWorseRatio: 1.5,
} as const;

export interface FrameWindow {
  medianMs: number;
  frames: number;
  /** When the window closed, in ms — any monotonic clock. */
  at: number;
}

export interface GovernorState {
  step: number;
  /** The most detail auto may return to; raised when a step relapses. */
  floor: number;
  slow: number;
  fast: number;
  /** A step down being tested: did drawing less make frames faster? */
  trial: { from: number; beforeMs: number; windows: number } | null;
  /** The last step down did not help at about this frame time; auto holds until frames get much worse, or fast. */
  cappedAtMs: number | null;
  lastUpAt: number | null;
  /** Why the step is what it is, in a viewer's words. Null until auto has acted. */
  reason: string | null;
}

export const INITIAL_GOVERNOR_STATE: GovernorState = {
  step: 0, floor: 0, slow: 0, fast: 0, trial: null, cappedAtMs: null, lastUpAt: null, reason: null,
};

/**
 * What a step draws on this screen; the glow counts only while the Sun is drawn, the
 * hatching only while War & Conflict hatches, the Sector lines only while a Zones
 * partition is drawn, and the plane rings only while Satellites draws them.
 */
const drawnAs = (step: number, devicePixelRatio: number, bloomInUse: boolean, hatchingInUse: boolean, zonesInUse = false, planesInUse = false): string => {
  const s = QUALITY_STEPS[step];
  return `${Math.min(devicePixelRatio, s.maxPixelRatio)}|${s.clouds}|${s.atmosphere}|${s.bloom && bloomInUse}|${s.hatching && hatchingInUse}|${s.simpleSectorLines && zonesInUse}|${s.planeRings && planesInUse}`;
};

/** The next step in `direction` that draws something different on this screen. */
function nextDifferentStep(step: number, direction: 1 | -1, devicePixelRatio: number, bloomInUse: boolean, hatchingInUse: boolean, zonesInUse = false, planesInUse = false): number | null {
  for (let s = step + direction; s >= 0 && s <= LOWEST_STEP; s += direction) {
    if (drawnAs(s, devicePixelRatio, bloomInUse, hatchingInUse, zonesInUse, planesInUse) !== drawnAs(step, devicePixelRatio, bloomInUse, hatchingInUse, zonesInUse, planesInUse)) return s;
  }
  return null;
}

/**
 * The next window's state. `bloomInUse`: whether the Sun is drawn, so that dropping the
 * glow round it would change the picture; `hatchingInUse`, whether War & Conflict hatches;
 * `zonesInUse`, whether a Zones partition is drawn, whose Sector lines a step simplifies;
 * `planesInUse`, whether Satellites draws its plane rings.
 */
export function nextGovernorState(
  state: GovernorState, w: FrameWindow, devicePixelRatio = 1, bloomInUse = false, hatchingInUse = false, zonesInUse = false, planesInUse = false,
): GovernorState {
  if (!(w.frames >= GOVERNOR.minFrames) || !Number.isFinite(w.medianMs)) return state;
  const ms = Math.round(w.medianMs);

  if (state.trial) {
    const windows = state.trial.windows + 1;
    if (windows < GOVERNOR.trialWindows) return { ...state, trial: { ...state.trial, windows } };
    if (w.medianMs <= state.trial.beforeMs * GOVERNOR.helpedRatio) {
      return { ...state, trial: null, slow: 0, fast: 0 };
    }
    const before = Math.round(state.trial.beforeMs);
    const tried = QUALITY_STEPS[state.step].name;
    return {
      ...state,
      step: state.trial.from,
      trial: null,
      slow: 0,
      fast: 0,
      cappedAtMs: state.trial.beforeMs,
      reason: `dropping to ${tried} did not make frames faster (still near ${before} ms), so it went back`,
    };
  }

  let current = state;
  if (current.cappedAtMs !== null) {
    const worse = w.medianMs > current.cappedAtMs * GOVERNOR.cappedWorseRatio;
    const lifted = w.medianMs < GOVERNOR.fastMs;
    if (!worse && !lifted) return current;
    current = { ...current, cappedAtMs: null };
  }

  if (w.medianMs > GOVERNOR.slowMs) {
    const slow = current.slow + 1;
    if (slow < GOVERNOR.slowWindowsToStep) return { ...current, slow, fast: 0 };
    const down = nextDifferentStep(current.step, 1, devicePixelRatio, bloomInUse, hatchingInUse, zonesInUse, planesInUse);
    if (down === null) {
      return { ...current, slow: 0, fast: 0, reason: `frames took ${ms} ms each even at the lowest step` };
    }
    const relapsed = current.lastUpAt !== null && w.at - current.lastUpAt < GOVERNOR.relapseMs;
    return {
      ...current,
      step: down,
      floor: relapsed ? Math.max(current.floor, down) : current.floor,
      slow: 0,
      fast: 0,
      trial: { from: current.step, beforeMs: w.medianMs, windows: 0 },
      reason: `frames took ${ms} ms each, fewer than 40 a second`,
    };
  }

  if (w.medianMs < GOVERNOR.fastMs) {
    const fast = current.fast + 1;
    if (fast < GOVERNOR.fastWindowsToStep) return { ...current, fast, slow: 0 };
    let up = nextDifferentStep(current.step, -1, devicePixelRatio, bloomInUse, hatchingInUse, zonesInUse, planesInUse);
    if (up === null || up < current.floor) return { ...current, fast: 0, slow: 0 };
    // To the most detail that draws the same, so the glow comes back with full detail.
    while (up - 1 >= current.floor && drawnAs(up - 1, devicePixelRatio, bloomInUse, hatchingInUse, zonesInUse, planesInUse) === drawnAs(up, devicePixelRatio, bloomInUse, hatchingInUse, zonesInUse, planesInUse)) {
      up -= 1;
    }
    return { ...current, step: up, fast: 0, slow: 0, lastUpAt: w.at, reason: `frames took ${ms} ms each, so detail came back` };
  }

  return current.slow === 0 && current.fast === 0 ? current : { ...current, slow: 0, fast: 0 };
}

// ─── The store: the viewer's setting, persisted; auto's measurement, not ─────────

export interface GlobeQualityState {
  setting: GlobeQualitySetting;
  /** The step being drawn now, whoever chose it. */
  step: number;
  /** Why auto chose its step. Null when the setting is pinned or auto has not acted. */
  reason: string | null;
  /**
   * Whether the step can be relied on yet.
   *
   * Auto starts at full detail and only a measurement can say a device cannot
   * carry it, so for the first few seconds "clouds on" means "not measured
   * yet", not "this device draws clouds". The cloud layer waits for this before
   * fetching clouds.png, the largest single file of a first visit (2.19 MB,
   * measured server-side on 2026-09-25), which a slow device — and every
   * headless agent — used to download and then hide. True at once for a
   * pinned setting, which has nothing to measure.
   */
  settled: boolean;
}

/**
 * Measured windows before auto counts as settled: one past the earliest step
 * down, so a clearly slow device has already stepped down by then.
 */
export const SETTLE_WINDOWS = GOVERNOR.slowWindowsToStep + 1;

const STORAGE_KEY = 'globe-quality';
const STORAGE_VERSION = 1;

const sanitizeSetting = (value: unknown): GlobeQualitySetting =>
  value === 'high' || value === 'low' || value === 'auto' ? value : 'auto';

let setting: GlobeQualitySetting = sanitizeSetting(
  settingsStorage.loadSettings<{ setting: GlobeQualitySetting }>(STORAGE_KEY, { setting: 'auto' }, { version: STORAGE_VERSION })?.setting,
);
let governor: GovernorState = INITIAL_GOVERNOR_STATE;
/** Whether the Sun is drawn now, so its glow costs something (setGlobeBloomInUse). */
let bloomInUse = false;
/** Whether War & Conflict hatches now, so giving the hatching up changes the picture (setGlobeHatchingInUse). */
let hatchingInUse = false;
/** Whether a Zones partition is drawn now, so its simpler Sector lines change the picture (setGlobeZonesInUse). */
let zonesInUse = false;
/** Whether Satellites draws its plane rings now, so giving them up changes the picture (setGlobePlanesInUse). */
let planesInUse = false;
/** Windows auto has actually measured — thin ones (too few frames) excluded. */
let measuredWindows = 0;
/** Still cards being made, each held at full detail (holdFullDetail). */
let fullDetailHolds = 0;
let snapshot: GlobeQualityState = derive();
const listeners = new Set<() => void>();

function derive(): GlobeQualityState {
  if (fullDetailHolds > 0) return { setting, step: 0, reason: null, settled: true };
  if (setting === 'high') return { setting, step: 0, reason: null, settled: true };
  if (setting === 'low') return { setting, step: LOWEST_STEP, reason: null, settled: true };
  return { setting, step: governor.step, reason: governor.reason, settled: measuredWindows >= SETTLE_WINDOWS };
}

function publish(): void {
  const next = derive();
  if (next.setting === snapshot.setting && next.step === snapshot.step
    && next.reason === snapshot.reason && next.settled === snapshot.settled) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Stable between changes, for useSyncExternalStore. */
export function getGlobeQuality(): GlobeQualityState {
  return snapshot;
}

/**
 * Draw at full detail until released, whatever auto measured or the viewer pinned: for a still card (the owner,
 * 2026-10-24, "Cards full detail, clips governed"). A card on a slow renderer had dropped the atmosphere, the clouds
 * and the hatching, and said so; Mecha Jono's cards are the first thing people see. A clip keeps the step measured,
 * so its frame rate holds. Release once; a second call does nothing.
 */
export function holdFullDetail(): () => void {
  fullDetailHolds += 1;
  publish();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    fullDetailHolds -= 1;
    publish();
  };
}

/** Whether a card is being drawn at full detail now. */
export function fullDetailHeld(): boolean {
  return fullDetailHolds > 0;
}

export function subscribeGlobeQuality(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setGlobeQualitySetting(next: GlobeQualitySetting): void {
  const clean = sanitizeSetting(next);
  if (clean === setting) return;
  setting = clean;
  settingsStorage.saveSettings(STORAGE_KEY, { setting }, { version: STORAGE_VERSION });
  publish();
}

/** A closed measurement window from the globe. Ignored unless the setting is auto. */
export function reportFrameWindow(w: FrameWindow, devicePixelRatio: number): void {
  if (setting !== 'auto') return;
  if (w.frames >= GOVERNOR.minFrames && Number.isFinite(w.medianMs)) measuredWindows += 1;
  governor = nextGovernorState(governor, w, devicePixelRatio, bloomInUse, hatchingInUse, zonesInUse, planesInUse);
  publish();
}

/** Whether the Sun is drawn, so that the glow round it is a step that changes the picture. */
export function setGlobeBloomInUse(inUse: boolean): void {
  bloomInUse = inUse;
}

/** Whether War & Conflict hatches outer countries, so that the hatching is a step that changes the picture. */
export function setGlobeHatchingInUse(inUse: boolean): void {
  hatchingInUse = inUse;
}

/** Whether a Zones partition is drawn, so that its simpler Sector lines are a step that changes the picture. */
export function setGlobeZonesInUse(inUse: boolean): void {
  zonesInUse = inUse;
}

/** Whether Satellites draws its plane rings, so that giving them up is a step that changes the picture. */
export function setGlobePlanesInUse(inUse: boolean): void {
  planesInUse = inUse;
}

export function qualityStepOf(state: GlobeQualityState): QualityStep {
  return QUALITY_STEPS[Math.max(0, Math.min(LOWEST_STEP, state.step))];
}

/** The popup's one line about quality, from the state alone. */
export function describeGlobeQuality(state: GlobeQualityState): string {
  const step = qualityStepOf(state);
  if (state.setting === 'high') return 'Full detail always, even if frames slow down.';
  if (state.setting === 'low') return `Always ${step.name}. Marks, fills and borders are never reduced.`;
  if (state.step === 0) {
    return state.reason ? `Full detail: ${state.reason}.` : 'Full detail. Steps down only if this device cannot keep up.';
  }
  return `Drawing ${step.name}: ${state.reason ?? 'this device could not keep up'}.`;
}

/** Test-only: back to a fresh session with nothing stored. */
export function resetGlobeQualityForTests(): void {
  fullDetailHolds = 0;
  setting = 'auto';
  governor = INITIAL_GOVERNOR_STATE;
  bloomInUse = false;
  hatchingInUse = false;
  zonesInUse = false;
  planesInUse = false;
  measuredWindows = 0;
  snapshot = derive();
  listeners.clear();
}
