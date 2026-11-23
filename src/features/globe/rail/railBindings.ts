/**
 * The rail's controls whose settings a layer already keeps (plan A2, B1): Geo Political's live in
 * useGeoPoliticalSettings, which its layers popup also sets, so the rail binds to them rather than keeping a second
 * copy; the two never disagree. A control with no binding here keeps its value as a layer choice (layerChoices.ts).
 */
import { useMemo } from 'react';
import { useGeoPoliticalSettings, type GeoPoliticalConfig } from '../../../hooks/useGeoPoliticalSettings';
import { DIPLOMATIC_CATEGORIES } from '../../../geopolitical/theme/diplomaticEventTheme';
import type { ChoiceValue } from './layerChoices';
import { PSI_FIELD_LOOKS, setPsiFieldLook, usePsiFieldLooks } from '../../../services/psiWatch/psiField/psiFieldLooks';
import useEcoNaturalSettings from '../../../hooks/useEcoNaturalSettings';
import { weatherFromSettings } from '../../../services/weather/weatherLook';
import { useCyberCommandSettings } from '../../../hooks/useCyberCommandSettings';
import { isSolarScale, setSolarScale, useSolarScale } from '../../../solar-system/solarScale';
import { PING_FROM_CHOICES, setQuakePingFrom, useQuakePingFrom, type PingFrom } from '../../../services/quakes/quakePings';

export interface RailBinding {
  value: ChoiceValue;
  set: (value: ChoiceValue) => void;
}

type ResourceType = keyof GeoPoliticalConfig['resourceZones']['resourceTypes'];
const RESOURCE_TYPES: readonly ResourceType[] = ['oil', 'gas', 'minerals', 'water', 'renewable'];

const asList = (value: ChoiceValue): readonly string[] => (Array.isArray(value) ? value : []);

/** The bound controls of one layer, by control id. */
export function useRailBindings(layer: string): Readonly<Record<string, RailBinding>> {
  // Inside the app the provider is always there; a test that draws the rail alone has none, and binds nothing.
  let api: ReturnType<typeof useGeoPoliticalSettings> | null = null;
  try { api = useGeoPoliticalSettings(); } catch { api = null; }
  const config = api?.config;
  const updateConflictZones = api?.updateConflictZones;
  const updateResourceZones = api?.updateResourceZones;
  const updateDiplomaticEvents = api?.updateDiplomaticEvents;
  const psiLooks = usePsiFieldLooks();
  // Eco Natural's settings: a shared store, there with or without a provider.
  const { config: ecoConfig, updateEarthWeather, updateSpaceWeather } = useEcoNaturalSettings();
  const earthWeather = ecoConfig.earthWeather;
  const spaceWeather = ecoConfig.spaceWeather;
  // Intel Watch's settings: a shared store too.
  const { config: cyberConfig, updateIntelReports } = useCyberCommandSettings();
  const maxReports = cyberConfig.intelReports.maxReports;
  // The solar system's scale: its own store, kept in this browser.
  const solarScale = useSolarScale();
  // The quake ping's magnitude (D-EQ, EQ19): the person's own, kept in this browser.
  const pingFrom = useQuakePingFrom();
  return useMemo(() => {
    // The ψ field's looks, kept by Psi Watch's own store: no Geo Political provider needed.
    if (layer === 'PsiModel') {
      return {
        'psi:looks': {
          value: PSI_FIELD_LOOKS.filter((look) => psiLooks[look]),
          // The wanted ones on first, then the rest off: the store keeps at least one look on.
          set: (v) => {
            const want = asList(v);
            for (const look of PSI_FIELD_LOOKS) if (want.includes(look)) setPsiFieldLook(look, true);
            for (const look of PSI_FIELD_LOOKS) if (!want.includes(look)) setPsiFieldLook(look, false);
          },
        },
      };
    }
    // Earth Weather's look, kept in the Eco Natural settings (O14): the ground's colour, the wind and the clouds.
    if (layer === 'EarthWeather') {
      const layers = earthWeather.weatherLayers;
      return {
        'weather:colour': {
          value: weatherFromSettings(earthWeather).colour,
          // "None" is temperature switched off, as the settings have always said it.
          set: (v) => updateEarthWeather(v === 'none'
            ? { colorMode: 'temperature', weatherLayers: { ...layers, temperature: false } }
            : { colorMode: v as 'temperature' | 'rain' | 'airQuality', weatherLayers: { ...layers, temperature: v === 'temperature' ? true : layers.temperature } }),
        },
        'weather:wind': { value: layers.windPatterns, set: (v) => updateEarthWeather({ weatherLayers: { ...layers, windPatterns: v === true } }) },
        'weather:clouds': { value: layers.clouds, set: (v) => updateEarthWeather({ weatherLayers: { ...layers, clouds: v === true } }) },
      };
    }
    // How many Intel Reports the globe draws: the person's setting (null is Unlimited), as its popup sets it.
    if (layer === 'IntelReports') {
      return {
        'intel:cap': { value: maxReports === null ? 'all' : String(maxReports), set: (v) => updateIntelReports({ maxReports: v === 'all' ? null : Number(v) }) },
      };
    }
    // Space Weather's looks, kept in the Eco Natural settings, which its settings popup also sets.
    if (layer === 'SpaceWeather') {
      return {
        'space:efield': { value: spaceWeather.eFieldLook, set: (v) => updateSpaceWeather({ eFieldLook: v as typeof spaceWeather.eFieldLook }) },
        'space:scale': { value: spaceWeather.eFieldScale, set: (v) => updateSpaceWeather({ eFieldScale: v as 'absolute' | 'relative' }) },
        'space:belts': { value: spaceWeather.showVanAllen, set: (v) => updateSpaceWeather({ showVanAllen: v === true }) },
        'space:enlil': { value: spaceWeather.showEnlil, set: (v) => updateSpaceWeather({ showEnlil: v === true }) },
        'space:cmes': { value: spaceWeather.showCmes, set: (v) => updateSpaceWeather({ showCmes: v === true }) },
      };
    }
    // A ping on a new strong quake (EQ19): the person's own, never a page's to set.
    if (layer === 'EcologicalDisasters') {
      return {
        'eco:ping': { value: pingFrom, set: (v) => { if ((PING_FROM_CHOICES as readonly unknown[]).includes(v)) setQuakePingFrom(v as PingFrom); } },
      };
    }
    // The solar system's scale (OR9, OR31), the person's own; a page's handle draws its own and never this.
    if (layer === 'SolarSystem') {
      return { 'solar:scale': { value: solarScale, set: (v) => { if (isSolarScale(v)) setSolarScale(v); } } };
    }
    if (!config || !updateConflictZones || !updateResourceZones || !updateDiplomaticEvents) return {};
    switch (layer) {
      case 'ConflictZones': {
        const cz = config.conflictZones;
        return {
          'conflict:events': { value: cz.layerTypes.warEvents, set: (v) => updateConflictZones({ layerTypes: { ...cz.layerTypes, warEvents: v === true } }) },
          'conflict:displacement': { value: cz.layerTypes.humanitarianCrisis, set: (v) => updateConflictZones({ layerTypes: { ...cz.layerTypes, humanitarianCrisis: v === true } }) },
          'conflict:size': { value: String(cz.markerSize), set: (v) => updateConflictZones({ markerSize: Number(v) }) },
        };
      }
      case 'ResourceZones': {
        const rz = config.resourceZones;
        return {
          'resources:types': {
            value: RESOURCE_TYPES.filter((t) => rz.resourceTypes[t]),
            set: (v) => updateResourceZones({ resourceTypes: Object.fromEntries(RESOURCE_TYPES.map((t) => [t, asList(v).includes(t)])) as GeoPoliticalConfig['resourceZones']['resourceTypes'] }),
          },
          'resources:routes': { value: rz.showTradeRoutes, set: (v) => updateResourceZones({ showTradeRoutes: v === true }) },
          'resources:opacity': { value: String(rz.zoneOpacity), set: (v) => updateResourceZones({ zoneOpacity: Number(v) }) },
        };
      }
      case 'DiplomaticEvents': {
        const de = config.diplomaticEvents;
        return {
          'diplomacy:categories': {
            value: DIPLOMATIC_CATEGORIES.filter((c) => de.eventTypes[c]),
            set: (v) => updateDiplomaticEvents({ eventTypes: Object.fromEntries(DIPLOMATIC_CATEGORIES.map((c) => [c, asList(v).includes(c)])) as GeoPoliticalConfig['diplomaticEvents']['eventTypes'] }),
          },
          'diplomacy:saidOrDone': { value: de.filters.saidOrDone, set: (v) => updateDiplomaticEvents({ filters: { ...de.filters, saidOrDone: v as 'both' | 'said' | 'done' } }) },
          'diplomacy:outlets': { value: String(de.filters.minOutlets), set: (v) => updateDiplomaticEvents({ filters: { ...de.filters, minOutlets: Number(v) as 1 | 2 | 5 } }) },
          'diplomacy:connections': { value: de.showConnections, set: (v) => updateDiplomaticEvents({ showConnections: v === true }) },
          'diplomacy:placeBy': { value: de.placeBy, set: (v) => updateDiplomaticEvents({ placeBy: v as 'event' | 'actors' }) },
        };
      }
      default:
        return {};
    }
    // updateEarthWeather is made afresh each render; earthWeather stands for the settings it writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, config, updateConflictZones, updateResourceZones, updateDiplomaticEvents, psiLooks, earthWeather, spaceWeather, maxReports, solarScale, pingFrom]);
}
