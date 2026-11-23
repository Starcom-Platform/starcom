/**
 * The figures Diplomacy's country brief states (decision D-DP, DP6, DP17–DP19), read when a country is
 * first selected and kept while one is: EIA's production (energyProduction.ts: Mecha Jono's notes,
 * else the file), the World Bank's freshwater per person, USGS's minerals, and UNHCR's displacement
 * both ways, and OFAC's SDN list by country (DP6). The same reads Resource Zones and Conflict Zones
 * make, from the same caches; nothing is asked before a country is selected.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadEnergyProduction, type EnergyProduction } from '../../services/geopolitical/energyProduction';
import { getRealWaterResourceData, type CountryWaterResource } from '../../services/geopolitical/WorldBankWaterService';
import { getMineralProductionRecords, type MineralProductionRecord } from '../../services/geopolitical/USGSMineralsService';
import {
  getRealDisplacementByOrigin,
  getRealDisplacementData,
  type CountryDisplacement,
  type CountryDisplacementFrom,
} from '../../services/geopolitical/UNHCRDisplacementService';
import { displacementOf, resourceLines, type BriefSource, type DisplacementBrief, type ResourceLine } from '../utils/countryBrief';
import { loadSanctionsByCountry, sanctionsLineOf, type SanctionsByCountry, type SanctionsLine } from '../utils/countrySanctions';

export interface CountryBrief {
  /** Null while the figures load. */
  resources: ResourceLine[] | null;
  /** Undefined while UNHCR's figures load; null when UNHCR lists it on neither side. */
  displacement: DisplacementBrief | null | undefined;
  /** Undefined while OFAC's list loads; null when no SDN entry has an address there. */
  sanctions: SanctionsLine | null | undefined;
  /** The sources that did not answer: none of their figures is shown, and the brief says so. */
  failed: BriefSource[];
}

interface Figures {
  energy?: EnergyProduction;
  water?: readonly CountryWaterResource[];
  minerals?: readonly MineralProductionRecord[];
  hosted?: readonly CountryDisplacement[];
  from?: readonly CountryDisplacementFrom[];
  sanctions?: SanctionsByCountry;
}

export function useCountryBrief(code: string | null): CountryBrief | null {
  const [figures, setFigures] = useState<Figures>({});
  const wanted = code !== null;

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    const read = <K extends keyof Figures>(key: K, load: () => Promise<NonNullable<Figures[K]>>, none: NonNullable<Figures[K]>) => {
      // Each service logs its own failure and answers with what it holds, often nothing.
      load().catch(() => none).then((value) => {
        if (live) setFigures((held) => ({ ...held, [key]: value }));
      });
    };
    read('energy', loadEnergyProduction, {});
    read('water', getRealWaterResourceData, []);
    read('minerals', getMineralProductionRecords, []);
    read('hosted', getRealDisplacementData, []);
    read('from', getRealDisplacementByOrigin, []);
    read('sanctions', () => loadSanctionsByCountry(), { retrievedAt: '', countries: {} });
    return () => { live = false; };
  }, [wanted]);

  return useMemo(() => {
    if (!code) return null;
    const { energy, water, minerals, hosted, from, sanctions } = figures;
    const failed: BriefSource[] = [];
    if (energy && !Object.keys(energy).length) failed.push('EIA');
    if (minerals && !minerals.length) failed.push('USGS');
    if (water && !water.length) failed.push('World Bank');
    // UNHCR lists some 180 countries each way: nothing on both is no answer.
    const unhcrFailed = !!hosted && !!from && !hosted.length && !from.length;
    if (unhcrFailed) failed.push('UNHCR');
    // The build's file lists some 170 countries: none is no file.
    const ofacFailed = !!sanctions && !Object.keys(sanctions.countries).length;
    if (ofacFailed) failed.push('OFAC');
    return {
      resources: energy && water && minerals ? resourceLines(code, { energy, water, minerals }) : null,
      displacement: hosted && from && !unhcrFailed ? displacementOf(code, hosted, from) : undefined,
      sanctions: sanctions && !ofacFailed ? sanctionsLineOf(code, sanctions) : undefined,
      failed,
    };
  }, [code, figures]);
}
