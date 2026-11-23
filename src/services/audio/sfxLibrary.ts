/**
 * Starcom's interface sounds, from the Starcom sound arsenal.
 *
 * The arsenal is original sound, synthesised from recipes and seeds by
 * Mecha Jono's tools/starcom_sfx.py (ul_agent, 2026-10-05) in the spirit of
 * RTS command interfaces: a tick when the pointer passes over a control, a
 * blip on a click, a sonar ping when the Globe points out a place. Nothing in
 * it is sampled from any game or recording, and no licence comes with it
 * (public/assets/sfx/README.md).
 *
 * Nothing plays until the visitor turns sound on, and then only the kinds they
 * keep, at their volume (soundSettings.ts; decision N12, "sound off by default").
 *
 * One action, one sound. A click that opens a panel asks for a click and for
 * an opening at once; only the opening plays. Every request made in one task
 * is held to the end of that task, and the one that says the most wins (rank).
 * A weaker sound just after a stronger one is dropped too, so a country picked
 * on the Globe is marked, and its panel opening a frame later does not play
 * over the mark.
 *
 * When a file cannot be fetched or decoded, the moment's fallback plays
 * instead -- the tones this app played before -- so a sound never throws. A
 * file that failed once is not fetched again in this page's life.
 */
import { audioContextManager } from './audioContextManager';
import { emitAudioTelemetry } from './audioTelemetry';
import { getSoundSettings, setSoundSettings, soundAllowed, type SoundCategory } from './soundSettings';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'sfxLibrary' });

export type SfxMoment =
  | 'hover' | 'click' | 'switch' | 'toggleOn' | 'toggleOff' | 'open' | 'close' | 'confirm' | 'deny'
  | 'spot' | 'designate'
  | 'success' | 'warning' | 'error' | 'message' | 'alert';

interface SfxEntry {
  /** The arsenal sound it plays, from /assets/sfx/. */
  file: string;
  category: SoundCategory;
  /**
   * The file's loudest 50 ms, K-weighted (ITU-R BS.1770, stages 1 and 2, the
   * channels summed), in LUFS: measured on the shipped file and recorded in
   * manifest.json. Peaks said nothing about loudness: Deny and Select peak
   * alike and measure 13 dB apart.
   */
  loudness: number;
  /** Where it lands, in the same measure: the pointer under the interface, the interface under the Globe, alerts on top. */
  level: number;
  /** Which sound wins when one action asks for several: the more it says, the higher. */
  rank: number;
  /** The least time between two plays of it, in ms: a held key or a flood of notices is not a machine gun. */
  gapMs: number;
}

const f = (name: string): string => `/assets/sfx/${name}.wav`;

/**
 * Each moment's sound, chosen from the arsenal for what the moment means.
 * Target Ping Double, Designate and the alerts are the operator's picks for the
 * videos (2026-10-05): a spot pointed out on the globe, a target marked, a
 * general alert followed by a communique from the ground.
 */
export const SFX: Readonly<Record<SfxMoment, SfxEntry>> = {
  // The pointer passing over a control.
  hover: { file: f('hover-tick'), category: 'hover', loudness: -21.5, level: -40, rank: 0, gapMs: 60 },
  // The interface: a control used.
  click: { file: f('select'), category: 'interface', loudness: -19.5, level: -36, rank: 1, gapMs: 40 },
  // Another application: a relay throws the console over.
  switch: { file: f('select-relay'), category: 'interface', loudness: -17.5, level: -35, rank: 2, gapMs: 40 },
  toggleOn: { file: f('toggle-on'), category: 'interface', loudness: -12.0, level: -36, rank: 2, gapMs: 40 },
  toggleOff: { file: f('toggle-off'), category: 'interface', loudness: -10.3, level: -36, rank: 2, gapMs: 40 },
  open: { file: f('panel-open'), category: 'interface', loudness: -12.6, level: -36, rank: 3, gapMs: 40 },
  close: { file: f('back'), category: 'interface', loudness: -14.3, level: -36, rank: 3, gapMs: 40 },
  confirm: { file: f('select-confirm'), category: 'interface', loudness: -18.2, level: -35, rank: 4, gapMs: 40 },
  deny: { file: f('deny'), category: 'interface', loudness: -6.2, level: -36, rank: 7, gapMs: 150 },
  // The Globe: a place pointed out, a territory marked.
  spot: { file: f('target-ping-double'), category: 'globe', loudness: -15.3, level: -32, rank: 6, gapMs: 600 },
  designate: { file: f('designate'), category: 'globe', loudness: -19.3, level: -33, rank: 5, gapMs: 150 },
  // Alerts and messages.
  success: { file: f('confirm-fifth'), category: 'notifications', loudness: -13.8, level: -32, rank: 8, gapMs: 1000 },
  message: { file: f('data-fsk'), category: 'notifications', loudness: -6.6, level: -29, rank: 8, gapMs: 1000 },
  warning: { file: f('blend-alert-ground'), category: 'notifications', loudness: -7.3, level: -28, rank: 9, gapMs: 1000 },
  error: { file: f('alert-low-triple'), category: 'notifications', loudness: -2.3, level: -28, rank: 9, gapMs: 1000 },
  alert: { file: f('alert-beeps'), category: 'notifications', loudness: -5.5, level: -28, rank: 10, gapMs: 1000 },
};

const MOMENTS = Object.keys(SFX) as SfxMoment[];

/** The file each moment plays. */
export const SFX_FILES = Object.fromEntries(MOMENTS.map((m) => [m, SFX[m].file])) as Record<SfxMoment, string>;

/** Linear gain per moment at full volume: its level less its loudness. */
export const SFX_GAIN = Object.fromEntries(
  MOMENTS.map((m) => [m, 10 ** ((SFX[m].level - SFX[m].loudness) / 20)]),
) as Record<SfxMoment, number>;

/** What a kind of sound sounds like, played when its switch is turned on. */
export const CATEGORY_SAMPLE: Readonly<Record<SoundCategory, SfxMoment>> = {
  interface: 'confirm',
  hover: 'hover',
  globe: 'spot',
  notifications: 'alert',
};

/** A weaker sound this soon after a stronger one belongs to the same action, and is dropped. */
const SHADOW_MS = 150;
/** A sound this late is no longer about its moment: a slow fetch plays nothing, and is ready next time. */
const STALE_MS = 1000;
/** How long a context held for a gesture may take to start before the sound is given up. */
const RESUME_WAIT_MS = 150;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const decoded = new Map<string, AudioBuffer>();
const pending = new Map<string, Promise<AudioBuffer | null>>();
const failed = new Set<string>();

const load = (url: string, context: AudioContext): Promise<AudioBuffer | null> => {
  const hit = decoded.get(url);
  if (hit) return Promise.resolve(hit);
  if (failed.has(url)) return Promise.resolve(null);
  const inFlight = pending.get(url);
  if (inFlight) return inFlight;

  const loading = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      decoded.set(url, buffer);
      return buffer;
    } catch (error) {
      failed.add(url);
      log.warn('Sound file unavailable; its fallback plays instead', { url, error });
      return null;
    } finally {
      pending.delete(url);
    }
  })();
  pending.set(url, loading);
  return loading;
};

/**
 * Whether the context runs, or starts at once when asked. Before the page's first
 * click or key press a browser holds a new context until one comes, and a sound
 * started then would play late, in a burst with every other one held.
 */
const running = (context: AudioContext): Promise<boolean> => {
  if (context.state === 'running') return Promise.resolve(true);
  if (context.state === 'closed') return Promise.resolve(false);
  return Promise.race([
    context.resume().then(() => context.state === 'running', () => false),
    new Promise<boolean>((resolve) => { setTimeout(() => resolve(false), RESUME_WAIT_MS); }),
  ]);
};

interface Cue {
  moment: SfxMoment;
  fallback?: () => void;
  at: number;
}

/**
 * Whether the page has had its first click or key press. Before it a browser
 * starts no audio, and a context made then only leaves a warning in the
 * console, so a sound asked for earlier (a hover on arrival) is let go.
 */
const pageActivated = (): boolean => {
  const activation = (globalThis.navigator as (Navigator & { userActivation?: { hasBeenActive: boolean } }) | undefined)?.userActivation;
  return activation === undefined || activation.hasBeenActive;
};

const start = ({ moment, fallback, at }: Cue): void => {
  if (!pageActivated()) return;
  const slot = audioContextManager.acquire();
  if (!slot) return;
  const { context, release } = slot;
  const key = `sfx:${moment}`;

  void load(SFX[moment].file, context).then(async (buffer) => {
    if (!buffer) {
      release();
      fallback?.();
      return;
    }
    if (now() - at > STALE_MS || !(await running(context))) {
      release();
      return;
    }
    try {
      const gainNode = context.createGain();
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      gainNode.connect(context.destination);
      gainNode.gain.setValueAtTime(SFX_GAIN[moment] * getSoundSettings().volume, context.currentTime);
      source.onended = () => {
        source.onended = null;
        try {
          source.disconnect();
          gainNode.disconnect();
        } catch {
          // Disconnect errors can occur on rapid teardown; safe to ignore.
        }
        release();
        emitAudioTelemetry({ type: 'source_stopped', toneKey: key, activeSources: audioContextManager.getActiveSources() });
      };
      emitAudioTelemetry({ type: 'source_started', toneKey: key, activeSources: audioContextManager.getActiveSources() });
      source.start();
    } catch (error) {
      log.warn('Sound playback failed; its fallback plays instead', { moment, error });
      release();
      fallback?.();
    }
  });
};

let cue: Cue | null = null;
let last: { moment: SfxMoment; at: number } | null = null;
const lastAt = new Map<SfxMoment, number>();

const flush = (): void => {
  const asked = cue;
  cue = null;
  if (!asked) return;
  const t = now();
  const { moment } = asked;
  const previous = lastAt.get(moment);
  if (previous !== undefined && t - previous < SFX[moment].gapMs) return;
  if (last && last.moment !== moment && SFX[moment].rank <= SFX[last.moment].rank && t - last.at < SHADOW_MS) return;
  lastAt.set(moment, t);
  last = { moment, at: t };
  start(asked);
};

/**
 * Ask for a moment's sound; `fallback` (an old tone) plays when its file cannot.
 * Silent while sound or this kind of sound is off. Never throws. Without Web
 * Audio, or past the concurrent-source cap, nothing plays, as with the tones.
 */
export const playSfx = (moment: SfxMoment, fallback?: () => void): void => {
  if (!soundAllowed(SFX[moment].category)) return;
  if (cue) {
    if (SFX[moment].rank > SFX[cue.moment].rank) cue = { moment, fallback, at: now() };
    return;
  }
  cue = { moment, fallback, at: now() };
  setTimeout(flush, 0);
};

/** Fetch and decode moments' files ahead of their first use (every moment's, by default). */
export const preloadSfx = (moments: readonly SfxMoment[] = MOMENTS): void => {
  if (!pageActivated()) return;
  const slot = audioContextManager.acquire();
  if (!slot) return;
  const { context, release } = slot;
  const urls = [...new Set(moments.map((m) => SFX[m].file))];
  void Promise.all(urls.map((url) => load(url, context))).finally(release);
};

let preloaded = false;

/**
 * Called inside a click or a key press while sound is on: the browser lets a
 * context start only then, and the files are fetched once, ahead of their use.
 */
export const primeSfx = (): void => {
  if (!pageActivated()) return;
  const slot = audioContextManager.acquire();
  slot?.release();
  if (!preloaded) {
    preloaded = true;
    preloadSfx();
  }
};

/** Every sound on or off, saying so: a chirp up once on, a chirp down before off. */
export const setSoundOn = (on: boolean): void => {
  if (on) {
    setSoundSettings({ enabled: true });
    primeSfx();
    playSfx('toggleOn');
  } else {
    playSfx('toggleOff');
    setSoundSettings({ enabled: false });
  }
};

/** One kind of sound on or off: on, it plays what it sounds like. */
export const setSoundCategoryOn = (category: SoundCategory, on: boolean): void => {
  if (on) {
    setSoundSettings({ categories: { [category]: true } });
    playSfx(CATEGORY_SAMPLE[category]);
  } else {
    playSfx('toggleOff');
    setSoundSettings({ categories: { [category]: false } });
  }
};

/** Forget every decoded file, failure and recent play (tests; a new page forgets anyway). */
export const clearSfx = (): void => {
  decoded.clear();
  pending.clear();
  failed.clear();
  cue = null;
  last = null;
  lastAt.clear();
  preloaded = false;
};
