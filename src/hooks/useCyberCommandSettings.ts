import { useSyncExternalStore } from 'react';
import { settingsStorage } from '../utils/settingsStorage';
import type { MarkerStyle, MarkerStyleChoices } from '../components/Globe/markerStyles';
import type { GlobeLayerId } from '../components/Globe/Hooks/useGlobeLayerControl';
import type { LensId } from '../services/intel/bigThreeLenses';

// AI-NOTE: Hook to manage ALL CyberCommand visualization settings with localStorage persistence
// Updated to support all 5 visualization types: IntelReports, CyberThreats, DigitalAssets, CommHubs, Timelines

export interface CyberCommandConfig {
  // Intel Reports settings
  intelReports: {
    overlayOpacity: number; // 0-100
    reportFiltering: {
      showCritical: boolean;
      showHigh: boolean;
      showMedium: boolean;
      showLow: boolean;
      /** Reports nobody assigned a priority to. Distinct from showLow. */
      showUnset: boolean;
    };
    autoRefresh: boolean;
    refreshInterval: number; // minutes
    /** How many reports the globe draws: 50 to start, null for Unlimited (BA5, BA7). */
    maxReports: number | null;
    /**
     * Whether each glyph wears its category's emblem (BA14, BA15). Absent reads
     * as on: a setting saved before there was a choice has no field (reportLook).
     */
    categoryEmblems?: boolean;
    /**
     * The big-three lenses the person focuses on (D-CT, CT5): only reports carrying one of these
     * `lens:*` tags are drawn and listed. Absent or empty is All, so a setting saved before there
     * was a choice needs no migration. Read through readLensChoice.
     */
    lenses?: LensId[];
    showTimestamps: boolean;
    showSources: boolean;
  };

  // Cyber Threats settings — real attack indicators (was "cyberAttacks"; CyberThreats
  // is now the umbrella mode name, see VisualizationModeContext.tsx). The old, fully
  // synthetic cyberThreats config block (heat map/C2/botnet toggles wired to mock data
  // only) was deleted along with the rest of that implementation.
  cyberThreats: {
    overlayOpacity: number; // 0-100
    alertThreshold: number; // 1-10 severity scale
    showDefenses: boolean;
    autoCorrelation: boolean;
    // One real sub-mode, N independently-toggled real layers — same shape as
    // GeoPolitical's ConflictZones (useConflictZones3D.ts's layerTypes). indicators is
    // the existing real per-country attack-cluster markers, defaults on (preserves
    // existing behavior). density/enrichment/knownGroups are new layers, default off —
    // same "don't surprise existing users with a new pinned overlay" stance the other
    // new overlays added this session already take.
    layerTypes: {
      indicators: boolean;
      density: boolean;
      enrichment: boolean;
      knownGroups: boolean;
    };
    // Matches the real AttackType union (src/types/CyberAttacks.ts) in full — previously
    // only 5 of the 10 real types were exposed (missing APT/Botnet/WebAttack/
    // NetworkIntrusion/Unknown), an incomplete-relative-to-reality set from before this
    // mode carried real data at all.
    attackFiltering: {
      showDDoS: boolean;
      showMalware: boolean;
      showPhishing: boolean;
      showDataBreach: boolean;
      showRansomware: boolean;
      showAPT: boolean;
      showBotnet: boolean;
      showWebAttack: boolean;
      showNetworkIntrusion: boolean;
      showUnknown: boolean;
    };
    refreshInterval: number; // seconds (real-time updates)
    maxAttacks: number;
    showAttribution: boolean;
    impactVisualization: boolean;
  };

  // Digital Assets settings (NEW - Phase 3 Priority 3) 
  digitalAssets: {
    overlayOpacity: number; // 0-100
    showBlockchainNodes: boolean;
    showCryptoExchanges: boolean;
    showDeFiProtocols: boolean;
    showSmartContracts: boolean;
    showCrosschainBridges: boolean;
    showNFTMarketplaces: boolean;
    showDAOs: boolean;
    vulnerabilityAlerts: boolean;
    securityScoring: boolean;
    assetFiltering: {
      showMajorChains: boolean;
      showAltcoins: boolean;
      showTestnets: boolean;
      showStablecoins: boolean;
    };
    refreshInterval: number; // minutes
    maxAssets: number;
    showLabels: boolean;
    riskVisualization: boolean;
  };

  // Communication Hubs settings — real submarine cable infrastructure
  // (SubmarineCableService.ts / useCommHubs3D.ts). Replaces the old, fully aspirational
  // config below (SIGINT/cell-tower/classification-filter toggles with zero real backing)
  // the same way CyberThreats' old synthetic config was replaced — see that block's own
  // comment above for the precedent.
  commHubs: {
    // One real sub-mode, N independently-toggled real layers — same shape as
    // CyberThreats' layerTypes. cables/landingPoints are this sub-mode's first real
    // content, default on; connectivity is a derived analytical overlay, default off
    // (see useCommHubs3D.ts's own layerTypes default).
    layerTypes: {
      cables: boolean;
      landingPoints: boolean;
      connectivity: boolean;
    };
    // Real planned-vs-active status is always rendered honestly (dashed vs. solid); this
    // only controls whether planned (not-yet-confirmed-active) cables are shown at all.
    showPlannedCables: boolean;
  };
  
  // Legacy Timeline settings (keeping for backward compatibility)
  timelines: {
    timeRange: number; // hours
    showEvents: boolean;
    showTrends: boolean;
    eventCategories: {
      security: boolean;
      geopolitical: boolean;
      economic: boolean;
      environmental: boolean;
    };
    animationSpeed: number; // 0.1-2.0
    markerSize: number; // 0.5-2.0
  };
  
  // Legacy Crisis Zones settings (keeping for backward compatibility)
  crisisZones: {
    alertLevel: 'low' | 'medium' | 'high' | 'critical';
    showRadius: boolean;
    radiusScale: number; // 0.5-3.0
    blinkAlerts: boolean;
    soundAlerts: boolean;
    zoneCategories: {
      conflict: boolean;
      natural: boolean;
      humanitarian: boolean;
      technological: boolean;
    };
    intensityThreshold: number; // 0-100
  };
  
  /*
   * How each layer draws its marks (decision D-F, step 6, part 1).
   *
   * Holds only what a person picked. Absent means "whatever that layer draws
   * by default" — read it through resolveMarkerStyle, never directly, so a
   * layer added to the catalogue later still resolves for a returning user
   * whose stored map predates it. See markerStyles.ts for why a materialised
   * map would go stale one level below this merge.
   */
  markerStyles: MarkerStyleChoices;

  // Global CyberCommand settings
  globalSettings: {
    darkMode: boolean;
    showGrid: boolean;
    gridOpacity: number; // 0-100
    interfaceScale: number; // 0.8-1.5
    enableAnimations: boolean;
    highlightActive: boolean;
  };
}

const defaultConfig: CyberCommandConfig = {
  intelReports: {
    overlayOpacity: 80,
    reportFiltering: {
      showCritical: true,
      showHigh: true,
      showMedium: true,
      // On by default since the priority fix (decision D-F, step 6, part 4).
      // Before it, no report from a relay could classify as `low` at all — the
      // classifier compared uppercase tags and the ingest lowercases them — so
      // every #low post was drawn as `unset`. Leaving this false would have made
      // the fix silently remove reports from the globe. See the v3 -> v4
      // migration for the returning-visitor half of the same argument.
      showLow: true,
      // Shown by default. Hiding a report because nobody classified it is not
      // the filter doing its job; it is the filter inventing a classification.
      showUnset: true
    },
    autoRefresh: true,
    refreshInterval: 2,
    maxReports: 50,
    categoryEmblems: true,
    showTimestamps: true,
    showSources: true
  },

  // CyberThreats default configuration (real attack indicators)
  cyberThreats: {
    overlayOpacity: 90,
    alertThreshold: 5,
    showDefenses: true,
    autoCorrelation: true,
    layerTypes: {
      indicators: true,
      density: false,
      enrichment: false,
      knownGroups: false
    },
    attackFiltering: {
      showDDoS: true,
      showMalware: true,
      showPhishing: true,
      showDataBreach: true,
      showRansomware: true,
      showAPT: true,
      showBotnet: true,
      showWebAttack: true,
      showNetworkIntrusion: true,
      showUnknown: true
    },
    refreshInterval: 5, // 5 seconds for real-time
    maxAttacks: 100,
    showAttribution: true,
    impactVisualization: true
  },

  // NEW: DigitalAssets default configuration
  digitalAssets: {
    overlayOpacity: 60,
    showBlockchainNodes: true,
    showCryptoExchanges: true,
    showDeFiProtocols: true,
    showSmartContracts: false,
    showCrosschainBridges: true,
    showNFTMarketplaces: false,
    showDAOs: true,
    vulnerabilityAlerts: true,
    securityScoring: true,
    assetFiltering: {
      showMajorChains: true,
      showAltcoins: false,
      showTestnets: false,
      showStablecoins: true
    },
    refreshInterval: 10, // 10 minutes  
    maxAssets: 500,
    showLabels: true,
    riskVisualization: true
  },

  // CommHubs default configuration (real submarine cable infrastructure)
  commHubs: {
    layerTypes: {
      cables: true,
      landingPoints: true,
      connectivity: false
    },
    showPlannedCables: true
  },
  
  // Legacy configurations (kept for backward compatibility)
  timelines: {
    timeRange: 48,
    showEvents: true,
    showTrends: true,
    eventCategories: {
      security: true,
      geopolitical: true,
      economic: false,
      environmental: false
    },
    animationSpeed: 1.0,
    markerSize: 1.0
  },
  
  crisisZones: {
    alertLevel: 'medium',
    showRadius: true,
    radiusScale: 1.0,
    blinkAlerts: true,
    soundAlerts: false,
    zoneCategories: {
      conflict: true,
      natural: true,
      humanitarian: true,
      technological: false
    },
    intensityThreshold: 30
  },
  
  // No choices yet: every layer draws its default. See markerStyles.ts.
  markerStyles: {},

  globalSettings: {
    darkMode: true,
    showGrid: false,
    gridOpacity: 20,
    interfaceScale: 1.0,
    enableAnimations: true,
    highlightActive: true
  }
};

const STORAGE_KEY = 'cyber-command-settings';

const SETTINGS_VERSION = 4;

/*
 * ─── ONE STORE, NOT ONE COPY PER COMPONENT ─────────────────────────────────
 *
 * This was a useState per caller, loaded from storage on mount. Three
 * components call it — the globe, the share handle and SettingsInitializer —
 * so each held its own copy, and a change made through one never reached the
 * others until a reload. Found 2026-09-25 (decision D-F, section 18): the
 * share handle's `setMarkerStyle` wrote to the handle's private copy, the
 * globe kept drawing from its own, and Mecha Jono's
 * `setMarkerStyle('IntelReports', …)` returned normally and changed nothing.
 * The globe's own style buttons worked only because they share the globe's
 * copy.
 *
 * So the config lives here, once, and every caller subscribes to it. It is
 * read from storage when the first caller subscribes and dropped when the last
 * one leaves, so a fresh mount still reads what storage holds — which is what
 * the migration tests, and a remount after storage changed, rely on.
 */
let shared: CyberCommandConfig | null = null;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadConfig(): CyberCommandConfig {
  return settingsStorage.loadSettings(STORAGE_KEY, defaultConfig, {
    version: SETTINGS_VERSION,
    migrations: {
      // v1 -> v2: commHubs went from a fully aspirational config (SIGINT/cell-tower/
      // classification-filter toggles with zero real backing) to a real
      // layerTypes-based shape. loadSettings only does a SHALLOW top-level merge
      // ({...defaultData, ...data}) — a v1-shaped commHubs object would otherwise
      // survive intact and clobber the new default wholesale, crashing every reader of
      // config.commHubs.layerTypes for any returning user with settings saved before
      // this change. Detected by the new shape's tell: a real config always has
      // layerTypes; the old one never did.
      2: (data: CyberCommandConfig) => {
        const commHubs = data?.commHubs as unknown;
        if (commHubs && typeof commHubs === 'object' && !('layerTypes' in commHubs)) {
          const { commHubs: _oldShapeCommHubs, ...rest } = data;
          return rest as CyberCommandConfig;
        }
        return data;
      },
      // v2 -> v3: reportFiltering gained showUnset, separating "nobody stated a
      // priority" from "someone stated low". Same shallow-merge trap as above,
      // and it is the whole point of this migration: a returning user's stored
      // intelReports object survives WHOLE, so changing defaultConfig alone
      // reaches nobody who has ever opened the settings panel — and they would
      // keep silently losing every report the app creates for them.
      3: (data: CyberCommandConfig) => {
        const filtering = data?.intelReports?.reportFiltering as unknown;
        if (filtering && typeof filtering === 'object' && !('showUnset' in filtering)) {
          return {
            ...data,
            intelReports: {
              ...data.intelReports,
              reportFiltering: { ...data.intelReports.reportFiltering, showUnset: true }
            }
          } as CyberCommandConfig;
        }
        return data;
      },
      // v3 -> v4: showLow becomes true, because the priority fix would
      // otherwise start hiding reports that are drawn today.
      //
      // getIntelReportPriority compared exact UPPERCASE tag membership while
      // the ingest lowercases every hashtag, so a post tagged #low classified
      // as `unset` and was drawn. Fixing the comparison moves it into the
      // `low` bucket, which showLow's false default drops — the same silent
      // loss the v2 -> v3 migration above exists to prevent.
      //
      // The caveat, stated: `false` is both the default and a real choice, and
      // storage cannot tell them apart, so this may override a deliberate
      // setting for someone who typed LOW by hand into a tag field and turned
      // the filter off. Silently dropping reports from the network is the
      // wider failure. Keyed on the version it upgrades FROM, so someone who
      // turns showLow off AFTER the fix — a choice about reports they can
      // actually see — keeps it off.
      4: (data: CyberCommandConfig) => {
        const filtering = data?.intelReports?.reportFiltering as unknown;
        if (filtering && typeof filtering === 'object') {
          return {
            ...data,
            intelReports: {
              ...data.intelReports,
              reportFiltering: { ...data.intelReports.reportFiltering, showLow: true }
            }
          } as CyberCommandConfig;
        }
        return data;
      }
    }
  });
}

function save(config: CyberCommandConfig): void {
  // Nothing chosen is nothing to store: a default written back would freeze
  // today's defaults into storage for a visitor who never picked them.
  if (JSON.stringify(config) === JSON.stringify(defaultConfig)) return;
  settingsStorage.saveSettings(STORAGE_KEY, config, { version: SETTINGS_VERSION });
}

function flushSave(): void {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  if (shared) save(shared);
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) shared = loadConfig();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      // The last caller left: write what is pending now rather than into a
      // later session's storage, then forget, so the next mount reads storage.
      flushSave();
      shared = null;
    }
  };
}

function getSnapshot(): CyberCommandConfig {
  return shared ?? defaultConfig;
}

function update(change: (prev: CyberCommandConfig) => CyberCommandConfig): void {
  shared = change(shared ?? loadConfig());
  // Debounced: a slider drag is dozens of changes and one write.
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (shared) save(shared);
  }, 500);
  for (const listener of [...listeners]) listener();
}

export const useCyberCommandSettings = () => {
  const config = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setConfig = update;

  const updateConfig = (updates: Partial<CyberCommandConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const updateIntelReports = (updates: Partial<CyberCommandConfig['intelReports']>) => {
    setConfig(prev => ({
      ...prev,
      intelReports: { ...prev.intelReports, ...updates }
    }));
  };

  // CyberThreats update function (real attack indicators)
  const updateCyberThreats = (updates: Partial<CyberCommandConfig['cyberThreats']>) => {
    setConfig(prev => ({
      ...prev,
      cyberThreats: { ...prev.cyberThreats, ...updates }
    }));
  };

  // NEW: DigitalAssets update function
  const updateDigitalAssets = (updates: Partial<CyberCommandConfig['digitalAssets']>) => {
    setConfig(prev => ({
      ...prev,
      digitalAssets: { ...prev.digitalAssets, ...updates }
    }));
  };

  // NEW: CommHubs update function
  const updateCommHubs = (updates: Partial<CyberCommandConfig['commHubs']>) => {
    setConfig(prev => ({
      ...prev,
      commHubs: { ...prev.commHubs, ...updates }
    }));
  };

  // Legacy update functions (kept for backward compatibility)
  const updateTimelines = (updates: Partial<CyberCommandConfig['timelines']>) => {
    setConfig(prev => ({
      ...prev,
      timelines: { ...prev.timelines, ...updates }
    }));
  };

  const updateCrisisZones = (updates: Partial<CyberCommandConfig['crisisZones']>) => {
    setConfig(prev => ({
      ...prev,
      crisisZones: { ...prev.crisisZones, ...updates }
    }));
  };

  /**
   * Pick how one layer draws, leaving every other layer alone.
   *
   * Writes a single key rather than a whole map, which is what keeps a
   * returning user's stored choices from freezing the layer catalogue as it
   * stood the day they chose.
   */
  const updateMarkerStyle = (layerId: GlobeLayerId, style: MarkerStyle) => {
    setConfig(prev => ({
      ...prev,
      markerStyles: { ...prev.markerStyles, [layerId]: style }
    }));
  };

  const updateGlobalSettings = (updates: Partial<CyberCommandConfig['globalSettings']>) => {
    setConfig(prev => ({
      ...prev,
      globalSettings: { ...prev.globalSettings, ...updates }
    }));
  };

  const resetConfig = () => {
    setConfig(() => defaultConfig);
  };

  // UPDATED: Support all visualization types in reset
  const resetSubMode = (subMode: 'intelReports' | 'cyberThreats' | 'digitalAssets' | 'commHubs' | 'timelines' | 'crisisZones' | 'globalSettings') => {
    setConfig(prev => ({
      ...prev,
      [subMode]: defaultConfig[subMode]
    }));
  };

  return {
    config,
    updateConfig,
    
    // All visualization type update functions
    updateIntelReports,
    updateCyberThreats,
    updateDigitalAssets,
    updateCommHubs,
    updateMarkerStyle,
    
    // Legacy update functions (backward compatibility)
    updateTimelines,
    updateCrisisZones,
    updateGlobalSettings,
    
    // Reset functions
    resetConfig,
    resetSubMode,
    
    // UPDATED: Convenience getter supporting all visualization types
    currentSubModeConfig: (subMode: 'IntelReports' | 'CyberThreats' | 'DigitalAssets' | 'CommHubs' | 'Timelines' | 'CrisisZones') => {
      switch (subMode) {
        case 'IntelReports':
          return config.intelReports;
        case 'CyberThreats':
          return config.cyberThreats;
        case 'DigitalAssets':
          return config.digitalAssets;
        case 'CommHubs':
          return config.commHubs;
        case 'Timelines':
          return config.timelines;
        case 'CrisisZones':
          return config.crisisZones;
        default:
          return config.intelReports; // Fallback to IntelReports
      }
    },
    
    // Enhanced convenience getters
    isAlertsEnabled: config.crisisZones.blinkAlerts || config.crisisZones.soundAlerts,
    effectiveOpacity: config.intelReports.overlayOpacity / 100,
    animationSettings: {
      enabled: config.globalSettings.enableAnimations,
      speed: config.timelines.animationSpeed
    },
    
    // NEW: Additional convenience getters for new visualization types
    cyberThreatsRealTime: config.cyberThreats.refreshInterval <= 10, // Real-time if <= 10 seconds
    assetSecurity: config.digitalAssets.securityScoring
  };
};

export default useCyberCommandSettings;
