/**
 * Whether Starcom makes any sound, how loud, and which kinds.
 *
 * Off until the visitor turns it on: "sound off by default" is decision N12
 * (intern-readiness-decisions.md, EVA's behaviour with restrained chrome). The
 * header's sound button and Settings > Sound both write here, and every sound
 * the app plays asks here first (sfxLibrary.ts).
 *
 * Kept in this browser, under one key, and read back defensively: a value
 * written by an older build, or by hand, falls back to the defaults field by
 * field rather than throwing or playing at an unexpected volume.
 */
import { useSyncExternalStore } from 'react';

/** The kinds of sound a visitor can keep or silence, each on its own switch. */
export type SoundCategory = 'interface' | 'hover' | 'globe' | 'notifications';

export const SOUND_CATEGORIES: readonly SoundCategory[] = ['interface', 'hover', 'globe', 'notifications'];

export interface SoundSettings {
  /** Every sound, at once: the header's button. */
  enabled: boolean;
  /** 0 to 1, over each sound's own level. */
  volume: number;
  categories: Record<SoundCategory, boolean>;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: false,
  volume: 0.8,
  categories: { interface: true, hover: true, globe: true, notifications: true },
};

const STORAGE_KEY = 'starcom.sound';

const clampVolume = (value: unknown): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_SOUND_SETTINGS.volume;
  return Math.min(1, Math.max(0, n));
};

/** A stored value made safe: anything missing or of the wrong type takes its default. */
export const parseSoundSettings = (raw: string | null): SoundSettings => {
  if (!raw) return DEFAULT_SOUND_SETTINGS;
  let stored: Partial<SoundSettings> & { categories?: Partial<Record<SoundCategory, unknown>> };
  try {
    stored = JSON.parse(raw);
  } catch {
    return DEFAULT_SOUND_SETTINGS;
  }
  if (!stored || typeof stored !== 'object') return DEFAULT_SOUND_SETTINGS;
  const categories = { ...DEFAULT_SOUND_SETTINGS.categories };
  for (const category of SOUND_CATEGORIES) {
    const value = stored.categories?.[category];
    if (typeof value === 'boolean') categories[category] = value;
  }
  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_SOUND_SETTINGS.enabled,
    volume: clampVolume(stored.volume),
    categories,
  };
};

const read = (): SoundSettings => {
  try {
    return parseSoundSettings(globalThis.localStorage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_SOUND_SETTINGS;
  }
};

let current: SoundSettings | null = null;
const listeners = new Set<() => void>();

const notify = (): void => {
  listeners.forEach((listener) => listener());
};

/** Another tab changed the settings: this one follows. */
const onStorage = (event: StorageEvent): void => {
  if (event.key !== STORAGE_KEY) return;
  current = parseSoundSettings(event.newValue);
  notify();
};

export const getSoundSettings = (): SoundSettings => {
  current ??= read();
  return current;
};

export interface SoundSettingsPatch {
  enabled?: boolean;
  volume?: number;
  categories?: Partial<Record<SoundCategory, boolean>>;
}

export const setSoundSettings = (patch: SoundSettingsPatch): void => {
  const was = getSoundSettings();
  current = {
    enabled: patch.enabled ?? was.enabled,
    volume: patch.volume === undefined ? was.volume : clampVolume(patch.volume),
    categories: { ...was.categories, ...patch.categories },
  };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage full or blocked: the setting holds for this page, and is asked again next visit.
  }
  notify();
};

export const subscribeSoundSettings = (listener: () => void): (() => void) => {
  if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
};

/** Whether a sound of this kind may play now. */
export const soundAllowed = (category: SoundCategory): boolean => {
  const settings = getSoundSettings();
  return settings.enabled && settings.volume > 0 && settings.categories[category];
};

export const useSoundSettings = (): SoundSettings =>
  useSyncExternalStore(subscribeSoundSettings, getSoundSettings, () => DEFAULT_SOUND_SETTINGS);

/** Forget the settings held in memory, so the next read is from storage (tests). */
export const resetSoundSettingsForTests = (): void => {
  current = null;
};
