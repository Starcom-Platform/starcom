/**
 * The EIA series the top bar's marquee reads, each checked against EIA itself
 * on 2026-10-02 (critique audit of 2026-10-01, section 2.1; plan block F,
 * item 2). Each entry names the field of EnhancedEIAData it fills, and the
 * mapping is read from here, so a series cannot be fetched without a place to
 * put it, nor shown under another series' name.
 *
 * The comment on each is EIA's own description of the series, and its unit as
 * EIA sends it. What the table this replaced got wrong is listed in
 * __tests__/seriesConfig.verified.test.ts.
 *
 * `refreshInterval` is in minutes: how long a reading is kept before it is
 * asked for again. EIA publishes these daily, weekly or monthly, so a five-
 * minute poll would otherwise ask for the same figure dozens of times a day.
 */
import type { EIASeriesConfig, EIABatchGroup } from './interfaces';

const DAILY = 60;
const WEEKLY = 360;
const MONTHLY = 1440;

export const EIA_SERIES_CONFIG: Record<string, EIASeriesConfig> = {
  // Cushing, OK WTI Spot Price FOB. $/bbl, weekly.
  'oil-price': {
    id: 'oil-price', series: 'PET.RWTC.W', field: 'oilPrice', label: 'WTI Oil', icon: '🛢️', format: '$XX.XX',
    category: 'oil-markets', priority: 'critical', refreshInterval: WEEKLY, batchGroup: 'energySecurity',
  },
  // Europe Brent Spot Price FOB. $/bbl, weekly.
  'brent-crude': {
    id: 'brent-crude', series: 'PET.RBRTE.W', field: 'brentCrude', label: 'Brent', icon: '🌊', format: '$XX.XX',
    category: 'oil-markets', priority: 'important', refreshInterval: WEEKLY, batchGroup: 'oilMarkets',
  },
  // U.S. All Grades All Formulations Retail Gasoline Prices. $/gal, weekly.
  'gasoline-price': {
    id: 'gasoline-price', series: 'PET.EMM_EPM0_PTE_NUS_DPG.W', field: 'gasolinePrice', label: 'Gasoline', icon: '⛽', format: '$X.XX',
    category: 'oil-markets', priority: 'important', refreshInterval: WEEKLY, batchGroup: 'energySecurity',
  },
  // Henry Hub Natural Gas Spot Price. $/MMBtu, daily. (Was NG.RNGC1.D, whose last value is from April 2024.)
  'natural-gas-price': {
    id: 'natural-gas-price', series: 'NG.RNGWHHD.D', field: 'naturalGasPrice', label: 'Henry Hub', icon: '🔥', format: '$X.XX',
    category: 'energy-security', priority: 'critical', refreshInterval: DAILY, batchGroup: 'energySecurity',
  },
  // Weekly Lower 48 States Natural Gas Working Underground Storage. Bcf, weekly.
  'natural-gas-storage': {
    id: 'natural-gas-storage', series: 'NG.NW2_EPG0_SWO_R48_BCF.W', field: 'naturalGasStorage', label: 'NG Storage', icon: '🏭', format: 'X,XXX Bcf',
    category: 'energy-security', priority: 'important', refreshInterval: WEEKLY, batchGroup: 'energySecurity',
  },
  // Net generation, all fuels, United States. Thousand MWh, monthly.
  'electricity-generation': {
    id: 'electricity-generation', series: 'ELEC.GEN.ALL-US-99.M', field: 'electricityGeneration', label: 'Grid', icon: '⚡', format: 'X,XXX TWh',
    category: 'power-grid', priority: 'critical', refreshInterval: MONTHLY, batchGroup: 'powerGrid',
  },
  // Average retail price of electricity, all sectors. Cents/kWh, monthly; EIA sends it as `price`.
  'electricity-price': {
    id: 'electricity-price', series: 'ELEC.PRICE.US-ALL.M', field: 'electricityPrice', label: 'Power Price', icon: '💡', format: 'XX.X¢/kWh',
    category: 'power-grid', priority: 'important', refreshInterval: MONTHLY, batchGroup: 'powerGrid',
  },
  // Net generation, all solar. Thousand MWh, monthly.
  'solar-generation': {
    id: 'solar-generation', series: 'ELEC.GEN.TSN-US-99.M', field: 'solarGeneration', label: 'Solar', icon: '☀️', format: 'XXX TWh',
    category: 'renewables', priority: 'important', refreshInterval: MONTHLY, batchGroup: 'renewables',
  },
  // Net generation, wind. Thousand MWh, monthly.
  'wind-generation': {
    id: 'wind-generation', series: 'ELEC.GEN.WND-US-99.M', field: 'windGeneration', label: 'Wind', icon: '💨', format: 'XXX TWh',
    category: 'renewables', priority: 'important', refreshInterval: MONTHLY, batchGroup: 'renewables',
  },
  // Net generation, conventional hydroelectric. Thousand MWh, monthly.
  'hydro-generation': {
    id: 'hydro-generation', series: 'ELEC.GEN.HYC-US-99.M', field: 'hydroGeneration', label: 'Hydro', icon: '🌊', format: 'XXX TWh',
    category: 'renewables', priority: 'standard', refreshInterval: MONTHLY, batchGroup: 'renewables',
  },
  // Net generation, nuclear. Thousand MWh, monthly.
  'nuclear-generation': {
    id: 'nuclear-generation', series: 'ELEC.GEN.NUC-US-99.M', field: 'nuclearGeneration', label: 'Nuclear', icon: '⚛️', format: 'XXX TWh',
    category: 'power-grid', priority: 'important', refreshInterval: MONTHLY, batchGroup: 'powerGrid',
  },
  // Net generation, coal. Thousand MWh, monthly.
  'coal-generation': {
    id: 'coal-generation', series: 'ELEC.GEN.COW-US-99.M', field: 'coalGeneration', label: 'Coal', icon: '⛏️', format: 'XXX TWh',
    category: 'power-grid', priority: 'standard', refreshInterval: MONTHLY, batchGroup: 'powerGrid',
  },
  // U.S. Product Supplied of Kerosene-Type Jet Fuel. Thousand bbl/day, weekly. (Was PET.WCJRPUS2.W, which EIA says does not exist.)
  'jet-fuel-supply': {
    id: 'jet-fuel-supply', series: 'PET.WKJUPUS2.W', field: 'jetFuelSupply', label: 'Jet Fuel', icon: '✈️', format: 'X,XXX kbd',
    category: 'supply-chain', priority: 'important', refreshInterval: WEEKLY, batchGroup: 'strategicFuels',
  },
  // U.S. Ending Stocks of Distillate Fuel Oil. Thousand bbl, weekly: a stock, not a flow.
  'distillate-supply': {
    id: 'distillate-supply', series: 'PET.WDISTUS1.W', field: 'distillateSupply', label: 'Distillate stocks', icon: '🚚', format: 'XXX M bbl',
    category: 'supply-chain', priority: 'standard', refreshInterval: WEEKLY, batchGroup: 'strategicFuels',
  },
  // U.S. Percent Utilization of Refinery Operable Capacity. %, weekly. (Was PET.WCRFPUS2.W, which is crude field production.)
  'refinery-utilization': {
    id: 'refinery-utilization', series: 'PET.WPULEUS3.W', field: 'refineryUtilization', label: 'Refinery', icon: '🏭', format: 'XX.X%',
    category: 'supply-chain', priority: 'standard', refreshInterval: WEEKLY, batchGroup: 'supplyChain',
  },
  // U.S. Refiner Net Input of Crude Oil. Thousand bbl/day, weekly. (Was PET.WCRRPUS2.W, which EIA says does not exist.)
  'crude-inputs': {
    id: 'crude-inputs', series: 'PET.WCRRIUS2.W', field: 'crudeInputs', label: 'Crude Input', icon: '🛢️', format: 'X,XXX kbd',
    category: 'supply-chain', priority: 'standard', refreshInterval: WEEKLY, batchGroup: 'supplyChain',
  },
  // U.S. Refiner and Blender Adjusted Net Production of Finished Motor Gasoline. Thousand bbl/day, weekly. (Was refinery utilization.)
  'gasoline-production': {
    id: 'gasoline-production', series: 'PET.WGFRPUS2.W', field: 'gasolineProduction', label: 'Gas Prod', icon: '⛽', format: 'X,XXX kbd',
    category: 'supply-chain', priority: 'standard', refreshInterval: WEEKLY, batchGroup: 'supplyChain',
  },
  // U.S. Imports of Crude Oil. Thousand bbl/day, weekly. (Was PET.WCRRIUS2.W, which is refiner input.)
  'crude-imports': {
    id: 'crude-imports', series: 'PET.WCRIMUS2.W', field: 'crudeImports', label: 'Oil Imports', icon: '🚢', format: 'X,XXX kbd',
    category: 'trade', priority: 'standard', refreshInterval: WEEKLY, batchGroup: 'tradeBalance',
  },
  // Liquefied U.S. Natural Gas Exports. MMcf, monthly: shown in Bcf a month.
  'lng-exports': {
    id: 'lng-exports', series: 'NG.N9133US2.M', field: 'lngExports', label: 'LNG Exports', icon: '🚢', format: 'XXX Bcf/mo',
    category: 'trade', priority: 'standard', refreshInterval: MONTHLY, batchGroup: 'tradeBalance',
  },
};

// Optimized batch groups for efficient API calls
export const EIA_BATCH_GROUPS: Record<string, EIABatchGroup> = {
  energySecurity: {
    id: 'energy-security',
    name: 'Energy Security',
    description: 'Critical infrastructure monitoring',
    seriesIds: ['oil-price', 'natural-gas-price', 'gasoline-price', 'natural-gas-storage'],
    priority: 'critical',
    refreshInterval: 15
  },
  
  powerGrid: {
    id: 'power-grid',
    name: 'Power Grid',
    description: 'Electricity generation and pricing',
    seriesIds: ['nuclear-generation', 'coal-generation', 'electricity-generation', 'electricity-price'],
    priority: 'critical',
    refreshInterval: 60
  },
  
  renewables: {
    id: 'renewables',
    name: 'Renewables',
    description: 'Clean energy generation',
    seriesIds: ['solar-generation', 'wind-generation', 'hydro-generation'],
    priority: 'important',
    refreshInterval: 240
  },
  
  oilMarkets: {
    id: 'oil-markets',
    name: 'Oil Markets',
    description: 'Global crude oil pricing',
    seriesIds: ['oil-price', 'brent-crude'],
    priority: 'important',
    refreshInterval: 60
  },
  
  strategicFuels: {
    id: 'strategic-fuels',
    name: 'Strategic Fuels',
    description: 'Military and aviation fuels',
    seriesIds: ['jet-fuel-supply', 'distillate-supply'],
    priority: 'important',
    refreshInterval: 120
  },
  
  supplyChain: {
    id: 'supply-chain',
    name: 'Supply Chain',
    description: 'Production and refinery operations',
    seriesIds: ['refinery-utilization', 'crude-inputs', 'gasoline-production'],
    priority: 'standard',
    refreshInterval: 180
  },
  
  tradeBalance: {
    id: 'trade-balance',
    name: 'Trade Balance',
    description: 'Energy imports and exports',
    seriesIds: ['crude-imports', 'lng-exports'],
    priority: 'standard',
    refreshInterval: 480
  }
};

// Priority-based refresh intervals (in minutes)
export const REFRESH_INTERVALS = {
  critical: 15,     // Energy security, grid stability
  important: 60,    // Market intelligence, renewables
  standard: 180,    // Supply chain, trade data
  background: 480   // Historical trends, low-priority metrics
} as const;

// Data formatting functions
export const formatValue = (value: number, config: EIASeriesConfig): string => {
  if (config.transform) {
    return config.transform(value);
  }
  
  const format = config.format;
  
  // Handle different format patterns
  if (format.includes('$')) {
    return `$${value.toFixed(2)}`;
  } else if (format.includes('%')) {
    return `${value.toFixed(1)}%`;
  } else if (format.includes('TWh')) {
    // Convert from thousand MWh to TWh (divide by 1000)
    const twh = value / 1000;
    return `${twh.toFixed(0)}TWh`;
  } else if (format.includes('kbd')) {
    return `${Math.round(value)}kbd`;
  } else if (format.includes('Tcf')) {
    return `${value.toFixed(1)}Tcf`;
  } else if (format.includes('Bcf')) {
    return `${Math.round(value)}Bcf`;
  } else if (format.includes('mm bbl')) {
    return `${Math.round(value)}mm bbl`;
  } else if (format.includes('¢/kWh')) {
    return `${value.toFixed(1)}¢/kWh`;
  }
  
  // Default formatting
  return value.toFixed(2);
};

// Get series by category
export const getSeriesByCategory = (category: string): EIASeriesConfig[] => {
  return Object.values(EIA_SERIES_CONFIG).filter(config => config.category === category);
};

// Get series by priority
export const getSeriesByPriority = (priority: string): EIASeriesConfig[] => {
  return Object.values(EIA_SERIES_CONFIG).filter(config => config.priority === priority);
};

// AI-NOTE: This configuration provides comprehensive mapping of EIA data series to Earth Alliance
// intelligence categories with optimized batching for efficient API usage and strategic context
// for planetary reclamation operations.
