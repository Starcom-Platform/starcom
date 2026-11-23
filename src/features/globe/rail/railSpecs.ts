/**
 * What the second left rail offers each layer (critique-2026-11-01, OR1, OR10, OR11; plan A2, B1): its controls, each
 * one icon button whose face shows its state, a click toggling it or opening a flyout beside the rail. Pure data: the
 * words are the app's (m.rail), the values either a layer choice (layerChoices.ts) or, where the layer already keeps
 * the setting, bound to it (railBindings.ts). A control is listed only once what it changes is drawn: nothing on the
 * rail is a promise.
 *
 * Geo Political first (plan B1); each mode's layers join as their kits are built.
 */
import { sourceAllowed } from '../../../legal/buildProfile';
import type { GlyphName } from '../../../symbols/uiSymbols';
import { DIPLOMATIC_CATEGORIES, diplomaticEventColor } from '../../../geopolitical/theme/diplomaticEventTheme';
import { DATA_SCALES } from '../../../styles/tokens';

export interface RailOption {
  value: string;
  /** Drawn on the option, and on the button's face while it is chosen. */
  glyph?: GlyphName;
  /** A colour beside the option's words: a category's own. */
  swatch?: string;
}

interface ControlBase {
  /** Its id within the layer: the key of its words (m.rail.controls) and of its choice. */
  id: string;
  glyph: GlyphName;
  /**
   * Kept in the layer's own settings (railBindings.ts), which its popup also sets, not as a layer choice: the share
   * handle cannot set it for a page (contract v68), as that would change the person's setting.
   */
  bound?: true;
}

export type RailControl =
  | (ControlBase & { kind: 'toggle'; default: boolean })
  | (ControlBase & { kind: 'select'; options: readonly RailOption[]; default: string })
  | (ControlBase & { kind: 'chips'; options: readonly RailOption[]; default: readonly string[] });

export interface RailSpec {
  layer: string;
  /** The control whose chosen option's glyph is the kit's button: a kit that is no layer of the catalogue's has none. */
  face?: string;
  controls: readonly RailControl[];
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** The quakes' magnitude and depth bands, each named by its lower bound (D-EQ, EQ6): every one, the rail's default. */
export const QUAKE_MAGNITUDE_BANDS: readonly string[] = DATA_SCALES.quakeMagnitude.map(([from]) => String(from));
export const QUAKE_DEPTH_BANDS: readonly string[] = DATA_SCALES.quakeDepthKm.map(([from]) => String(from));

export const RAIL_SPECS: Readonly<Record<string, RailSpec>> = {
  WarConflict: {
    layer: 'WarConflict',
    controls: [
      { id: 'war:items', kind: 'toggle', glyph: 'layer:WarConflict', default: true },
      { id: 'war:arcs', kind: 'toggle', glyph: 'control:war:arcs', default: true },
      { id: 'war:deaths', kind: 'toggle', glyph: 'control:war:deaths', default: true },
      { id: 'war:map', kind: 'toggle', glyph: 'control:war:map', default: true },
    ],
  },
  /*
   * Civil Unrest and Protest surges, one layer with two looks (critique-2026-11-01, OR5; plan B4): the days of unrest
   * as crowd glyphs, the surges as broken rings, and the countries' light tint, each on or off here.
   */
  CivilUnrest: {
    layer: 'CivilUnrest',
    controls: [
      { id: 'unrest:events', kind: 'toggle', glyph: 'layer:CivilUnrest', default: true },
      { id: 'unrest:surges', kind: 'toggle', glyph: 'layer:ProtestSurges', default: true },
      { id: 'unrest:tint', kind: 'toggle', glyph: 'control:fill:solid', default: true },
    ],
  },
  /*
   * Eco Disasters' marks (critique-2026-11-01, O7, OR2, OR29; plan B2): pins as Earthquake3D draws them, by default;
   * icons, dots (the screen points and their colour modes, as before) or spikes; and each quake's depth as a line down.
   * With pins, a quake's line, flag and ring coloured by magnitude or by how deep it began (D-EQ, EQ5). The plate
   * boundaries and the volcano catalogue beside the quakes, each on or off (EQ8). Which quakes are drawn, by their
   * magnitudes and their depths (EQ6): each range as its bands, every band on at first, a band's chip in its colour.
   */
  EcologicalDisasters: {
    layer: 'EcologicalDisasters',
    controls: [
      {
        id: 'eco:mark', kind: 'select', glyph: 'control:mark:pin', default: 'pin',
        options: [
          { value: 'icon', glyph: 'control:mark:icon' }, { value: 'dot', glyph: 'control:mark:dot' },
          { value: 'pin', glyph: 'control:mark:pin' }, { value: 'spike', glyph: 'control:mark:spike' },
        ],
      },
      { id: 'eco:depth', kind: 'toggle', glyph: 'control:size:magnitude', default: true },
      {
        id: 'eco:colour', kind: 'select', glyph: 'control:colour:severity', default: 'magnitude',
        options: [{ value: 'magnitude', glyph: 'control:colour:severity' }, { value: 'depth', glyph: 'control:colour:value' }],
      },
      { id: 'eco:plates', kind: 'toggle', glyph: 'control:eco:plates', default: true },
      { id: 'eco:volcanoes', kind: 'toggle', glyph: 'control:eco:volcanoes', default: true },
      {
        id: 'eco:magnitudes', kind: 'chips', glyph: 'control:eco:magnitudes', default: QUAKE_MAGNITUDE_BANDS,
        options: DATA_SCALES.quakeMagnitude.map(([from, colour]) => ({ value: String(from), swatch: colour })),
      },
      {
        id: 'eco:depths', kind: 'chips', glyph: 'control:eco:depths', default: QUAKE_DEPTH_BANDS,
        options: DATA_SCALES.quakeDepthKm.map(([from, colour]) => ({ value: String(from), swatch: colour })),
      },
      // A ping on a new quake of this magnitude or more (D-EQ, EQ19): the person's own, kept in this browser.
      {
        bound: true, id: 'eco:ping', kind: 'select', glyph: 'control:eco:ping', default: '6',
        options: [
          { value: 'off', glyph: 'control:eco:ping' },
          ...DATA_SCALES.quakeMagnitude.filter(([from]) => from >= 5).map(([from, colour]) => ({ value: String(from), swatch: colour })),
        ],
      },
    ],
  },
  /*
   * The ψ field's looks (critique-2026-11-01, plan B5): from Psi Watch's panel onto the rail, bound to the same
   * kept looks (psiFieldLooks.ts), so the panel and the rail never disagree.
   */
  /*
   * Planet lines' bands and parans (D-PW, PW59, PW81–PW84): each line's orb either side, and the latitudes where two
   * of the event's bodies are angular at once; both on, faint.
   */
  PsiLines: {
    layer: 'PsiLines',
    controls: [
      { id: 'psi:bands', kind: 'toggle', glyph: 'control:psi:bands', default: true },
      { id: 'psi:parans', kind: 'toggle', glyph: 'control:psi:parans', default: true },
    ],
  },
  PsiModel: {
    layer: 'PsiModel',
    controls: [
      {
        bound: true, id: 'psi:looks', kind: 'chips', glyph: 'control:filter', default: ['heat', 'contours'],
        options: [{ value: 'heat' }, { value: 'contours' }, { value: 'relief' }, { value: 'flow' }],
      },
    ],
  },
  /*
   * Earth Weather's look on the rail (critique-2026-11-01, O14; plan B2): the ground's colour, the wind's streaks and
   * the clouds, bound to the person's Eco Natural settings, which the settings popup also sets.
   */
  EarthWeather: {
    layer: 'EarthWeather',
    controls: [
      {
        bound: true, id: 'weather:colour', kind: 'select', glyph: 'control:colour:value', default: 'temperature',
        options: [
          { value: 'temperature', glyph: 'control:weather:temperature' }, { value: 'rain', glyph: 'control:weather:rain' },
          // Air quality is Open-Meteo's: absent from a commercial build (D-CS, CS13).
          ...(sourceAllowed('openMeteo') ? [{ value: 'airQuality', glyph: 'control:weather:air' } as const] : []), { value: 'none' },
        ],
      },
      { bound: true, id: 'weather:wind', kind: 'toggle', glyph: 'control:flow', default: true },
      { bound: true, id: 'weather:clouds', kind: 'toggle', glyph: 'control:weather:clouds', default: true },
    ],
  },
  /*
   * Space Weather's looks on the rail (critique-2026-11-01, plan B2): the e-field's look and its colour scale, the Van
   * Allen belts, ENLIL's solar wind and the CMEs, bound to the Eco Natural settings. The aurora, field lines, cusps,
   * tail sheet, magnetopause and solar wind join the rail when their glyphs are drawn; until then, its settings.
   */
  SpaceWeather: {
    layer: 'SpaceWeather',
    controls: [
      {
        bound: true, id: 'space:efield', kind: 'select', glyph: 'control:look:flow', default: 'streaks',
        options: [
          { value: 'streaks', glyph: 'control:look:flow' }, { value: 'arrows', glyph: 'control:look:arrows' },
          { value: 'ripples', glyph: 'control:look:ripples' }, { value: 'relief', glyph: 'control:look:relief' },
        ],
      },
      {
        bound: true, id: 'space:scale', kind: 'select', glyph: 'control:scale:absolute', default: 'absolute',
        options: [{ value: 'absolute', glyph: 'control:scale:absolute' }, { value: 'relative', glyph: 'control:scale:relative' }],
      },
      { bound: true, id: 'space:belts', kind: 'toggle', glyph: 'control:space:belts', default: false },
      { bound: true, id: 'space:enlil', kind: 'toggle', glyph: 'control:space:enlil', default: false },
      { bound: true, id: 'space:cmes', kind: 'toggle', glyph: 'control:space:cmes', default: false },
    ],
  },
  /*
   * The solar system's scale (critique-2026-11-01, OR9, OR31; plan D2), kept in this browser (solarScale.ts): Compact,
   * every size and the Moon's distance true and every other distance at about 1 in 19.7, or True, every distance true,
   * the camera reaching out past Neptune, or Diagram, not to scale (D4). A kit of its own, on the rail while the solar
   * system is drawn and always in Space Weather, its button wearing the scale in force; or Sky from a place, the camera
   * on the ground under the view's centre (D5).
   */
  SolarSystem: {
    layer: 'SolarSystem',
    face: 'solar:scale',
    controls: [
      {
        bound: true, id: 'solar:scale', kind: 'select', glyph: 'control:scale:compact', default: 'compact',
        options: [
          { value: 'compact', glyph: 'control:scale:compact' }, { value: 'true', glyph: 'control:scale:true' },
          { value: 'diagram', glyph: 'control:scale:diagram' }, { value: 'sky', glyph: 'control:scale:sky' },
        ],
      },
    ],
  },
  /*
   * Intel Reports' cap on the rail (critique-2026-11-01, plan B3), bound to its settings, which its popup also sets.
   * The lenses stay in the popup until the rail can carry their help (Interchange 3.12.2: offered with its words),
   * and the emblems until they have a glyph of their own.
   */
  IntelReports: {
    layer: 'IntelReports',
    controls: [
      {
        bound: true, id: 'intel:cap', kind: 'select', glyph: 'control:size:count', default: '50',
        options: [{ value: '50' }, { value: '100' }, { value: '250' }, { value: '500' }, { value: '1000' }, { value: 'all' }],
      },
    ],
  },
  ConflictZones: {
    layer: 'ConflictZones',
    controls: [
      {
        id: 'conflict:view', kind: 'select', glyph: 'control:list', default: 'events',
        options: [{ value: 'events', glyph: 'control:mark:icon' }, { value: 'countries', glyph: 'control:size:count' }],
      },
      {
        id: 'conflict:mark', kind: 'select', glyph: 'control:mark:icon', default: 'icon',
        options: [
          { value: 'icon', glyph: 'control:mark:icon' }, { value: 'dot', glyph: 'control:mark:dot' },
          { value: 'pin', glyph: 'control:mark:pin' }, { value: 'spike', glyph: 'control:mark:spike' },
        ],
      },
      { id: 'conflict:events', bound: true, kind: 'toggle', glyph: 'layer:ConflictZones', default: true },
      { id: 'conflict:displacement', bound: true, kind: 'toggle', glyph: 'control:conflict:displacement', default: true },
      {
        bound: true, id: 'conflict:size', kind: 'select', glyph: 'control:size:magnitude', default: '1',
        options: [{ value: '0.75' }, { value: '1' }, { value: '1.5' }],
      },
    ],
  },
  ResourceZones: {
    layer: 'ResourceZones',
    controls: [
      {
        bound: true, id: 'resources:types', kind: 'chips', glyph: 'control:filter', default: ['oil', 'gas', 'minerals', 'water', 'renewable'],
        options: [
          { value: 'oil', glyph: 'control:resources:oil' },
          { value: 'gas', glyph: 'control:resources:gas' },
          { value: 'minerals', glyph: 'control:resources:minerals' },
          { value: 'water', glyph: 'control:resources:water' },
          { value: 'renewable', glyph: 'control:resources:renewables' },
        ],
      },
      { id: 'resources:routes', bound: true, kind: 'toggle', glyph: 'control:resources:routes', default: true },
      {
        bound: true, id: 'resources:opacity', kind: 'select', glyph: 'control:opacity', default: '55',
        options: [{ value: '30' }, { value: '55' }, { value: '80' }],
      },
    ],
  },
  DiplomaticEvents: {
    layer: 'DiplomaticEvents',
    controls: [
      {
        bound: true, id: 'diplomacy:categories', kind: 'chips', glyph: 'control:filter', default: [...DIPLOMATIC_CATEGORIES],
        options: DIPLOMATIC_CATEGORIES.map((c) => ({ value: c, swatch: hex(diplomaticEventColor(c)) })),
      },
      {
        bound: true, id: 'diplomacy:saidOrDone', kind: 'select', glyph: 'control:colour:source', default: 'both',
        options: [{ value: 'both' }, { value: 'said' }, { value: 'done' }],
      },
      {
        bound: true, id: 'diplomacy:outlets', kind: 'select', glyph: 'control:size:count', default: '1',
        options: [{ value: '1' }, { value: '2' }, { value: '5' }],
      },
      { id: 'diplomacy:connections', bound: true, kind: 'toggle', glyph: 'control:arrows', default: true },
      {
        bound: true, id: 'diplomacy:placeBy', kind: 'select', glyph: 'control:mark:pin', default: 'event',
        options: [{ value: 'event' }, { value: 'actors' }],
      },
    ],
  },
};

export const hasRailSpec = (layer: string): boolean => Object.prototype.hasOwnProperty.call(RAIL_SPECS, layer);
