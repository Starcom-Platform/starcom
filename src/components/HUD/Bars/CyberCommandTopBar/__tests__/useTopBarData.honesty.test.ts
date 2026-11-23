/**
 * The marquee must not invent a number it does not have.
 *
 * Every unavailable figure was a hardcoded constant — "NG Storage 2,856Bcf",
 * "Grid 352TWh", "Refinery 89.2%" and seventeen more — and ten comments in the
 * source said why, plainly: "Always return valid data - never empty to prevent
 * pulse animation". A loading animation looked wrong, so the number was
 * invented.
 *
 * It was live. The EIA requests leave with an empty api_key, they 403, and
 * every field falls through — so the production front door displayed those
 * constants formatted identically to real readings, on an interface whose
 * stated rule is that weight is derived from method and age and never asserted.
 *
 * Two rules are tested here, because honesty alone is not legibility:
 *   - nothing available  → say "no data" once, not twenty dashes
 *   - something missing  → show the dash, so the reader can see WHICH field
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const FIELDS = [
  'brentCrude', 'coalGeneration', 'crudeImports', 'crudeInputs', 'distillateSupply',
  'electricityGeneration', 'electricityPrice', 'gasolinePrice', 'gasolineProduction',
  'hydroGeneration', 'jetFuelSupply', 'lngExports', 'naturalGasPrice',
  'naturalGasStorage', 'nuclearGeneration', 'oilPrice', 'refineryUtilization',
  'solarGeneration', 'windGeneration',
] as const;

const allNull = () => Object.fromEntries(FIELDS.map((f) => [f, null]));

/**
 * Mutable so one test can supply a partial reading. Declared through
 * `vi.hoisted` because the `vi.mock` factory below is lifted above every
 * top-level binding in this file.
 *
 * The hook destructures `data`, so the mock has to nest. Returning the fields
 * flat throws on `oilPrice` of undefined — which is how I found the shape.
 */
const state = vi.hoisted(() => ({ data: {} as Record<string, number | null>, configured: true }));

vi.mock('../../../../../hooks/useEnhancedEIAData', () => ({
  useEnhancedEIAData: () => ({
    data: state.data,
    loading: false,
    error: null,
    lastUpdated: null,
    loadingStates: {},
    dataAvailability: {},
    partialData: false,
    criticalDataLoaded: false,
    configured: state.configured,
  }),
}));

/** Every figure this file used to invent, in the form it printed them. */
const ONCE_INVENTED = [
  '2,856', '352TWh', '67TWh', '89.2%', '66.25', '16.8', '35TWh', '46TWh',
  '22TWh', '16kbd', '10kbd', '1.4kbd', '4.7kbd', '6.2kbd', '64.50', '4.45',
  '3.25', '12.4Tcf',
];

const joinStrings = (o: Record<string, unknown>) =>
  Object.values(o).filter((v): v is string => typeof v === 'string').join(' | ');

const render = async () => {
  const { useTopBarData } = await import('../useTopBarData');
  const { result } = renderHook(() => useTopBarData());
  return joinStrings(result.current as Record<string, unknown>);
};

/**
 * "no data" says EIA was asked and had nothing. With no key it was never
 * asked, and in production there is no key — so for most visitors "no data"
 * was the wrong reason, stated nine times across the front door.
 */
describe('top bar with no EIA key', () => {
  beforeEach(() => { state.data = allNull(); state.configured = false; });

  const current = async () => {
    const { useTopBarData } = await import('../useTopBarData');
    const { result } = renderHook(() => useTopBarData());
    return result.current as unknown as Record<string, unknown>;
  };

  it('names the missing key on every EIA-backed category, and says "no data" on none', async () => {
    const { NEEDS_EIA_KEY } = await import('../topbarCategories');
    const bar = await current();
    const eiaBacked = ['commodities', 'energySecurity', 'powerGrid', 'marketIntelligence', 'renewables',
      'supplyChain', 'strategicFuels', 'tradeBalance', 'baseloadPower'];
    for (const k of eiaBacked) expect(bar[k], k).toBe(NEEDS_EIA_KEY);
    expect(joinStrings(bar)).not.toContain('no data');
  });

  it('leaves the categories EIA does not feed as they were', async () => {
    const { NEEDS_EIA_KEY } = await import('../topbarCategories');
    const bar = await current();
    for (const k of ['indices', 'crypto', 'forex', 'economic', 'news', 'sentiment']) {
      expect(bar[k], k).not.toBe(NEEDS_EIA_KEY);
    }
  });
});

describe('top bar honesty when EIA has no data', () => {
  beforeEach(() => { state.data = allNull(); state.configured = true; });

  it('supplies no figure it does not have', async () => {
    const all = await render();
    for (const n of ONCE_INVENTED) {
      expect(all, `invented figure ${n} is back`).not.toContain(n);
    }
  });

  it('says "no data" rather than printing a row of dashes', async () => {
    const all = await render();
    expect(all).toContain('no data');
    // Twenty dashes strung across the bar carry no information and read as
    // broken; the absence is stated once instead.
    expect(all).not.toMatch(/—/);
  });

  it('does not fall back to a whole fabricated string either', async () => {
    expect(await render()).not.toMatch(/NG Storage 2,856Bcf \| Grid/);
  });

  it('marks the missing field with a dash when some data DID arrive', async () => {
    // Partial availability is the case where a dash earns its place: it names
    // which reading is absent, sitting beside one that is real.
    state.data = { ...allNull(), oilPrice: 71.2 };
    const all = await render();
    expect(all).toContain('71.2');   // the real reading
    expect(all).toMatch(/Gas —/);    // and the gap beside it, named
  });

  it('reads generation in the unit it labels', async () => {
    /**
     * EIA returns thousand MWh. A US monthly nuclear figure of 68,786 of those
     * is 68.8 TWh — and the marquee printed "Nuclear 68786TWh", a thousand
     * times the real output, because three call sites skipped the division the
     * other five performed.
     *
     * It stayed invisible while a hardcoded "Nuclear 67TWh" stood in its place:
     * the fake was plausible, so nobody checked the real one.
     */
    state.data = { ...allNull(), nuclearGeneration: 68786, electricityGeneration: 352000 };
    const all = await render();
    expect(all).toContain('Nuclear 69TWh');
    expect(all).toContain('Grid 352TWh');
    expect(all).not.toContain('68786');
    expect(all).not.toContain('352000');
  });

  it('reads LNG exports in the unit EIA sends, and distillate as the stock it is', async () => {
    /**
     * Critique audit of 2026-10-01, checked against EIA on 2026-10-02. LNG
     * exports come in MMcf a month: 518,777 for July 2026, which is 519 Bcf.
     * The marquee printed "LNG Exports 518777.0Tcf", a million times too much.
     * PET.WDISTUS1.W is distillate ENDING STOCKS, in thousand barrels, and was
     * printed as a flow: "Diesel 105180kbd".
     */
    state.data = { ...allNull(), lngExports: 518777, distillateSupply: 105180 };
    const all = await render();
    expect(all).toContain('LNG Exports 519Bcf/mo');
    expect(all).toContain('Distillate stocks 105M bbl');
    expect(all).not.toMatch(/Tcf|\d+kbd.*Diesel|Diesel \d/);
  });
});
