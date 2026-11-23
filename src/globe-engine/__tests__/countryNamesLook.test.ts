/**
 * Whether the country names are drawn, render by render (decision K5, TS10).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { holdForCapture, releaseMotion, stillMotion } from '../captureClock';
import {
  CARD_NAMES_VISIBILITY,
  cardCountryNames,
  clipCountryNames,
  cardNameObstacles,
  countryNamesInLastCapture,
  countryNamesMissedCard,
  namesVisibilityNow,
  noteCountryNamesDrawn,
  resetCountryNamesLookForTest,
  setCardCountryNames,
  setCardNameObstacles,
  setClipCountryNames,
  setCountryNamesReady,
  setScreenCountryNames,
  untilCountryNames,
} from '../countryNamesLook';

afterEach(() => {
  releaseMotion();
  resetCountryNamesLookForTest();
});

const box = { x: 10, y: 10, width: 40, height: 12 };

describe('the names drawn', () => {
  it('follow the screen\'s slider between captures', () => {
    expect(namesVisibilityNow()).toBe(60);
    setScreenCountryNames(25);
    expect(namesVisibilityNow()).toBe(25);
  });

  it('are none in a capture whose shot does not ask, whatever the screen shows', () => {
    setScreenCountryNames(100);
    stillMotion(1_000);
    expect(namesVisibilityNow()).toBe(0);
  });

  it('are Natural Earth\'s own choice in a capture that asks, never the screen\'s slider, for a whole clip too', () => {
    setScreenCountryNames(5);
    setCardCountryNames(true);
    expect(cardCountryNames()).toBe(true);
    stillMotion(1_000);
    expect(namesVisibilityNow()).toBe(CARD_NAMES_VISIBILITY);
    releaseMotion();
    expect(namesVisibilityNow()).toBe(5);
    const release = holdForCapture();
    expect(namesVisibilityNow()).toBe(CARD_NAMES_VISIBILITY);
    release();
  });
});

describe('a clip that asks for names', () => {
  it('draws Natural Earth\'s choice in its frames and in the renders between them, and none once it ends', () => {
    setScreenCountryNames(5);
    setClipCountryNames(24);
    expect(clipCountryNames()?.fps).toBe(24);
    const release = holdForCapture();
    expect(namesVisibilityNow()).toBe(CARD_NAMES_VISIBILITY);
    release();
    setClipCountryNames(null);
    expect(clipCountryNames()).toBeNull();
    expect(cardCountryNames()).toBe(false);
    stillMotion(1_000);
    expect(namesVisibilityNow()).toBe(0);
  });

  it('is told from the clip before it, so its names start afresh', () => {
    setClipCountryNames(30);
    const first = clipCountryNames()!.clip;
    setClipCountryNames(null);
    setClipCountryNames(30);
    expect(clipCountryNames()!.clip).not.toBe(first);
  });

  it('names the clip in a refusal, not a card', () => {
    setClipCountryNames(30);
    stillMotion(1_000);
    releaseMotion();
    expect(countryNamesMissedCard('clip frame')).toMatch(/^The clip frame asked for country names/);
  });
});

describe('a card\'s names, checked once its frame is taken', () => {
  it('passes a default card that drew none', () => {
    stillMotion(1_000);
    noteCountryNamesDrawn({ drawn: false, codes: [], boxes: [] });
    releaseMotion();
    expect(countryNamesMissedCard()).toBeNull();
  });

  it('refuses names drawn on a card that did not ask for them', () => {
    stillMotion(1_000);
    noteCountryNamesDrawn({ drawn: true, codes: ['FRA'], boxes: [box] });
    releaseMotion();
    expect(countryNamesMissedCard()).toMatch(/did not ask/);
  });

  it('refuses a card that asked when the names never drew in its render, though an earlier card\'s did', () => {
    setCardCountryNames(true);
    stillMotion(1_000);
    noteCountryNamesDrawn({ drawn: true, codes: ['FRA'], boxes: [box] });
    releaseMotion();
    expect(countryNamesMissedCard()).toBeNull();
    stillMotion(2_000);
    releaseMotion();
    expect(countryNamesMissedCard()).toMatch(/were not drawn/);
  });

  it('passes a card that asked and drew, even with no name placed', () => {
    setCardCountryNames(true);
    stillMotion(1_000);
    noteCountryNamesDrawn({ drawn: true, codes: [], boxes: [] });
    releaseMotion();
    expect(countryNamesMissedCard()).toBeNull();
  });

  it('hands the names placed in the last capture to the card, and nothing between captures to a live render', () => {
    setCardCountryNames(true);
    stillMotion(1_000);
    noteCountryNamesDrawn({ drawn: true, codes: ['FRA', 'DEU'], boxes: [box, box] });
    releaseMotion();
    noteCountryNamesDrawn({ drawn: true, codes: ['ITA'], boxes: [box] });
    expect(countryNamesInLastCapture().codes).toEqual(['FRA', 'DEU']);
  });

  it('keeps a card\'s own marks out of the screen\'s placement', () => {
    setCardNameObstacles([box]);
    expect(cardNameObstacles()).toEqual([]);
    stillMotion(1_000);
    expect(cardNameObstacles()).toEqual([box]);
  });
});

describe('until the names can be drawn on a card', () => {
  it('goes on once the names are ready', async () => {
    setCountryNamesReady('ready');
    await expect(untilCountryNames(50, 5)).resolves.toBeUndefined();
  });

  it('refuses when their face fell back, since another page would draw them differently', async () => {
    setCountryNamesReady('fallback');
    await expect(untilCountryNames(50, 5)).rejects.toThrow(/did not load in time/);
  });

  it('refuses when the overlay is off, once it has waited for it', async () => {
    await expect(untilCountryNames(30, 5)).rejects.toThrow(/territories overlay is off/);
  });
});
