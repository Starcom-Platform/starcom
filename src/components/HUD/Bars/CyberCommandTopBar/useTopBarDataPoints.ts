/**
 * The Globe's energy categories as data points, with the person's choice of
 * which to show: what the Globe's own ticker drew, before the one ticker took
 * its readings (K4). The main ticker carries those the visitor has
 * (energySignals.ts), and the Globe settings popup lists all of them.
 */
import { useMemo } from 'react';
import { TOPBAR_CATEGORIES } from './topbarCategories';
import { useTopBarPreferences } from './useTopBarPreferences';
import { useTopBarData } from './useTopBarData';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'useTopBarDataPoints' });

export function useTopBarDataPoints() {
  /**
   * `setCategoryEnabled` was already written, already persisted to
   * localStorage, and simply never destructured here — so the settings popup
   * offered a switch for every marquee category and flipping one did nothing
   * but leave a `// TODO` in its handler. The capability existed; only the
   * wire to it was missing.
   */
  const { preferences, setCategoryEnabled } = useTopBarPreferences();

  // Use all real data from useTopBarData - includes comprehensive energy intelligence
  const {
    // Existing categories
    commodities,
    indices,
    crypto,
    forex,
    economic,
    news,
    sentiment,
    
    // New energy intelligence categories
    energySecurity,
    powerGrid,
    renewables,
    marketIntelligence,
    supplyChain,
    strategicFuels,
    tradeBalance,
    baseloadPower,
    
    // State management
    error,
    
    // Enhanced progressive state
    loadingStates,
    dataAvailability
  } = useTopBarData();

  // Compose data points for the marquee with comprehensive energy intelligence and enhanced state handling
  const dataPoints = useMemo(() => {
    // Never return empty array based on loading - always show available data
    try {
      return TOPBAR_CATEGORIES.filter(cat => preferences.enabledCategories[cat.id])
        .map(cat => {
          let value = '';
          let isLoading = loadingStates[cat.id] || false;
          let hasError = false;
          let priority: 'critical' | 'important' | 'standard' = 'standard';
          
          // Determine priority based on category
          if (['energy-security', 'power-grid', 'strategic-fuels'].includes(cat.id)) {
            priority = 'critical';
          } else if (['market-intelligence', 'renewables', 'supply-chain'].includes(cat.id)) {
            priority = 'important';
          }
          
          try {
            switch (cat.id) {
              // Existing categories
              case 'commodities': value = commodities || 'N/A'; break;
              case 'indices': value = indices || 'N/A'; break;
              case 'crypto': value = crypto || 'N/A'; break;
              case 'forex': value = forex || 'N/A'; break;
              case 'economic': value = economic || 'N/A'; break;
              case 'news': value = news || 'N/A'; break;
              case 'sentiment': value = sentiment || 'N/A'; break;
              
              // New energy intelligence categories
              case 'energy-security': value = energySecurity || 'N/A'; break;
              case 'power-grid': value = powerGrid || 'N/A'; break;
              case 'renewables': value = renewables || 'N/A'; break;
              case 'market-intelligence': value = marketIntelligence || 'N/A'; break;
              case 'supply-chain': value = supplyChain || 'N/A'; break;
              case 'strategic-fuels': value = strategicFuels || 'N/A'; break;
              case 'trade-balance': value = tradeBalance || 'N/A'; break;
              case 'baseload-power': value = baseloadPower || 'N/A'; break;
              
              default: 
                log.warn(`Unknown category ID: ${cat.id}`);
                value = 'N/A';
                hasError = true;
            }
          } catch (valueError) {
            log.error(`Error processing category ${cat.id}:`, valueError);
            value = 'Error';
            hasError = true;
          }
          
          // Check if data is actually loading (not just N/A)
          if (value === 'Loading...' || (value === 'N/A' && !dataAvailability[cat.id])) {
            isLoading = true;
          }
          
          return { 
            id: cat.id, 
            label: cat.label, 
            icon: cat.icon, 
            value: value || 'N/A',
            isLoading,
            hasError,
            priority
          };
        });
    } catch (error) {
      log.error('Error composing dataPoints:', error);
      return []; // Return empty array on error to prevent UI crash
    }
  }, [
    preferences.enabledCategories, 
    // Existing categories
    commodities, indices, crypto, forex, economic, news, sentiment, 
    // New energy intelligence categories
    energySecurity, powerGrid, renewables, marketIntelligence, 
    supplyChain, strategicFuels, tradeBalance, baseloadPower, 
    // Enhanced state
    loadingStates, dataAvailability
  ]);

  return { dataPoints, preferences, setCategoryEnabled, error };
}
