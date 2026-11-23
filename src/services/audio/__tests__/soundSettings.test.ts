/**
 * The visitor's sound settings: off until turned on (decision N12), kept in this
 * browser, and read back field by field so a bad stored value cannot throw or
 * play at a volume nobody chose.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_SOUND_SETTINGS, getSoundSettings, parseSoundSettings, resetSoundSettingsForTests,
  setSoundSettings, soundAllowed, subscribeSoundSettings,
} from '../soundSettings';

describe('sound settings', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSoundSettingsForTests();
  });

  it('starts with sound off, and every kind of sound kept for when it is on', () => {
    expect(getSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(DEFAULT_SOUND_SETTINGS.enabled).toBe(false);
    expect(Object.values(DEFAULT_SOUND_SETTINGS.categories).every(Boolean)).toBe(true);
    expect(soundAllowed('interface')).toBe(false);
  });

  it('keeps what is set in this browser, and reads it back on the next page', () => {
    setSoundSettings({ enabled: true, volume: 0.4, categories: { hover: false } });
    resetSoundSettingsForTests();
    expect(getSoundSettings()).toEqual({
      enabled: true,
      volume: 0.4,
      categories: { interface: true, hover: false, globe: true, notifications: true },
    });
  });

  it('lets a kind of sound play only while sound is on, the volume is above zero and the kind is kept', () => {
    setSoundSettings({ enabled: true });
    expect(soundAllowed('globe')).toBe(true);
    setSoundSettings({ categories: { globe: false } });
    expect(soundAllowed('globe')).toBe(false);
    expect(soundAllowed('interface')).toBe(true);
    setSoundSettings({ volume: 0 });
    expect(soundAllowed('interface')).toBe(false);
  });

  it('holds the volume between 0 and 1', () => {
    setSoundSettings({ volume: 7 });
    expect(getSoundSettings().volume).toBe(1);
    setSoundSettings({ volume: -2 });
    expect(getSoundSettings().volume).toBe(0);
    setSoundSettings({ volume: Number.NaN });
    expect(getSoundSettings().volume).toBe(DEFAULT_SOUND_SETTINGS.volume);
  });

  it('reads a damaged or foreign value as the defaults, field by field', () => {
    expect(parseSoundSettings('not json')).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(parseSoundSettings('null')).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(parseSoundSettings(JSON.stringify({ enabled: 'yes', volume: '0.2', categories: { hover: 0, globe: false } }))).toEqual({
      ...DEFAULT_SOUND_SETTINGS,
      categories: { ...DEFAULT_SOUND_SETTINGS.categories, globe: false },
    });
  });

  it('tells its listeners of every change, and of a change made in another tab', () => {
    const heard = vi.fn();
    const stop = subscribeSoundSettings(heard);
    setSoundSettings({ enabled: true });
    expect(heard).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new StorageEvent('storage', { key: 'starcom.sound', newValue: JSON.stringify({ enabled: false, volume: 0.3 }) }));
    expect(heard).toHaveBeenCalledTimes(2);
    expect(getSoundSettings()).toMatchObject({ enabled: false, volume: 0.3 });

    window.dispatchEvent(new StorageEvent('storage', { key: 'something.else', newValue: '{}' }));
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    setSoundSettings({ enabled: true });
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('keeps working for the page when storage refuses to write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    try {
      setSoundSettings({ enabled: true });
      expect(getSoundSettings().enabled).toBe(true);
    } finally {
      setItem.mockRestore();
    }
  });
});
