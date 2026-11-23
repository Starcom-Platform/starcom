/**
 * The ticker's EIA series, each checked against EIA itself on 2026-10-02
 * (critique audit of 2026-10-01, section 2.1; plan block F, item 2).
 *
 * What the check found in the table this replaced:
 * - the gas price read NG.RNGC1.D, whose last value is from April 2024, and
 *   showed it as current;
 * - "refinery utilization" read crude field production, "crude imports" read
 *   refiner crude input, and "gasoline production" read refinery utilization;
 * - jet fuel, propane and crude inputs named series EIA says do not exist;
 * - LNG exports, in MMcf, were labelled Tcf, and distillate STOCKS were
 *   labelled a flow;
 * - a natural-gas generation series was fetched every poll and never shown;
 * - eleven entries carried "earthAllianceContext" lines about cartels.
 *
 * Each series below names the field it fills. The mapping is read from this
 * table, so a series cannot be fetched without a place to put it.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { EIA_SERIES_CONFIG } from '../seriesConfig';

/** Series id, as EIA describes it on 2026-10-02, and the field it fills. */
const VERIFIED: Record<string, [string, string]> = {
  'PET.RWTC.W': ['Cushing, OK WTI Spot Price FOB ($/bbl)', 'oilPrice'],
  'PET.RBRTE.W': ['Europe Brent Spot Price FOB ($/bbl)', 'brentCrude'],
  'PET.EMM_EPM0_PTE_NUS_DPG.W': ['U.S. All Grades All Formulations Retail Gasoline Prices ($/gal)', 'gasolinePrice'],
  'NG.RNGWHHD.D': ['Henry Hub Natural Gas Spot Price ($/MMBtu)', 'naturalGasPrice'],
  'NG.NW2_EPG0_SWO_R48_BCF.W': ['Weekly Lower 48 States Natural Gas Working Underground Storage (Bcf)', 'naturalGasStorage'],
  'ELEC.GEN.ALL-US-99.M': ['Net generation, all fuels (thousand MWh)', 'electricityGeneration'],
  'ELEC.PRICE.US-ALL.M': ['Average retail price of electricity, all sectors (cents/kWh)', 'electricityPrice'],
  'ELEC.GEN.TSN-US-99.M': ['Net generation, all solar (thousand MWh)', 'solarGeneration'],
  'ELEC.GEN.WND-US-99.M': ['Net generation, wind (thousand MWh)', 'windGeneration'],
  'ELEC.GEN.HYC-US-99.M': ['Net generation, conventional hydroelectric (thousand MWh)', 'hydroGeneration'],
  'ELEC.GEN.NUC-US-99.M': ['Net generation, nuclear (thousand MWh)', 'nuclearGeneration'],
  'ELEC.GEN.COW-US-99.M': ['Net generation, coal (thousand MWh)', 'coalGeneration'],
  'PET.WKJUPUS2.W': ['U.S. Product Supplied of Kerosene-Type Jet Fuel (kb/d)', 'jetFuelSupply'],
  'PET.WDISTUS1.W': ['U.S. Ending Stocks of Distillate Fuel Oil (thousand bbl)', 'distillateSupply'],
  'PET.WPULEUS3.W': ['U.S. Percent Utilization of Refinery Operable Capacity (%)', 'refineryUtilization'],
  'PET.WCRRIUS2.W': ['U.S. Refiner Net Input of Crude Oil (kb/d)', 'crudeInputs'],
  'PET.WGFRPUS2.W': ['U.S. Refiner and Blender Adjusted Net Production of Finished Motor Gasoline (kb/d)', 'gasolineProduction'],
  'PET.WCRIMUS2.W': ['U.S. Imports of Crude Oil (kb/d)', 'crudeImports'],
  'NG.N9133US2.M': ['Liquefied U.S. Natural Gas Exports (MMcf)', 'lngExports'],
};

/** Ids EIA refused, or that do not measure what they were labelled. */
const WRONG = ['NG.RNGC1.D', 'PET.WCJRPUS2.W', 'PET.WPRPUS1.W', 'PET.WCRRPUS2.W', 'PET.WCRFPUS2.W'];

describe('the ticker\'s EIA series', () => {
  const entries = Object.values(EIA_SERIES_CONFIG);

  it('are exactly the series checked against EIA, each filling its own field', () => {
    expect(Object.fromEntries(entries.map((c) => [c.series, c.field]))).toEqual(
      Object.fromEntries(Object.entries(VERIFIED).map(([series, [, field]]) => [series, field])),
    );
  });

  it('fill each field once', () => {
    const fields = entries.map((c) => c.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('include none of the ids EIA refused or that measured something else', () => {
    for (const id of WRONG) expect(entries.map((c) => c.series), id).not.toContain(id);
  });

  it('carry no "earth alliance" commentary', () => {
    for (const config of entries) expect(config as unknown as Record<string, unknown>, config.id).not.toHaveProperty('earthAllianceContext');
  });
});
