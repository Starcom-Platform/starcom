import { describe, it, expect } from 'vitest';
import {
  gapsIn, comparableOn, weighHarm, isKnown,
  type HarmAccount, type HarmWeights, type Quantity,
} from '../HarmAccount';

const range = (low: number, high: number, over: Partial<Quantity> = {}): Quantity => ({
  known: true, low, high, unit: 'people', basis: 'reported',
  method: 'aggregated from three field reports', ...over,
} as Quantity);

const unknown = (whyNot: string): Quantity => ({ known: false, whyNot });

const account = (over: Partial<HarmAccount> = {}): HarmAccount => ({
  subject: 'Flooding, lower delta',
  affectedPopulation: range(2000, 5000),
  magnitude: { severity: 'material-loss', atThisSeverity: range(2000, 5000) },
  duration: { known: true, low: 30, high: 180, unit: 'days', basis: 'modelled', method: 'recovery curve from comparable events' },
  distribution: { bearers: 'delta villages', concentration: 'concentrated', agency: 'no-say', compounding: true },
  assessedAt: '2026-08-21T00:00:00Z',
  method: 'field reports cross-checked against satellite extent',
  schemaVersion: 1,
  ...over,
});

const WEIGHTS: HarmWeights = {
  severity: { inconvenience: 1, 'material-loss': 10, injury: 50, 'lasting-injury': 200, death: 1000 },
  noSayMultiplier: 1.5,
  compoundingMultiplier: 1.5,
  rationale: 'Illustrative only. Chosen for a test, defensible by nobody.',
};

describe('quantities are ranges, and unknown is not zero', () => {
  it('treats an unknown quantity as unknown, never as a number', () => {
    const q = unknown('no census since 2019');
    expect(isKnown(q)).toBe(false);
    expect(q as unknown as { low?: number }).not.toHaveProperty('low');
  });

  it('requires a reason for every gap', () => {
    const gaps = gapsIn(account({ affectedPopulation: unknown('access denied to the district') }));
    expect(gaps.some((g) => g.includes('access denied to the district'))).toBe(true);
  });

  it('lists what is missing, so one number cannot pass for an account', () => {
    const sparse = account({
      affectedPopulation: unknown('no count'),
      magnitude: { severity: 'unknown', atThisSeverity: unknown('no count') },
      duration: unknown('ongoing'),
      distribution: { bearers: '?', concentration: 'unknown', agency: 'unknown', compounding: 'unknown' },
    });
    expect(gapsIn(sparse).length).toBeGreaterThanOrEqual(6);
  });

  it('reports no gaps for a fully established account', () => {
    expect(gapsIn(account())).toEqual([]);
  });
});

describe('comparison refuses rather than coerces', () => {
  it('will not compare against an unknown quantity', () => {
    // Coercing unknown to zero is exactly how unmeasured populations come to
    // be described as unaffected.
    const r = comparableOn(account(), account({ affectedPopulation: unknown('no data') }), 'affectedPopulation');
    expect(r.comparable).toBe(false);
    if (!r.comparable) expect(r.reason).toMatch(/no data/);
  });

  it('will not compare different units', () => {
    const r = comparableOn(
      account(),
      account({ affectedPopulation: range(10, 20, { unit: 'households' } as never) }),
      'affectedPopulation',
    );
    expect(r.comparable).toBe(false);
    if (!r.comparable) expect(r.reason).toMatch(/different units/);
  });

  it('will not order overlapping ranges', () => {
    // Picking midpoints to break the tie manufactures a distinction the
    // evidence does not contain.
    const r = comparableOn(account(), account({ affectedPopulation: range(4000, 9000) }), 'affectedPopulation');
    expect(r.comparable).toBe(false);
    if (!r.comparable) expect(r.reason).toMatch(/overlap/);
  });

  it('compares ranges that genuinely do not overlap', () => {
    expect(comparableOn(account(), account({ affectedPopulation: range(10, 50) }), 'affectedPopulation').comparable).toBe(true);
  });
});

describe('weighing requires stated weights and honest inputs', () => {
  it('produces a RANGE, because its inputs are ranges', () => {
    const r = weighHarm(account(), WEIGHTS);
    expect(r.weighed).toBe(true);
    if (!r.weighed) return;
    expect(r.high).toBeGreaterThan(r.low);
  });

  it('records the weights alongside the result', () => {
    // So a reader can disagree with the specific judgement rather than the
    // number it produced.
    const r = weighHarm(account(), WEIGHTS);
    expect(r.weighed && r.weights.rationale).toMatch(/Illustrative/);
  });

  it('REFUSES when the population is unknown rather than scoring it zero', () => {
    // The single most important behaviour here: a scorer that reads missing
    // data as "no harm" ranks by how much attention a population has already
    // received, which is backwards for a network meant to notice what is
    // being missed.
    const r = weighHarm(account({ affectedPopulation: unknown('district inaccessible') }), WEIGHTS);
    expect(r.weighed).toBe(false);
    if (r.weighed) return;
    expect(r.reason).toMatch(/district inaccessible/);
  });

  it('refuses when severity was never established', () => {
    const r = weighHarm(account({ magnitude: { severity: 'unknown', atThisSeverity: range(1, 2) } }), WEIGHTS);
    expect(r.weighed).toBe(false);
  });

  it('refuses when the caller supplied no weight for the severity in question', () => {
    const partial = { ...WEIGHTS, severity: { ...WEIGHTS.severity } } as HarmWeights;
    delete (partial.severity as Record<string, number>).death;
    const r = weighHarm(account({ magnitude: { severity: 'death', atThisSeverity: range(3, 5) } }), partial);
    expect(r.weighed).toBe(false);
    if (!r.weighed) expect(r.reason).toMatch(/no weight supplied/);
  });

  it('carries the gaps through even when it does produce a number', () => {
    // A weighed result with unstated duration is still incomplete, and the
    // caller must be able to see that next to the figure.
    const r = weighHarm(account({ duration: unknown('ongoing, no end in sight') }), WEIGHTS);
    expect(r.weighed).toBe(true);
    if (!r.weighed) return;
    expect(r.gaps.some((g) => g.includes('ongoing'))).toBe(true);
  });

  it('weighs harm on people who had no say more heavily, as the caller instructed', () => {
    const noSay = weighHarm(account(), WEIGHTS);
    const chose = weighHarm(account({
      distribution: { ...account().distribution, agency: 'chose-the-risk', compounding: false },
    }), WEIGHTS);
    expect(noSay.weighed && chose.weighed && noSay.low).toBeGreaterThan(chose.weighed ? chose.low : Infinity);
  });

  it('has no default weights — collapsing requires a stated judgement', () => {
    // Asserted by signature: weighHarm cannot be called without them. A default
    // would be this module deciding, for everyone, how many displaced people
    // equal one death.
    // @ts-expect-error — weights are required.
    expect(() => weighHarm(account())).toBeDefined();
  });
});
