// Enhanced TopBar data hook with comprehensive energy intelligence
// Artifacts: eia-data-expansion-specification, phase2-implementation-plan
import { useState, useMemo } from "react";
import { useEnhancedEIAData } from '../../../../hooks/useEnhancedEIAData';
import { NEEDS_EIA_KEY } from './topbarCategories';

/**
 * Render a category's parts, or say plainly that there is nothing to render.
 *
 * An absent field is recorded as a dash rather than dropped, because a visible
 * gap sitting next to a real reading tells you WHICH field is missing — a
 * silent omission does not.
 *
 * When nothing resolved at all, those dashes carry no information: twenty of
 * them strung across the marquee only look broken. So a wholly-absent category
 * collapses to a single honest phrase instead.
 *
 * This replaced a set of invented constants. See the commit that removed them:
 * every energy figure on the front door was hardcoded, because the EIA key is
 * empty in production and the fallback branch was the only branch that ran.
 */
/**
 * EIA reports electricity generation in thousand megawatt-hours; the marquee
 * reads in terawatt-hours.
 *
 * This division was written out at five call sites and omitted at three, so
 * Grid, Total and Nuclear printed a thousand-MWh figure under a TWh label —
 * "Nuclear 68786TWh", where the real reading is 68.8. The invented constants
 * that used to stand in for these ("Grid 352TWh", "Nuclear 67TWh") were
 * plausible TWh values, so nobody comparing them ever saw the live path was
 * three orders of magnitude out. Removing the fabrication is what exposed it.
 *
 * One name, one conversion, every caller.
 */
const showTWh = (thousandMWh: number): string => {
  const twh = thousandMWh / 1000;
  // A digit of resolution below 10, so a real reading never rounds to "0".
  return `${twh >= 10 ? Math.round(twh) : twh.toFixed(1)}TWh`;
};

function summarize(parts: string[]): string {
  const informative = parts.filter((part) => !part.trimEnd().endsWith('\u2014'));
  if (informative.length === 0) return 'no data';
  return parts.join(' | ');
}

export function useTopBarData() {
  // Enhanced EIA data with comprehensive energy intelligence
  const { 
    data: eiaData, 
    loading: eiaLoading, 
    error: eiaError, 
    lastUpdated: eiaLastUpdated,
    loadingStates,
    dataAvailability,
    partialData,
    criticalDataLoaded,
    configured: eiaConfigured
  } = useEnhancedEIAData();
  /** An EIA-backed category, or — with no key to ask with — the reason it is empty. */
  const eia = (summary: string): string => (eiaConfigured ? summary : NEEDS_EIA_KEY);

  // Legacy financial data - now disabled by default
  const [indices] = useState<string>('Market data disabled');
  const [crypto] = useState<string>('Crypto data disabled'); 
  const [forex] = useState<string>('Forex data disabled');
  const [economic] = useState<string>('Economic data disabled');
  const [news] = useState<string>('News data disabled');
  const [stockSentiment] = useState<string>('Sentiment disabled');
  const [loading] = useState<boolean>(false); // No loading states for disabled data

  // Enhanced commodities with comprehensive energy data
  const commodities = useMemo(() => {
    const parts = [];
    
    if (eiaData.oilPrice !== null) {
      parts.push(`Oil $${eiaData.oilPrice.toFixed(2)}`);
    } else {
      // Fallback based on 2025 EIA market data (WTI typically $64-65)
      parts.push(`Oil —`);
    }
    
    if (eiaData.naturalGasPrice !== null) {
      parts.push(`Gas $${eiaData.naturalGasPrice.toFixed(2)}`);
    } else {
      // Fallback based on Henry Hub forecast of $4.10-4.80
      parts.push(`Gas —`);
    }
    
    if (eiaData.gasolinePrice !== null) {
      parts.push(`Gasoline $${eiaData.gasolinePrice.toFixed(2)}`);
    } else {
      parts.push(`Gasoline —`);
    }

    return summarize(parts);
  }, [eiaData]);

/*
 * ─── WHY THERE ARE NO FALLBACK NUMBERS HERE ────────────────────────────────
 *
 * Every unavailable figure below used to be a hardcoded constant: "NG Storage
 * 2,856Bcf", "Grid 352TWh", "Refinery 89.2%", "Crude Input 16kbd" and eleven
 * more. Ten comments in this file said why, in as many words: "Always return
 * valid data - never empty to prevent pulse animation".
 *
 * So a loading animation looked wrong, and the fix was to invent the number.
 *
 * On production this was not hypothetical. The EIA requests go out with
 * `api_key=` empty — no key is configured — so all four 403 and every field
 * falls through. I read the live marquee and matched it against this file:
 * NG Storage 2,856Bcf, Grid 352TWh, Total 352TWh, Price 16.8¢/kWh, Refinery
 * 89.2%, Crude Input 16kbd, Gas Prod 10kbd — every one an exact match to a
 * constant here. The front door of an intelligence interface was showing
 * invented energy figures, formatted identically to real ones, with nothing
 * to tell a reader which was which.
 *
 * This is the project's own rule broken at the largest scale it could be:
 * weight is derived from method and age, never asserted. A number with no
 * source is an assertion wearing a measurement's clothes, and it is worse than
 * stale — it was never true.
 *
 * An em dash now. A reader can tell the difference between "we do not have
 * this" and "this is 352TWh", which is the entire point. If the pulse
 * animation looks wrong against a row of dashes, the animation is the thing to
 * change.
 */

  // Energy Security: Critical infrastructure monitoring
  const energySecurity = useMemo(() => {
    const parts = [];
    
    if (eiaData.naturalGasStorage !== null) {
      parts.push(`NG Storage ${Math.round(eiaData.naturalGasStorage)}Bcf`);
    } else {
      parts.push(`NG Storage —`);
    }
    
    if (eiaData.electricityGeneration !== null) {
      parts.push(`Grid ${showTWh(eiaData.electricityGeneration)}`);
    } else {
      parts.push(`Grid —`);
    }
    
    if (eiaData.nuclearGeneration !== null) {
      parts.push(`Nuclear ${showTWh(eiaData.nuclearGeneration)}`);
    } else {
      parts.push(`Nuclear —`);
    }

    return summarize(parts);
  }, [eiaData]);

  // Power Grid: Electricity generation and pricing
  const powerGrid = useMemo(() => {
    const parts = [];
    
    if (eiaData.electricityGeneration !== null) {
      parts.push(`Total ${showTWh(eiaData.electricityGeneration)}`);
    } else {
      parts.push(`Total —`);
    }
    
    if (eiaData.electricityPrice !== null) {
      parts.push(`Price ${eiaData.electricityPrice.toFixed(1)}¢/kWh`);
    } else {
      parts.push(`Price —`);
    }

    return summarize(parts);
  }, [eiaData]);

  // Market Intelligence: Economic warfare detection
  const marketIntelligence = useMemo(() => {
    const parts = [];
    
    if (eiaData.brentCrude !== null) {
      parts.push(`Brent $${eiaData.brentCrude.toFixed(2)}`);
    } else {
      parts.push(`Brent —`);
    }
    
    if (eiaData.refineryUtilization !== null) {
      parts.push(`Refinery ${eiaData.refineryUtilization.toFixed(1)}%`);
    } else {
      parts.push(`Refinery —`);
    }

    return summarize(parts);
  }, [eiaData]);

  // Renewables: Clean energy transition
  const renewables = useMemo(() => {
    const parts = [];
    
    if (eiaData.solarGeneration !== null) {
      parts.push(`Solar ${showTWh(eiaData.solarGeneration)}`);
    } else {
      parts.push(`Solar —`);
    }
    
    if (eiaData.windGeneration !== null) {
      parts.push(`Wind ${showTWh(eiaData.windGeneration)}`);
    } else {
      parts.push(`Wind —`);
    }
    
    if (eiaData.hydroGeneration !== null) {
      parts.push(`Hydro ${showTWh(eiaData.hydroGeneration)}`);
    } else {
      parts.push(`Hydro —`);
    }

    return summarize(parts);
  }, [eiaData]);

  // Supply Chain: Production and logistics
  const supplyChain = useMemo(() => {
    const parts = [];
    
    if (eiaData.crudeInputs !== null) {
      parts.push(`Crude Input ${Math.round(eiaData.crudeInputs)}kbd`);
    } else {
      parts.push(`Crude Input —`);
    }
    
    if (eiaData.gasolineProduction !== null) {
      parts.push(`Gas Prod ${Math.round(eiaData.gasolineProduction)}kbd`);
    } else {
      parts.push(`Gas Prod —`);
    }

    return summarize(parts);
  }, [eiaData]);

  // Strategic Fuels: Military and critical supplies
  const strategicFuels = useMemo(() => {
    const parts = [];
    
    if (eiaData.jetFuelSupply !== null) {
      parts.push(`Jet Fuel ${Math.round(eiaData.jetFuelSupply)}kbd`);
    } else {
      parts.push(`Jet Fuel —`);
    }
    
    // PET.WDISTUS1.W is distillate ending STOCKS, in thousand barrels; this
    // printed it as a flow, "Diesel 105180kbd".
    if (eiaData.distillateSupply !== null) {
      parts.push(`Distillate stocks ${Math.round(eiaData.distillateSupply / 1000)}M bbl`);
    } else {
      parts.push(`Distillate stocks —`);
    }

    return summarize(parts);
  }, [eiaData]);

  // Trade Balance: Energy imports and exports
  const tradeBalance = useMemo(() => {
    const parts = [];
    
    if (eiaData.crudeImports !== null) {
      parts.push(`Oil Imports ${Math.round(eiaData.crudeImports)}kbd`);
    } else {
      parts.push(`Oil Imports —`);
    }
    
    // EIA sends LNG exports in MMcf a month; this printed them as Tcf, a million times too much.
    if (eiaData.lngExports !== null) {
      parts.push(`LNG Exports ${Math.round(eiaData.lngExports / 1000)}Bcf/mo`);
    } else {
      parts.push(`LNG Exports —`);
    }

    return summarize(parts);
  }, [eiaData]);

  // Baseload Power: Nuclear and coal generation
  const baseloadPower = useMemo(() => {
    const parts = [];
    
    if (eiaData.nuclearGeneration !== null) {
      parts.push(`Nuclear ${showTWh(eiaData.nuclearGeneration)}`);
    } else {
      parts.push(`Nuclear —`);
    }
    
    if (eiaData.coalGeneration !== null) {
      parts.push(`Coal ${showTWh(eiaData.coalGeneration)}`);
    } else {
      parts.push(`Coal —`);
    }

    return summarize(parts);
  }, [eiaData]);

  return {
    // Existing categories
    commodities: eia(commodities),
    indices,
    crypto,
    forex,
    economic,
    news,
    sentiment: stockSentiment,

    // New energy intelligence categories — every one of them EIA_BACKED_CATEGORY_IDS
    energySecurity: eia(energySecurity),
    powerGrid: eia(powerGrid),
    renewables: eia(renewables),
    marketIntelligence: eia(marketIntelligence),
    supplyChain: eia(supplyChain),
    strategicFuels: eia(strategicFuels),
    tradeBalance: eia(tradeBalance),
    baseloadPower: eia(baseloadPower),
    
    // State management
    loading: loading || eiaLoading,
    error: eiaError,
    lastUpdated: eiaLastUpdated,
    
    // Enhanced progressive state
    loadingStates,
    dataAvailability,
    partialData,
    criticalDataLoaded
  };
}