/**
 * The viewer's choice of look and light. Both were decided for them before this, with
 * no control and no label on the image.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getGlobeAppearance, setGlobeAppearance, subscribeGlobeAppearance, resetGlobeAppearanceForTests,
  DEFAULT_GLOBE_APPEARANCE, GLOBE_SKIN_LABELS, GLOBE_LIGHT_MODE_LABELS,
  setResolvedGlobeSkin, getResolvedGlobeSkin,
} from '../globeAppearance';

beforeEach(() => resetGlobeAppearanceForTests());

describe('the globe appearance store', () => {
  it('starts on the look each data mode has always had, lit by the real Sun', () => {
    expect(getGlobeAppearance()).toEqual({ skin: 'auto', lightMode: 'sun', nightFill: 0.15 });
  });

  it('tells subscribers when something changes, and not when it does not', () => {
    const listener = vi.fn();
    subscribeGlobeAppearance(listener);
    setGlobeAppearance({ skin: 'cyberEarth' });
    expect(listener).toHaveBeenCalledTimes(1);
    setGlobeAppearance({ skin: 'cyberEarth' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getGlobeAppearance().skin).toBe('cyberEarth');
  });

  it('stops subscribing when asked', () => {
    const listener = vi.fn();
    subscribeGlobeAppearance(listener)();
    setGlobeAppearance({ lightMode: 'flat' });
    expect(listener).not.toHaveBeenCalled();
  });

  // A link's look (deeplink v2) is for the visit: opening someone's link must not change your saved choice.
  it('shows a look for this visit without saving it, when asked not to persist', () => {
    localStorage.removeItem('starcom-globe-appearance');
    setGlobeAppearance({ lightMode: 'headlamp' }, { persist: false });
    expect(getGlobeAppearance().lightMode).toBe('headlamp');
    expect(localStorage.getItem('starcom-globe-appearance')).toBeNull();
    setGlobeAppearance({ lightMode: 'flat' });
    expect(JSON.parse(localStorage.getItem('starcom-globe-appearance')!).data.lightMode).toBe('flat');
  });

  it('refuses a look or a light it does not have, rather than drawing nothing', () => {
    setGlobeAppearance({ skin: 'not-a-skin' as never, lightMode: 'strobe' as never });
    expect(getGlobeAppearance().skin).toBe(DEFAULT_GLOBE_APPEARANCE.skin);
    expect(getGlobeAppearance().lightMode).toBe(DEFAULT_GLOBE_APPEARANCE.lightMode);
  });

  it('keeps the night fill inside 0 and 1, whatever it is handed', () => {
    setGlobeAppearance({ nightFill: 5 });
    expect(getGlobeAppearance().nightFill).toBe(1);
    setGlobeAppearance({ nightFill: -2 });
    expect(getGlobeAppearance().nightFill).toBe(0);
    setGlobeAppearance({ nightFill: Number.NaN });
    expect(getGlobeAppearance().nightFill).toBe(DEFAULT_GLOBE_APPEARANCE.nightFill);
  });

  it('reports the look actually drawn, so a card names it instead of saying \'auto\'', () => {
    // 'auto' is a choice, not a look: the renderer says which one it built.
    expect(getResolvedGlobeSkin()).toBe('dayNight');
    setResolvedGlobeSkin('cyberEarth');
    expect(getResolvedGlobeSkin()).toBe('cyberEarth');
    expect(GLOBE_SKIN_LABELS[getResolvedGlobeSkin()]).toBe('Cyber-Earth');
    // Choosing does not itself change what was drawn — the renderer reports that.
    setGlobeAppearance({ skin: 'terrain' });
    expect(getResolvedGlobeSkin()).toBe('cyberEarth');
  });

  it('has a name for every look and every light, so a card and a menu can say which', () => {
    for (const skin of ['auto', 'blueMarble', 'dayNight', 'cyberEarth', 'terrain'] as const) {
      expect(GLOBE_SKIN_LABELS[skin]).toBeTruthy();
    }
    for (const mode of ['sun', 'headlamp', 'flat'] as const) {
      expect(GLOBE_LIGHT_MODE_LABELS[mode]).toBeTruthy();
    }
  });
});
