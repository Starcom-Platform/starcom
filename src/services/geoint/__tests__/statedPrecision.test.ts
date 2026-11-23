/**
 * How precisely a publisher placed a report (decision D-F, section 18, item 3).
 *
 * `geoPrecisionM` existed on the marker and the popup read it, and the Nostr
 * intake never filled it — so a report placed only to its county was drawn,
 * listed and captioned as though it were exact. Mecha Jono publishes
 * `geo_precision: county` for addresses nothing resolves more finely.
 */
import { describe, it, expect } from 'vitest';
import { statedPrecisionM, geohashCellRadiusM, precisionForEvent, PRECISION_WORDS_M } from '../statedPrecision';

describe('statedPrecisionM', () => {
  it('reads a word for a kind of place', () => {
    expect(statedPrecisionM([['geo_precision', 'county']])).toBe(PRECISION_WORDS_M.county);
    expect(statedPrecisionM([['geo_precision', ' City ']])).toBe(PRECISION_WORDS_M.city);
  });

  it('reads a distance, in metres or kilometres', () => {
    expect(statedPrecisionM([['geo_precision', '500m']])).toBe(500);
    expect(statedPrecisionM([['geo_precision', '12 km']])).toBe(12_000);
    expect(statedPrecisionM([['geo_precision', '250']])).toBe(250);
  });

  it('does not guess at a word it does not know', () => {
    // "roughly" could mean anything; an absent precision is read as unknown,
    // which the popup already treats conservatively.
    expect(statedPrecisionM([['geo_precision', 'roughly']])).toBeNull();
    expect(statedPrecisionM([['geo_precision', '-5km']])).toBeNull();
    expect(statedPrecisionM([['geo_precision', '0']])).toBeNull();
  });

  it('says nothing when nothing was stated', () => {
    expect(statedPrecisionM([['t', 'starcom_intel']])).toBeNull();
  });

  it('orders the words from finest to coarsest', () => {
    const w = PRECISION_WORDS_M;
    expect(w.street).toBeLessThan(w.city);
    expect(w.city).toBeLessThan(w.county);
    expect(w.county).toBeLessThan(w.state);
    expect(w.state).toBeLessThan(w.country);
  });
});

describe('geohashCellRadiusM', () => {
  it('is half the diagonal of the cell the hash names', () => {
    // A 5-character cell is about 4.9 km by 4.9 km.
    expect(geohashCellRadiusM('dp3wj')).toBeGreaterThan(3_000);
    expect(geohashCellRadiusM('dp3wj')).toBeLessThan(4_000);
    // Each character narrows it.
    expect(geohashCellRadiusM('dp3wjzt')).toBeLessThan(geohashCellRadiusM('dp3wj')!);
  });

  it('refuses what is not a geohash', () => {
    expect(geohashCellRadiusM('')).toBeNull();
    expect(geohashCellRadiusM('dp3wa')).toBeNull(); // 'a' is not in the alphabet
  });
});

describe('precisionForEvent', () => {
  it('prefers what the publisher stated', () => {
    const tags = [['g', 'dp3wjzt'], ['geo_precision', 'county']];
    expect(precisionForEvent(tags, 'geohash')).toBe(PRECISION_WORDS_M.county);
  });

  it('takes the geohash cell when the position came from the geohash and nothing was stated', () => {
    expect(precisionForEvent([['g', 'dp3wj']], 'geohash')).toBe(geohashCellRadiusM('dp3wj'));
  });

  it('does not borrow a geohash cell for a position that came from elsewhere', () => {
    expect(precisionForEvent([['g', 'dp3wj']], 'content')).toBeNull();
  });
});
