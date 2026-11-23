/**
 * The graph lanes (decision D-PW, PW45, PW68): the Resonance Score as Cosmic Cypher's own code gives it, on the
 * same longitudes; the Earth-wide tide as a ratio to its mean; each element's and modality's share; and a wide
 * view's columns sampled for their mean and range.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { skyColumns, LANE_BODIES } from '../skyColumns';
import { graphColumns, leanOf, resonanceOf, samplesFor, tideOf, TIDE_MEAN } from '../graphColumns';

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

// Cosmic Cypher's computeAspectHarmony and computeElementalCoherence (cosmiccypher-frontend, 25 Sep 2026), run on
// these tropical longitudes of the ten and the mean north node.
const COSMIC_CYPHER = [
  { iso: '1994-03-12T06:00:00Z', headline: 65.7948, harmony: 0.2756, coherence: 0.4099, resonant: 25, dissonant: 7 },
  { iso: '2003-08-27T09:51:00Z', headline: 50.5355, harmony: -0.0867, coherence: 0.238, resonant: 11, dissonant: 14 },
  { iso: '2012-12-21T11:11:00Z', headline: 51.891, harmony: 0.0115, coherence: 0.0992, resonant: 9, dissonant: 12 },
  { iso: '2020-12-21T18:20:00Z', headline: 53.2505, harmony: 0.0567, coherence: 0.0843, resonant: 16, dissonant: 14 },
  { iso: '2026-10-27T12:00:00Z', headline: 49.9946, harmony: -0.0972, coherence: 0.2264, resonant: 15, dissonant: 16 },
];

describe('the Resonance Score', () => {
  it('is Cosmic Cypher\'s on the same sky, its counts in orb too', () => {
    for (const ref of COSMIC_CYPHER) {
      const view = { startMs: Date.parse(ref.iso) - 30_000, spanMs: 60_000 };
      const sky = skyColumns(view, 1, LANE_BODIES.filter((b) => b !== 'ASC' && b !== 'MC' && b !== 'DSC' && b !== 'IC'), 'tropical');
      const g = graphColumns(view, sky, 'tropical');
      expect(g.samples).toBe(1);
      expect(g.resonance.mean[0]).toBeCloseTo(ref.headline, 2);
      expect(g.harmony[0]).toBeCloseTo(ref.harmony, 3);
      expect(g.coherence[0]).toBeCloseTo(ref.coherence, 3);
      expect([g.resonantCount[0], g.dissonantCount[0]]).toEqual([ref.resonant, ref.dissonant]);
    }
  });

  it('reads aspects alike in any frame, its elements by the frame\'s signs', () => {
    const lons = [10, 70, 100, 130, 190, 250, 280, 310, 340, 5, 200];
    // Fifteen degrees on carries one body from Libra into Scorpio, Air into Water; the rest keep their signs.
    const shifted = lons.map((l) => (l + 15) % 360);
    expect(resonanceOf(shifted).aspectHarmony).toBeCloseTo(resonanceOf(lons).aspectHarmony, 12);
    expect(resonanceOf(shifted).elementalCoherence).not.toBeCloseTo(resonanceOf(lons).elementalCoherence, 3);
  });

  it('leans as Cosmic Cypher words it: resonant above 60, dissonant below 40', () => {
    expect([leanOf(61), leanOf(60), leanOf(50), leanOf(40), leanOf(39)]).toEqual(['resonant', 'neutral', 'neutral', 'neutral', 'dissonant']);
  });
});

describe('tidal stress', () => {
  it('stands near its mean over a century and swings from neaps to perigean springs', () => {
    let sum = 0; let n = 0; let low = Infinity; let high = 0;
    for (let ms = Date.UTC(1950, 0, 1); ms < Date.UTC(2050, 0, 1); ms += 3 * DAY + 7 * 3_600_000) {
      const at = new Date(ms);
      const t = tideOf(Astronomy.GeoMoon(at), Astronomy.GeoVector(Astronomy.Body.Sun, at, false));
      sum += t; n++; low = Math.min(low, t); high = Math.max(high, t);
    }
    expect(sum / n).toBeCloseTo(1, 2);
    expect(low).toBeLessThan(0.75);
    expect(high).toBeGreaterThan(1.3);
    expect(TIDE_MEAN).toBeGreaterThan(1e8);
  });

  it('is higher at the new moon than at the quarter that follows', () => {
    const newMoon = Astronomy.SearchMoonPhase(0, new Date(Date.UTC(2026, 9, 1)), 40)!.date;
    const quarter = Astronomy.SearchMoonPhase(90, newMoon, 40)!.date;
    const at = (d: Date) => tideOf(Astronomy.GeoMoon(d), Astronomy.GeoVector(Astronomy.Body.Sun, d, false));
    expect(at(newMoon)).toBeGreaterThan(at(quarter) * 1.25);
  });
});

describe('the graphs\' columns', () => {
  it('takes one sample a column in a day\'s view and more in a decade\'s, the mean inside its range', () => {
    expect(samplesFor({ startMs: 0, spanMs: DAY }, 600)).toBe(1);
    expect(samplesFor({ startMs: 0, spanMs: 10 * YEAR }, 600)).toBe(16);
    const view = { startMs: Date.UTC(2026, 0, 1), spanMs: 10 * YEAR };
    const bodies = LANE_BODIES.filter((b) => !['ASC', 'MC', 'DSC', 'IC'].includes(b));
    const g = graphColumns(view, skyColumns(view, 40, bodies, 'galactic'), 'galactic');
    for (let col = 0; col < 40; col++) {
      expect(g.resonance.min[col]).toBeLessThanOrEqual(g.resonance.mean[col]);
      expect(g.resonance.mean[col]).toBeLessThanOrEqual(g.resonance.max[col]);
      expect(g.tide.max[col] - g.tide.min[col]).toBeGreaterThan(0.2);
      const elements = [0, 1, 2, 3].reduce((sum, e) => sum + g.elements[col * 4 + e], 0);
      const modalities = [0, 1, 2].reduce((sum, m) => sum + g.modalities[col * 3 + m], 0);
      expect(elements).toBeCloseTo(1, 5);
      expect(modalities).toBeCloseTo(1, 5);
    }
  });
});
