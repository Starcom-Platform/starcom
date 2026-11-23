import { subModeAvailable } from '../config/buildGates';
import React, { useContext, useState, useEffect, useRef } from 'react';
import { modeFromSearch } from './visualizationModeFromUrl';
import { settingsStorage } from '../utils/settingsStorage';
import { pollerRegistry } from '../services/pollerRegistry';
import { makeModeScope } from '../services/pollerScopes';
import { psiKitOn } from '../services/psiWatch/psiKitSwitch';

// Extend VisualizationMode to include sub-modes
// National Territories was removed as a GeoPolitical subMode — it's rendered as a
// mode-independent global overlay now (see nationalTerritoriesOverlayEnabled in
// VisualizationOverlayContext), not gated by which primary mode is selected.
/**
 * Raver Watch: Mecha Jono's safety notes for people at dance events (globe
 * record, section 19). Six layers by their names (RW5); the last four wait on
 * sources that are not online yet, and say so in the layer catalogue.
 */
type RaverWatchSubMode = 'DrugCheckAlerts' | 'SceneIncidents' | 'SceneEvents' | 'HeatRisk' | 'RaverMissions' | 'HarmReductionSites';
/**
 * Hero Watch: who is responding, and where (decision D-HW). Mecha Jono's lifeboats, relief and field
 * missions, and RLSH, which moved here from Intel Watch (HW1).
 */
type HeroWatchSubMode = 'Lifeboats' | 'Relief' | 'FieldMissions' | 'RLSH';
/**
 * AI Watch: Mecha Jono's Terminator Watch notes, by area (decision D-AW, AW2): incidents, frontier AI,
 * AI in war, safety and security.
 */
type AIWatchSubMode = 'AiIncidents' | 'AiFrontier' | 'AiWar' | 'AiSafety';
/**
 * Missions (decision D-MF, step 5): the missions open to take, each at the place it names, the rest
 * listed as done from anywhere (MF16–MF17).
 */
type MissionsSubMode = 'OpenMissions' | 'CampaignsOperations' | 'SafetyWindows';
/**
 * Psi Watch (decision D-PW, PW9): Mecha Jono's five PsiOps layers by the kit's ids, and Starcom's ψ field and
 * magnetic shield. Shown unless `?psi=off` hid it in the tab (PW19; open to everyone from 1 Nov, OR6).
 */
type PsiWatchSubMode = 'PsiLines' | 'PsiField' | 'PsiZones' | 'PsiRifts' | 'PsiWindows' | 'PsiModel' | 'MagneticShield';

export type VisualizationMode =
  | { mode: 'CyberCommand'; subMode: 'IntelReports' | 'CyberThreats' | 'Satellites' | 'CommHubs' }
  | { mode: 'GeoPolitical'; subMode: 'DiplomaticEvents' | 'ResourceZones' | 'ConflictZones' | 'WarConflict' | 'CivilUnrest' | 'ProtestSurges' }
  | { mode: 'EcoNatural'; subMode: 'SpaceWeather' | 'EcologicalDisasters' | 'EarthWeather' }
  | { mode: 'RaverWatch'; subMode: RaverWatchSubMode }
  | { mode: 'HeroWatch'; subMode: HeroWatchSubMode }
  | { mode: 'AIWatch'; subMode: AIWatchSubMode }
  | { mode: 'Missions'; subMode: MissionsSubMode }
  | { mode: 'PsiWatch'; subMode: PsiWatchSubMode };

// Interface for tracking last selected submode for each primary mode
interface LastSelectedSubmodes {
  CyberCommand: 'IntelReports' | 'CyberThreats' | 'Satellites' | 'CommHubs';
  GeoPolitical: 'DiplomaticEvents' | 'ResourceZones' | 'ConflictZones' | 'WarConflict' | 'CivilUnrest' | 'ProtestSurges';
  EcoNatural: 'SpaceWeather' | 'EcologicalDisasters' | 'EarthWeather';
  RaverWatch: RaverWatchSubMode;
  HeroWatch: HeroWatchSubMode;
  AIWatch: AIWatchSubMode;
  Missions: MissionsSubMode;
  PsiWatch: PsiWatchSubMode;
}

// Default visualization mode and submodes
const DEFAULT_MODE: VisualizationMode = { mode: 'CyberCommand', subMode: 'IntelReports' };
const DEFAULT_SUBMODES: LastSelectedSubmodes = {
  CyberCommand: 'IntelReports',
  GeoPolitical: 'DiplomaticEvents',
  EcoNatural: 'EcologicalDisasters',
  RaverWatch: 'DrugCheckAlerts',
  HeroWatch: 'Lifeboats',
  AIWatch: 'AiIncidents',
  Missions: 'OpenMissions',
  PsiWatch: 'PsiLines'
};

// Existing users may have 'NationalTerritories' (or any other stale value) persisted
// from before the GeoPolitical subMode union was narrowed — settingsStorage.loadSettings
// does no schema validation, so an invalid string would otherwise flow through as a
// VisualizationMode/LastSelectedSubmodes value untyped at runtime.
const VALID_GEOPOLITICAL_SUBMODES = new Set(['DiplomaticEvents', 'ResourceZones', 'ConflictZones', 'WarConflict', 'CivilUnrest', 'ProtestSurges']);
const VALID_RAVERWATCH_SUBMODES = new Set<string>(['DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk', 'RaverMissions', 'HarmReductionSites']);
const VALID_HEROWATCH_SUBMODES = new Set<string>(['Lifeboats', 'Relief', 'FieldMissions', 'RLSH']);
const VALID_AIWATCH_SUBMODES = new Set<string>(['AiIncidents', 'AiFrontier', 'AiWar', 'AiSafety']);
const VALID_MISSIONS_SUBMODES = new Set<string>(['OpenMissions', 'CampaignsOperations', 'SafetyWindows']);
const VALID_PSIWATCH_SUBMODES = new Set<string>(['PsiLines', 'PsiField', 'PsiZones', 'PsiRifts', 'PsiWindows', 'PsiModel', 'MagneticShield']);

function sanitizeMode(mode: VisualizationMode): VisualizationMode {
  // A sub-mode this build does not show (D-CS, CS13) opens the mode's default.
  if (mode.mode === 'CyberCommand' && !subModeAvailable(mode.subMode)) {
    return { mode: 'CyberCommand', subMode: DEFAULT_SUBMODES.CyberCommand };
  }
  // RLSH moved from Intel Watch to Hero Watch (D-HW, HW1): a choice stored before the move opens there.
  if ((mode as { mode: string; subMode: string }).mode === 'CyberCommand' && (mode as { subMode: string }).subMode === 'RLSH') {
    return { mode: 'HeroWatch', subMode: 'RLSH' };
  }
  if (mode.mode === 'HeroWatch' && !VALID_HEROWATCH_SUBMODES.has(mode.subMode)) {
    return { mode: 'HeroWatch', subMode: DEFAULT_SUBMODES.HeroWatch };
  }
  if (mode.mode === 'AIWatch' && !VALID_AIWATCH_SUBMODES.has(mode.subMode)) {
    return { mode: 'AIWatch', subMode: DEFAULT_SUBMODES.AIWatch };
  }
  if (mode.mode === 'Missions' && !VALID_MISSIONS_SUBMODES.has(mode.subMode)) {
    return { mode: 'Missions', subMode: DEFAULT_SUBMODES.Missions };
  }
  // Psi Watch is behind its switch (PW19): a choice stored with the switch on opens the default without it.
  if (mode.mode === 'PsiWatch') {
    if (!psiKitOn()) return DEFAULT_MODE;
    if (!VALID_PSIWATCH_SUBMODES.has(mode.subMode)) return { mode: 'PsiWatch', subMode: DEFAULT_SUBMODES.PsiWatch };
  }
  if (mode.mode === 'GeoPolitical' && !VALID_GEOPOLITICAL_SUBMODES.has(mode.subMode)) {
    return { mode: 'GeoPolitical', subMode: DEFAULT_SUBMODES.GeoPolitical };
  }
  if (mode.mode === 'RaverWatch' && !VALID_RAVERWATCH_SUBMODES.has(mode.subMode)) {
    return { mode: 'RaverWatch', subMode: DEFAULT_SUBMODES.RaverWatch };
  }
  return mode;
}

function sanitizeSubmodes(submodes: LastSelectedSubmodes): LastSelectedSubmodes {
  let sane = submodes;
  if (!VALID_GEOPOLITICAL_SUBMODES.has(sane.GeoPolitical)) {
    sane = { ...sane, GeoPolitical: DEFAULT_SUBMODES.GeoPolitical };
  }
  // A stored choice that is not one of its layers. One stored before Raver Watch
  // existed names none, and settingsStorage's merge fills that from the defaults.
  if (!VALID_RAVERWATCH_SUBMODES.has(sane.RaverWatch)) {
    sane = { ...sane, RaverWatch: DEFAULT_SUBMODES.RaverWatch };
  }
  // RLSH, last chosen under Intel Watch before it moved: Hero Watch remembers it, Intel Watch its default.
  if ((sane.CyberCommand as string) === 'RLSH') {
    sane = { ...sane, CyberCommand: DEFAULT_SUBMODES.CyberCommand, HeroWatch: 'RLSH' };
  }
  if (!VALID_HEROWATCH_SUBMODES.has(sane.HeroWatch)) {
    sane = { ...sane, HeroWatch: DEFAULT_SUBMODES.HeroWatch };
  }
  // One stored before AI Watch existed names none, and settingsStorage's merge fills that from the defaults.
  if (!VALID_AIWATCH_SUBMODES.has(sane.AIWatch)) {
    sane = { ...sane, AIWatch: DEFAULT_SUBMODES.AIWatch };
  }
  // One stored before Missions was a mode names none, and settingsStorage's merge fills that from the defaults.
  if (!VALID_MISSIONS_SUBMODES.has(sane.Missions)) {
    sane = { ...sane, Missions: DEFAULT_SUBMODES.Missions };
  }
  if (!VALID_PSIWATCH_SUBMODES.has(sane.PsiWatch)) {
    sane = { ...sane, PsiWatch: DEFAULT_SUBMODES.PsiWatch };
  }
  return sane;
}

// Storage keys for persistence
const VISUALIZATION_MODE_STORAGE_KEY = 'visualization-mode';
const LAST_SUBMODES_STORAGE_KEY = 'last-selected-submodes';

// Create a context for VisualizationMode
interface VisualizationModeContextProps {
  visualizationMode: VisualizationMode;
  setVisualizationMode: (mode: VisualizationMode) => void;
  setPrimaryMode: (mode: VisualizationMode['mode']) => void;
  resetVisualizationMode: () => void;
}

// Ensure React is properly loaded before creating context
const VisualizationModeContext = React.createContext<VisualizationModeContextProps | undefined>(undefined);

// Provider component
export const VisualizationModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize with defaults first, then load from storage
  const [visualizationMode, setVisualizationModeState] = useState<VisualizationMode>(DEFAULT_MODE);
  const [lastSelectedSubmodes, setLastSelectedSubmodesState] = useState<LastSelectedSubmodes>(DEFAULT_SUBMODES);
  const [isInitialized, setIsInitialized] = useState(false);
  const previousModeRef = useRef<VisualizationMode | null>(null);

  // Load persisted settings after component mounts
  useEffect(() => {
    try {
      const persistedMode = sanitizeMode(settingsStorage.loadSettings(VISUALIZATION_MODE_STORAGE_KEY, DEFAULT_MODE));
      const persistedSubmodes = sanitizeSubmodes(settingsStorage.loadSettings(LAST_SUBMODES_STORAGE_KEY, DEFAULT_SUBMODES));

      /*
       * A link outranks what this browser happened to choose last.
       *
       * Without this there was no address for "the globe, showing space
       * weather": every link landed on the recipient's stored mode, which is
       * the opposite of what a link is for. It also gave an autonomous agent a
       * way in that needs no script.
       *
       * Read ONCE here and never written back — writing on every change would
       * fight the application router for the address bar and fill a person's
       * history with entries they did not ask for. An unrecognised value
       * returns null and the stored mode stands, so a typo shows the globe
       * rather than an error.
       */
      const fromUrl = typeof window !== 'undefined'
        ? modeFromSearch(window.location.search)
        : null;

      setVisualizationModeState(fromUrl ? sanitizeMode(fromUrl as VisualizationMode) : persistedMode);
      setLastSelectedSubmodesState(persistedSubmodes);
      setIsInitialized(true);
      
      console.log('VisualizationModeProvider: Initialized with', fromUrl ?? persistedMode);
    } catch (error) {
      console.warn('VisualizationModeProvider: Failed to load settings, using defaults', error);
      setIsInitialized(true);
    }
  }, []);

  // Enhanced setter that also persists to storage
  const setVisualizationMode = (mode: VisualizationMode) => {
    setVisualizationModeState(mode);
    settingsStorage.saveSettings(VISUALIZATION_MODE_STORAGE_KEY, mode);
    
    // Update the last selected submode for this primary mode
    setLastSelectedSubmodesState(prev => {
      const updated = { ...prev, [mode.mode]: mode.subMode };
      settingsStorage.saveSettings(LAST_SUBMODES_STORAGE_KEY, updated);
      return updated;
    });
  };

  // New function to set primary mode while preserving last selected submode
  const setPrimaryMode = (mode: VisualizationMode['mode']) => {
    const lastSubMode = lastSelectedSubmodes[mode];
    const newVisualizationMode = { mode, subMode: lastSubMode } as VisualizationMode;
    setVisualizationMode(newVisualizationMode);
  };

  const resetVisualizationMode = () => {
    setVisualizationMode(DEFAULT_MODE);
    setLastSelectedSubmodesState(DEFAULT_SUBMODES);
    settingsStorage.saveSettings(LAST_SUBMODES_STORAGE_KEY, DEFAULT_SUBMODES);
  };

  useEffect(() => {
    // Only log in dev mode to reduce console noise
    if (import.meta.env.DEV) {
      console.log(`📊 VisualizationMode changed to: ${visualizationMode.mode}, SubMode: ${visualizationMode.subMode}`);
    }
  }, [visualizationMode]);

  useEffect(() => {
    if (!isInitialized) {
      previousModeRef.current = visualizationMode;
      return;
    }
    const previous = previousModeRef.current;
    if (previous && previous.mode !== visualizationMode.mode) {
      pollerRegistry.stopAll(makeModeScope(previous.mode));
    }
    previousModeRef.current = visualizationMode;
  }, [visualizationMode.mode, isInitialized, visualizationMode]);

  return (
    <VisualizationModeContext.Provider value={{ 
      visualizationMode, 
      setVisualizationMode, 
      setPrimaryMode,
      resetVisualizationMode 
    }}>
      {children}
    </VisualizationModeContext.Provider>
  );
};

/** The context, or null where no provider is above: for a part shown both in and outside the globe's tree. */
export const useVisualizationModeOptional = () => useContext(VisualizationModeContext);

// Hook to use the VisualizationMode context
export const useVisualizationMode = () => {
  const context = useContext(VisualizationModeContext);
  if (!context) {
    throw new Error('useVisualizationMode must be used within a VisualizationModeProvider');
  }
  return context;
};