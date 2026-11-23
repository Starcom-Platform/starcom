// Enhanced TopBar data categories with comprehensive energy intelligence
// Artifacts: eia-data-expansion-specification, phase2-implementation-plan

export interface TopBarCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  defaultEnabled: boolean;
  tier?: 'essential' | 'important' | 'specialized';
}

export const TOPBAR_CATEGORIES: TopBarCategory[] = [
  // ===== ESSENTIAL ENERGY INTELLIGENCE (Always Enabled) =====
  { 
    id: 'commodities', 
    label: 'Energy Markets', 
    icon: '🛢️', 
    description: 'Oil, gas, and energy commodity prices', 
    defaultEnabled: true,
    tier: 'essential'
  },
  { 
    id: 'energy-security', 
    label: 'Energy Security', 
    icon: '🔒', 
    description: 'Critical infrastructure and energy resilience monitoring', 
    defaultEnabled: true,
    tier: 'essential'
  },
  { 
    id: 'power-grid', 
    label: 'Power Grid', 
    icon: '⚡', 
    description: 'Electricity generation, capacity, and grid stability', 
    defaultEnabled: true,
    tier: 'essential'
  },
  { 
    id: 'market-intelligence', 
    label: 'Energy Intel', 
    icon: '🔍', 
    description: 'Oil markets, pricing, and economic warfare detection', 
    defaultEnabled: true,
    tier: 'essential'
  },

  // ===== IMPORTANT ENERGY CATEGORIES (Default Enabled) =====
  { 
    id: 'renewables', 
    label: 'Clean Energy', 
    icon: '🌱', 
    description: 'Solar, wind, and renewable energy adoption', 
    defaultEnabled: true,
    tier: 'important'
  },
  { 
    id: 'supply-chain', 
    label: 'Supply Chain', 
    icon: '🏭', 
    description: 'Refinery capacity, production, and logistics', 
    defaultEnabled: true,
    tier: 'important'
  },

  // ===== SPECIALIZED ENERGY CATEGORIES (User Configurable) =====
  { 
    id: 'strategic-fuels', 
    label: 'Strategic Fuels', 
    icon: '✈️', 
    description: 'Jet fuel, diesel, and military-critical fuels', 
    defaultEnabled: false,
    tier: 'specialized'
  },
  { 
    id: 'trade-balance', 
    label: 'Energy Trade', 
    icon: '🚢', 
    description: 'Energy imports, exports, and trade balance', 
    defaultEnabled: false,
    tier: 'specialized'
  },
  { 
    id: 'baseload-power', 
    label: 'Baseload Power', 
    icon: '⚛️', 
    description: 'Nuclear, coal, and reliable power generation', 
    defaultEnabled: false,
    tier: 'specialized'
  },

  // ===== TRADITIONAL FINANCIAL DATA (Demoted, Disabled by Default) =====
  { 
    id: 'indices', 
    label: 'Market Indices', 
    icon: '📈', 
    description: 'S&P 500, NASDAQ, etc.', 
    defaultEnabled: false,
    tier: 'important'
  },
  { 
    id: 'crypto', 
    label: 'Cryptocurrency', 
    icon: '₿', 
    description: 'Bitcoin, Ethereum, etc.', 
    defaultEnabled: false,
    tier: 'important'
  },
  { 
    id: 'economic', 
    label: 'Economic Indicators', 
    icon: '📊', 
    description: 'Inflation, GDP, economic data', 
    defaultEnabled: false,
    tier: 'important'
  },
  { 
    id: 'news', 
    label: 'News Headlines', 
    icon: '📰', 
    description: 'Financial news headlines', 
    defaultEnabled: false,
    tier: 'important'
  },
  { 
    id: 'sentiment', 
    label: 'Market Sentiment', 
    icon: '📢', 
    description: 'AI-generated market sentiment', 
    defaultEnabled: false,
    tier: 'important'
  },
  { 
    id: 'forex', 
    label: 'Foreign Exchange', 
    icon: '💱', 
    description: 'USD/EUR, currency pairs', 
    defaultEnabled: false,
    tier: 'specialized'
  }
];

// Category grouping for enhanced organization
export const CATEGORY_GROUPS = {
  energy: ['commodities', 'energy-security', 'power-grid', 'market-intelligence', 'renewables', 'supply-chain', 'strategic-fuels', 'trade-balance', 'baseload-power'],
  financial: ['indices', 'crypto', 'forex', 'economic', 'news', 'sentiment']
} as const;

// Default enabled categories for new users
export const DEFAULT_ENABLED_CATEGORIES = TOPBAR_CATEGORIES
  .filter(cat => cat.defaultEnabled)
  .map(cat => cat.id);

// Essential categories that should always be available
export const ESSENTIAL_CATEGORIES = TOPBAR_CATEGORIES
  .filter(cat => cat.tier === 'essential')
  .map(cat => cat.id);

/**
 * The marquee categories whose contents come from the EIA feed.
 *
 * Exported so the data hook can flag exactly these as loading and, more to the
 * point, clear them again. The hook used to name them in camelCase while the
 * categories are kebab-case, so `loadingStates[category.id]` missed every one
 * of them — except 'renewables', which happens to be spelled the same in both
 * conventions and therefore sat under a spinner that never stopped, because
 * the code that cleared the flags keyed off EIA field names instead.
 */
export const EIA_BACKED_CATEGORY_IDS = [
  'commodities',
  'energy-security',
  'power-grid',
  'market-intelligence',
  'renewables',
  'supply-chain',
  'strategic-fuels',
  'trade-balance',
  'baseload-power',
] as const;

/**
 * What an EIA-backed category reads when this browser has no EIA key.
 *
 * Distinct from "no data" on purpose. "no data" says EIA was asked and had
 * nothing; this says it was never asked. Before the two were told apart, the
 * settings panel inferred "no EIA credential" from "no data" — so a reader
 * whose key WAS set, on a day EIA was down, was told to go and add one.
 */
export const NEEDS_EIA_KEY = 'needs an EIA key';
