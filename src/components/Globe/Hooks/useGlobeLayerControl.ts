/**
 * useGlobeLayerControl — Multi-layer visibility management for the 3D Globe
 *
 * The existing VisualizationMode system uses a single {mode, subMode} pair,
 * meaning only ONE visualization layer can be "primary" at a time. This hook
 * adds an **overlay layer system** on top of that: operators can pin additional
 * layers to remain visible regardless of the current subMode.
 *
 * Architecture:
 * - The primary layer is always determined by VisualizationMode context
 * - Pinned layers remain visible across mode switches
 * - Each visualization hook can check `isLayerActive(layerId)` which returns
 *   true if the layer is either the primary subMode OR pinned
 * - State is shared via GlobeLayerControlProvider context so all consumers
 *   (Globe.tsx, the command palette, HUD corners) see the same pinned layers.
 *
 * This preserves backward compatibility: existing hooks that check
 * `visualizationMode.subMode === 'X'` still work. New code can use
 * `isLayerActive('X')` for multi-layer awareness.
 */

import { subModeAvailable } from '../../../config/buildGates';
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useVisualizationMode } from '../../../context/VisualizationModeContext';
import { publishDrawnGlobeLayers } from './drawnGlobeLayers';
import { psiKitOn } from '../../../services/psiWatch/psiKitSwitch';

/** All known globe layer identifiers (matches VisualizationMode subMode values) */
export type GlobeLayerId =
  // CyberCommand layers
  | 'IntelReports'
  | 'CyberThreats'
  | 'Satellites'
  | 'CommHubs'
  | 'RLSH'
  // GeoPolitical layers
  // NationalTerritories removed — it's a global overlay now (nationalTerritoriesOverlayEnabled
  // in VisualizationOverlayContext), not one of these mode-scoped pinnable layers. Its
  // isLayerActive() was never actually consulted by any renderer, so its Quick Access
  // pin was a no-op — removed there too, see GeopoliticalLayersPopup for its real settings.
  | 'DiplomaticEvents'
  | 'ResourceZones'
  | 'ConflictZones'
  | 'WarConflict'
  // Civil Unrest beside War & Conflict (D-CU): days of unrest, and protest surges apart (CU4)
  | 'CivilUnrest'
  | 'ProtestSurges'
  // EcoNatural layers
  | 'SpaceWeather'
  | 'EcologicalDisasters'
  | 'EarthWeather'
  // RaverWatch layers (globe record, section 19)
  | 'DrugCheckAlerts'
  | 'SceneIncidents'
  | 'SceneEvents'
  | 'HeatRisk'
  | 'RaverMissions'
  | 'HarmReductionSites'
  // Hero Watch's sections (decision D-HW); RLSH is its fourth.
  | 'Lifeboats'
  | 'Relief'
  | 'FieldMissions'
  // AI Watch's sections, by area (decision D-AW, AW2).
  | 'AiIncidents'
  | 'AiFrontier'
  | 'AiWar'
  | 'AiSafety'
  // Missions (decision D-MF, step 5): the open missions, at their places.
  | 'OpenMissions'
  | 'CampaignsOperations'
  // Safety windows (decision D-RR, RR1): recurring nights' windows in a city, never a person or a mark.
  | 'SafetyWindows'
  // Psi Watch (decision D-PW, PW9): the kit's five PsiOps layers, Starcom's ψ field and magnetic shield.
  | 'PsiLines'
  | 'PsiField'
  | 'PsiZones'
  | 'PsiRifts'
  | 'PsiWindows'
  | 'PsiModel'
  | 'MagneticShield';

/** The mode a layer belongs to. */
export type GlobeLayerCategory = 'CyberCommand' | 'GeoPolitical' | 'EcoNatural' | 'RaverWatch' | 'HeroWatch' | 'AIWatch' | 'Missions' | 'PsiWatch';

export interface GlobeLayerInfo {
  id: GlobeLayerId;
  label: string;
  category: GlobeLayerCategory;
  description: string;
  isPrimary: boolean;   // Currently the active subMode
  isPinned: boolean;    // Manually pinned by operator
  isActive: boolean;    // isPrimary || isPinned
  /** False for layers with no actual rendering behind them yet — pinning them
   * would be a no-op with no visible effect, so UI should say so rather than
   * silently accepting the pin. */
  isImplemented: boolean;
}

export interface UseGlobeLayerControlResult {
  /** All available layers with their current status */
  layers: GlobeLayerInfo[];

  /** Set of currently active layer IDs (primary + pinned) */
  activeLayers: Set<GlobeLayerId>;

  /** Check if a specific layer should be visible */
  isLayerActive: (layerId: GlobeLayerId) => boolean;

  /** Pin a layer so it stays visible across mode changes */
  pinLayer: (layerId: GlobeLayerId) => void;

  /** Unpin a layer */
  unpinLayer: (layerId: GlobeLayerId) => void;

  /** Toggle pin state */
  togglePin: (layerId: GlobeLayerId) => void;

  /** Clear all pinned layers */
  clearPins: () => void;

  /** Number of pinned layers */
  pinnedCount: number;
}

/** Static layer catalog */
const LAYER_CATALOG_ALL: Array<{
  id: GlobeLayerId;
  label: string;
  category: GlobeLayerCategory;
  description: string;
  /** Omit (or true) once the layer actually renders something; false means
   * pinning it is currently a no-op — see GlobeLayerInfo.isImplemented. */
  implemented?: boolean;
}> = [
  { id: 'IntelReports', label: 'Intel Reports', category: 'CyberCommand', description: '3D intel report markers on globe' },
  { id: 'CyberThreats', label: 'Cyber Threats', category: 'CyberCommand', description: 'Real attack indicators, density, and threat-intel enrichment' },
  { id: 'Satellites', label: 'Satellites', category: 'CyberCommand', description: 'Orbital satellite tracking' },
  { id: 'CommHubs', label: 'Comm Hubs', category: 'CyberCommand', description: 'Real submarine cable network — routes, landing points, and status' },
  { id: 'DiplomaticEvents', label: 'Diplomacy', category: 'GeoPolitical', description: 'Diplomatic event markers' },
  { id: 'ResourceZones', label: 'Resources', category: 'GeoPolitical', description: 'Resource extraction zones' },
  { id: 'ConflictZones', label: 'Conflict Zones', category: 'GeoPolitical', description: 'Armed conflict and humanitarian crisis markers' },
  { id: 'WarConflict', label: 'War & Conflict', category: 'GeoPolitical', description: "War news, item by item, over the world's wars shaded by intensity" },
  { id: 'CivilUnrest', label: 'Civil Unrest', category: 'GeoPolitical', description: 'Days of protest and unrest, by country and city, each crowd count beside its claimant' },
  { id: 'ProtestSurges', label: 'Protest surges', category: 'GeoPolitical', description: 'Surges in reporting of protest, by country: a surge in reporting, not in protest' },
  { id: 'SpaceWeather', label: 'Space Weather', category: 'EcoNatural', description: 'Solar wind, aurora, magnetopause' },
  { id: 'EcologicalDisasters', label: 'Eco Disasters', category: 'EcoNatural', description: 'Earthquake, volcanic, storm events' },
  { id: 'EarthWeather', label: 'Earth Weather', category: 'EcoNatural', description: 'Terrestrial weather systems' },
  /*
   * Raver Watch: Mecha Jono's safety notes for people at dance events, read from
   * The Record (globe record, section 19). The last four wait on sources that
   * are not online yet, so they say they are not built rather than show empty.
   */
  { id: 'DrugCheckAlerts', label: 'Drug-check alerts', category: 'RaverWatch', description: 'What drug-checking labs found circulating, where it applies' },
  { id: 'SceneIncidents', label: 'Scene incidents', category: 'RaverWatch', description: 'Heat, crowds, spiking and violence, closures at events' },
  { id: 'SceneEvents', label: 'Scene events', category: 'RaverWatch', description: 'Upcoming events, a week ahead, at their town, or at the venue when it is a public one' },
  { id: 'HeatRisk', label: 'Heat risk', category: 'RaverWatch', description: 'The NWS HeatRisk at towns with an event this week, from Orange up' },
  { id: 'RaverMissions', label: 'Raver missions', category: 'RaverWatch', description: "Harm-reduction field missions from Hero Watch, each with its safety limits" },
  { id: 'HarmReductionSites', label: 'Harm-reduction sites', category: 'RaverWatch', description: 'Drug-checking points and harm-reduction offices', implemented: false },
  /*
   * Hero Watch: who is responding, and where (decision D-HW). RLSH moved here from Intel Watch (HW1),
   * its id kept.
   */
  { id: 'Lifeboats', label: 'Lifeboats', category: 'HeroWatch', description: "RNLI lifeboat stations, sized by their launches in a year" },
  { id: 'Relief', label: 'Relief', category: 'HeroWatch', description: 'Red Cross and Red Crescent operations, and how many organisations work there, by country' },
  { id: 'FieldMissions', label: 'Field missions', category: 'HeroWatch', description: 'Missions anyone can take up, with their safety limits' },
  { id: 'RLSH', label: 'RLSH', category: 'HeroWatch', description: 'Real Life Super Hero markers' },
  { id: 'AiIncidents', label: 'Incidents', category: 'AIWatch', description: 'Harm done by AI, or narrowly avoided' },
  { id: 'AiFrontier', label: 'Frontier AI', category: 'AIWatch', description: 'The most capable systems, and who builds them' },
  { id: 'AiWar', label: 'AI in war', category: 'AIWatch', description: 'Autonomous weapons, and AI in the military-industrial base' },
  { id: 'AiSafety', label: 'Safety & security', category: 'AIWatch', description: 'AI security, and losing control of a system' },
  { id: 'OpenMissions', label: 'Open missions', category: 'Missions', description: 'Missions open to take, at the places they name; the rest done from anywhere' },
  { id: 'CampaignsOperations', label: 'Campaigns and operations', category: 'Missions', description: 'Each running or coming campaign and operation, its places outlined, with its clock' },
  { id: 'SafetyWindows', label: 'Safety windows', category: 'Missions', description: "Windows round recurring nights in a city: the city filled by the window's weight at the cursor, never a person" },
  /*
   * Psi Watch (decision D-PW, PW9), only with its switch on (PW19). Planet lines, Tested places, Psi Alerts and
   * Windows draw on the globe, field readings in its panel; the ψ field and the shield draw nothing yet, and say so
   * (build steps 6 and 7).
   */
  { id: 'PsiLines', label: 'Planet lines', category: 'PsiWatch', description: "Where the open sky event's bodies rise, set and stand overhead, at exact or at the cursor" },
  { id: 'PsiField', label: 'Field readings', category: 'PsiWatch', description: "The planet's field today: Kp, the solar wind, flares, the aurora, a public randomness beacon" },
  { id: 'PsiZones', label: 'Tested places', category: 'PsiWatch', description: 'Each Zone a registered test looked at, as a dotted edge; its result in the hover' },
  { id: 'PsiRifts', label: 'Psi Alerts', category: 'PsiWatch', description: 'Several field channels high together in a Zone, while it holds' },
  { id: 'PsiWindows', label: 'Windows', category: 'PsiWatch', description: 'Focus windows on sky events, their places faded by the weight at the cursor' },
  { id: 'PsiModel', label: 'ψ field', category: 'PsiWatch', description: 'The ψ field, computed live from the geoid, the spreading ridges, the core field, the coasts, the tides and eclipses', implemented: true },
  { id: 'MagneticShield', label: 'Magnetic shield', category: 'PsiWatch', description: "Earth's magnetic field from IGRF-14: its strength, the South Atlantic Anomaly, the dip equator, the poles' drift since 1900, and the live auroral oval", implemented: true },
];

// The commercial build hides a layer drawn only from sources it may not use (D-CS, CS13).
const LAYER_CATALOG = LAYER_CATALOG_ALL.filter((cat) => subModeAvailable(cat.id));

const PSI_LAYERS: ReadonlySet<GlobeLayerId> = new Set(LAYER_CATALOG.filter((cat) => cat.category === 'PsiWatch').map((cat) => cat.id));

/**
 * A layer's name for a person to read, from the catalogue that already holds it.
 *
 * Exported because a control that acts on "whichever layer is in front" has to
 * be able to say which one — and a second list of names beside this one would
 * be free to drift from it. Falls back to the id rather than to an empty label:
 * an unfamiliar name is a smaller failure than a control that names nothing.
 */
export function layerLabel(layerId: GlobeLayerId): string {
  return LAYER_CATALOG.find((cat) => cat.id === layerId)?.label ?? layerId;
}

/**
 * Hook for multi-layer globe visibility control.
 *
 * Usage in visualization hooks:
 * ```ts
 * const { isLayerActive } = useGlobeLayerControl();
 * const enabled = isLayerActive('CyberThreats');
 * ```
 *
 * Usage in HUD layer panel:
 * ```tsx
 * const { layers, togglePin } = useGlobeLayerControl();
 * layers.map(l => <LayerToggle key={l.id} layer={l} onToggle={() => togglePin(l.id)} />)
 * ```
 */

// ── Shared Context ──────────────────────────────────────────────────────────
const GlobeLayerControlContext = createContext<UseGlobeLayerControlResult | null>(null);

/**
 * Provider that owns the pinned-layers state. Mount once in the HUD layout
 * so Globe.tsx, the command palette, and HUD corners all share the same state.
 */
export const GlobeLayerControlProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { visualizationMode } = useVisualizationMode();
  const [pinnedLayers, setPinnedLayers] = useState<Set<GlobeLayerId>>(new Set());

  const primaryLayerId: GlobeLayerId = visualizationMode.subMode as GlobeLayerId;
  /*
   * RLSH is never shown in Raver Watch, pinned or not: a house rule of Mecha
   * Jono's, and ours (globe record, section 19). The pin is kept, so it shows
   * again on leaving the mode.
   */
  const inRaverWatch = visualizationMode.mode === 'RaverWatch';
  // Psi Watch's layers exist only with its switch on (decision D-PW, PW19), pinned or not.
  const psiOn = psiKitOn();
  const isActive = useCallback(
    (layerId: GlobeLayerId): boolean =>
      !(inRaverWatch && layerId === 'RLSH') && (psiOn || !PSI_LAYERS.has(layerId)) && (layerId === primaryLayerId || pinnedLayers.has(layerId)),
    [inRaverWatch, psiOn, primaryLayerId, pinnedLayers]
  );

  const isLayerActive = useCallback((layerId: GlobeLayerId): boolean => isActive(layerId), [isActive]);

  const activeLayers = useMemo(() => {
    const active = new Set<GlobeLayerId>([...pinnedLayers, primaryLayerId].filter(isActive));
    return active;
  }, [primaryLayerId, pinnedLayers, isActive]);

  // For what renders above this provider, a popup among them (drawnGlobeLayers.ts).
  useEffect(() => {
    publishDrawnGlobeLayers(activeLayers);
    return () => publishDrawnGlobeLayers(new Set());
  }, [activeLayers]);

  const pinLayer = useCallback((layerId: GlobeLayerId) => {
    setPinnedLayers(prev => {
      const next = new Set(prev);
      next.add(layerId);
      return next;
    });
  }, []);

  const unpinLayer = useCallback((layerId: GlobeLayerId) => {
    setPinnedLayers(prev => {
      const next = new Set(prev);
      next.delete(layerId);
      return next;
    });
  }, []);

  const togglePin = useCallback((layerId: GlobeLayerId) => {
    setPinnedLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  }, []);

  const clearPins = useCallback(() => {
    setPinnedLayers(new Set());
  }, []);

  const layers = useMemo<GlobeLayerInfo[]>(() => {
    return LAYER_CATALOG.filter((cat) => psiOn || cat.category !== 'PsiWatch').map(cat => ({
      ...cat,
      isPrimary: cat.id === primaryLayerId,
      isPinned: pinnedLayers.has(cat.id),
      isActive: isActive(cat.id),
      isImplemented: cat.implemented !== false,
    }));
  }, [psiOn, primaryLayerId, pinnedLayers, isActive]);

  const value = useMemo<UseGlobeLayerControlResult>(() => ({
    layers,
    activeLayers,
    isLayerActive,
    pinLayer,
    unpinLayer,
    togglePin,
    clearPins,
    pinnedCount: pinnedLayers.size,
  }), [layers, activeLayers, isLayerActive, pinLayer, unpinLayer, togglePin, clearPins, pinnedLayers.size]);

  return React.createElement(GlobeLayerControlContext.Provider, { value }, children);
};

/**
 * Consume the shared layer control context.
 * Must be rendered inside <GlobeLayerControlProvider>.
 */
/** The layer control where its provider is mounted, else null: for HUD pieces that also render alone, as in their tests. */
export function useGlobeLayerControlOptional(): UseGlobeLayerControlResult | null {
  return useContext(GlobeLayerControlContext);
}

export function useGlobeLayerControl(): UseGlobeLayerControlResult {
  const ctx = useContext(GlobeLayerControlContext);
  if (!ctx) {
    throw new Error(
      'useGlobeLayerControl must be used within a GlobeLayerControlProvider. ' +
      'Mount <GlobeLayerControlProvider> in CyberCommandHUDLayout.'
    );
  }
  return ctx;
}