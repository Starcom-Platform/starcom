// globeAppearance.ts — how the planet looks, and where its light comes from.
//
// Module-level store, the same shape as GlobeCameraTelemetry: the globe and the
// appearance popup have to read ONE instance, and a module store gets that without
// threading a provider through the HUD.
//
// ─── WHAT THIS MAKES A CHOICE ──────────────────────────────────────────────
//
// The globe already had three looks — a cyan hologram, a day/night blend, and a flat
// blue marble — picked FOR the viewer by which data mode they were in, with no control
// anywhere and no way to tell which they were seeing. And the light, until the commit
// before this one, came from a fixed point above the north pole in every one of them.
// Both are now choices, both are named on a share card, and 'auto' keeps the old
// per-mode mapping so nothing changes for anyone who does not choose.
import { settingsStorage } from '../../utils/settingsStorage';

/** The planet's own look. */
export type GlobeSkin = 'blueMarble' | 'dayNight' | 'cyberEarth' | 'terrain';

/**
 * Where the light comes from.
 *   sun       the real subsolar point for the moment on the card. The truth.
 *   headlamp  from the camera, so nothing is in shadow — for reading marks on the
 *             night side. The day/night line on such an image is not real.
 *   flat      even light, no terminator at all — for comparing marks, and for a
 *             card small enough that shading only muddies it.
 */
export type GlobeLightMode = 'sun' | 'headlamp' | 'flat';

export interface GlobeAppearance {
  /** 'auto' = the look this data mode has always had (see GlobeModeMapping). */
  skin: GlobeSkin | 'auto';
  lightMode: GlobeLightMode;
  /** How much of the day texture still shows on the night side, 0–1. */
  nightFill: number;
}

export const DEFAULT_GLOBE_APPEARANCE: GlobeAppearance = {
  skin: 'auto',
  lightMode: 'sun',
  nightFill: 0.15,
};

export const GLOBE_SKIN_LABELS: Record<GlobeSkin | 'auto', string> = {
  auto: 'Match the mode',
  blueMarble: 'Blue Marble',
  dayNight: 'Day / Night',
  cyberEarth: 'Cyber-Earth',
  terrain: 'Terrain',
};

export const GLOBE_LIGHT_MODE_LABELS: Record<GlobeLightMode, string> = {
  sun: 'Sun',
  headlamp: 'Headlamp',
  flat: 'Flat',
};

const STORAGE_KEY = 'globe-appearance';
const STORAGE_VERSION = 1;

function sanitize(value: Partial<GlobeAppearance> | null | undefined): GlobeAppearance {
  const skin = value?.skin;
  const lightMode = value?.lightMode;
  const nightFill = value?.nightFill;
  return {
    skin: skin && (skin === 'auto' || skin in GLOBE_SKIN_LABELS) ? skin : DEFAULT_GLOBE_APPEARANCE.skin,
    lightMode: lightMode && lightMode in GLOBE_LIGHT_MODE_LABELS ? lightMode : DEFAULT_GLOBE_APPEARANCE.lightMode,
    nightFill: typeof nightFill === 'number' && Number.isFinite(nightFill)
      ? Math.max(0, Math.min(1, nightFill))
      : DEFAULT_GLOBE_APPEARANCE.nightFill,
  };
}

let current: GlobeAppearance = sanitize(
  settingsStorage.loadSettings<GlobeAppearance>(STORAGE_KEY, DEFAULT_GLOBE_APPEARANCE, { version: STORAGE_VERSION }),
);
const listeners = new Set<() => void>();

export function getGlobeAppearance(): GlobeAppearance {
  return current;
}

/** Subscribe for useSyncExternalStore. Returns the unsubscribe. */
export function subscribeGlobeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Change the look. `persist: false` shows it for this visit without saving it,
 * as a link's look does (deeplink v2): opening someone's link must not change
 * the choice a person saved.
 */
export function setGlobeAppearance(patch: Partial<GlobeAppearance>, options: { persist?: boolean } = {}): void {
  const next = sanitize({ ...current, ...patch });
  if (next.skin === current.skin && next.lightMode === current.lightMode && next.nightFill === current.nightFill) return;
  current = next;
  if (options.persist !== false) settingsStorage.saveSettings(STORAGE_KEY, next, { version: STORAGE_VERSION });
  listeners.forEach((listener) => listener());
}

/*
 * What is actually on the globe right now, reported by the renderer — 'auto' is a
 * choice, not a look, and a card that says "mode default" tells a reader nothing about
 * the image they are holding. Derived state, so it is not persisted with the choice.
 */
let resolvedSkin: GlobeSkin = 'dayNight';

/** Called by the globe when it builds a material, with the skin it actually used. */
export function setResolvedGlobeSkin(skin: GlobeSkin): void {
  resolvedSkin = skin;
}

/** The skin on screen, for a card to name. */
export function getResolvedGlobeSkin(): GlobeSkin {
  return resolvedSkin;
}

/** Test-only: forget the choice and anything stored for it. */
export function resetGlobeAppearanceForTests(): void {
  current = { ...DEFAULT_GLOBE_APPEARANCE };
  resolvedSkin = 'dayNight';
  listeners.clear();
}
