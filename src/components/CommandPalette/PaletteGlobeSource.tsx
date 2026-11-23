/**
 * What the Globe offers the command palette (D-CP), while it is open: its layers and modes, the time bar's commands,
 * each drawn layer's rail controls in their own words (CP2), and the items drawn on it, each flown to and opened when
 * picked (CP3). Mounted in the Globe's layout, inside the providers it reads; with the Globe closed, none of it is
 * offered.
 */
import React, { useEffect, useRef } from 'react';
import { fill, useMessages } from '../../i18n/app/i18n';
import { useVisualizationMode } from '../../context/VisualizationModeContext';
import { useTemporalStateOptional } from '../../context/TemporalContext';
import { useGlobeContext } from '../../context/GlobeContext';
import { useGlobeLayerControlOptional } from '../Globe/Hooks/useGlobeLayerControl';
import { getRegisteredTooltipGroups } from '../Globe/pointTooltipRegistry';
import { eachDrawnMark } from '../../features/globe/marks/drawnMarks';
import { openGlobeNotes } from '../../features/globe/noteDetail/globeNoteStore';
import { PRIMARY_RAIL_MODES, primaryRailModes, SECONDARY_RAIL_MODES } from '../HUD/Bars/CyberCommandRails/railModeConfig';
import { setSecondaryModeForPrimary } from '../HUD/Bars/CyberCommandRails/CyberCommandLeftSideRail';
import { useRailLayers } from '../HUD/Bars/CyberCommandRails/RailKits';
import { controlName, optionName } from '../../features/globe/rail/railWords';
import { RAIL_SPECS, type RailControl } from '../../features/globe/rail/railSpecs';
import { useRailBindings } from '../../features/globe/rail/railBindings';
import { layerChoice, setLayerChoice, useLayerChoices, type ChoiceValue } from '../../features/globe/rail/layerChoices';
import { RANGE_PRESETS, setTimebarRange, useTimebarRange } from '../../features/globe/timebar/timebarRange';
import { DECAY_CHOICES_S, requestPlay, setReplayDecayS, usePlayShape, useReplayDecayS } from '../../features/globe/timebar/playClock';
import { psiKitOn } from '../../services/psiWatch/psiKitSwitch';
import { useFloatingPanelsOptional } from '../HUD/FloatingPanels/FloatingPanelContext';
import { beginComparison, comparableLayers, currentComparison, endComparison, momentComparison } from '../../globe-engine/compareLayers';
import { EARLIER_CHOICES } from '../../features/globe/compare/quakeMoments';
import { quakeWindowShown } from '../../features/globe/compare/heldWindow';
import { aheadLabel, COMPARE_AHEAD_HOURS } from '../../features/globe/compare/weatherMoments';
import { comparePins } from '../Compare/comparePins';
import { paletteMatch, paletteOpen, registerPaletteSource, type PaletteResult } from '../../features/palette/palette';
import type { GlyphName } from '../../symbols/uiSymbols';

/** The Globe's floating panels, as Quick Access offered them before the palette absorbed it (CP5). */
const PANELS: ReadonlyArray<{ feature: string; title: string; about: string; glyph: GlyphName }> = [
  { feature: 'node-graph', title: 'Node Graph', about: 'Intelligence entity relationship graph', glyph: 'panel:node-graph' },
  { feature: 'timeline', title: 'Timeline', about: 'Intelligence event timeline', glyph: 'panel:timeline' },
  { feature: 'satellite-tracking', title: 'Satellite Tracking', about: 'Orbital asset monitoring', glyph: 'layer:Satellites' },
  { feature: 'threat-assessment', title: 'Threat Assessment', about: 'Security threat analysis', glyph: 'panel:threat-assessment' },
];

const RANGE_GLYPHS: Record<string, GlyphName> = {
  all: 'control:window:all', '24h': 'control:window:day', '7d': 'control:window:week', '30d': 'control:window:month',
  '1y': 'control:window:year', history: 'control:timeline',
};

/** An item's words, first part only: a hover reads "M4.5 • earthquake • …"; the palette names it by its first. */
const firstPart = (tooltip: string) => tooltip.split(/\n| • /)[0].trim();

export const PaletteGlobeSource: React.FC = () => {
  const { m } = useMessages();
  const { visualizationMode, setVisualizationMode } = useVisualizationMode();
  const temporal = useTemporalStateOptional();
  const { setFocusLocation } = useGlobeContext();
  const layerControl = useGlobeLayerControlOptional();
  const range = useTimebarRange();
  const play = usePlayShape();
  const decay = useReplayDecayS();
  const drawn = useRailLayers(visualizationMode.subMode);
  const quakesDrawn = layerControl?.layers.some((l) => l.id === 'EcologicalDisasters' && l.isActive) ?? false;
  const panels = useFloatingPanelsOptional();

  const latest = useRef({ m, visualizationMode, setVisualizationMode, temporal, setFocusLocation, range, play, decay, quakesDrawn, layerControl, panels });
  latest.current = { m, visualizationMode, setVisualizationMode, temporal, setFocusLocation, range, play, decay, quakesDrawn, layerControl, panels };

  // Layers and modes, and the time bar's commands.
  useEffect(() => registerPaletteSource({
    id: 'globe',
    results: (query) => {
      const { m: w, setVisualizationMode: setMode, temporal: time, range: chosen, play: playing, decay: decayS, quakesDrawn: quakes, layerControl: control, panels: floating } = latest.current;
      const p = w.palette;
      // Each layer with a rendering pinned beside the one in front, or let go (CP5, as Quick Access did).
      const pins: PaletteResult[] = (control?.layers ?? []).filter((l) => l.isImplemented && !l.isPrimary).map((l) => ({
        id: `pin:${l.id}`, section: 'layers' as const, title: fill(l.isPinned ? p.unpin : p.pin, { layer: l.label }),
        description: l.isPinned ? p.unpinSays : p.pinSays, glyph: `layer:${l.id}` as GlyphName, keywords: `pin ${l.label} ${l.id}`,
        run: () => control?.togglePin(l.id),
      }));
      const panelCommands: PaletteResult[] = floating ? PANELS.map((panel) => ({
        id: `panel:${panel.feature}`, section: 'commands' as const, title: panel.title, description: `${p.panelSays}: ${panel.about}`,
        glyph: panel.glyph, keywords: 'panel', quiet: true, run: () => floating.addActiveFeature(panel.feature),
      })) : [];
      const layers: PaletteResult[] = primaryRailModes(psiKitOn()).flatMap((primary) => [
        {
          id: `mode:${primary.mode}`, section: 'layers' as const, title: primary.tooltip,
          description: fill(p.showLayer, { mode: primary.tooltip }), glyph: primary.glyph, keywords: primary.mode,
          run: () => setSecondaryModeForPrimary(primary.mode, SECONDARY_RAIL_MODES[primary.mode][0].subMode, setMode),
        },
        ...SECONDARY_RAIL_MODES[primary.mode].map((sub) => ({
          id: `layer:${sub.subMode}`, section: 'layers' as const, title: sub.tooltip,
          description: fill(p.showLayer, { mode: primary.tooltip }), glyph: sub.glyph as GlyphName, keywords: `${primary.tooltip} ${sub.subMode}`,
          run: () => setSecondaryModeForPrimary(primary.mode, sub.subMode, setMode),
        })),
      ]);
      const commands: PaletteResult[] = [
        ...(time && !time.isLive ? [{ id: 'cmd:live', section: 'commands' as const, title: p.live, description: p.liveSays, glyph: 'note:listening' as GlyphName, run: () => time.setIsLive(true) }] : []),
        ...(playing.playing
          ? [{ id: 'cmd:stop', section: 'commands' as const, title: p.stop, description: p.stopSays, glyph: 'control:timeline' as GlyphName, run: () => requestPlay(false) }]
          : [{ id: 'cmd:play', section: 'commands' as const, title: p.play, description: p.playSays, glyph: 'control:timeline' as GlyphName, run: () => requestPlay(true) }]),
        ...RANGE_PRESETS.map((preset) => ({
          id: `cmd:range:${preset.id}`, section: 'commands' as const, title: p.ranges[preset.id],
          description: chosen === preset.id ? `${p.rangeSays} · ${p.now}` : p.rangeSays, glyph: RANGE_GLYPHS[preset.id],
          keywords: `${preset.label} range time`, run: () => setTimebarRange(preset.id),
        })),
        // The replay's decay, while the quakes it fades are drawn (D-EQ, EQ17).
        ...(quakes ? DECAY_CHOICES_S.map((s) => ({
          id: `cmd:decay:${s}`, section: 'commands' as const, title: fill(p.decay, { s }),
          description: decayS === s ? `${fill(p.decaySays, { s })} · ${p.now}` : fill(p.decaySays, { s }),
          glyph: 'control:fade' as GlyphName, keywords: 'replay quake', run: () => setReplayDecayS(s),
        })) : []),
      ];
      // Two layers side by side (D-CM, CM2): every pair of the layers that can be drawn apart, found by their words.
      const labelOf = (id: string) => control?.layers.find((l) => l.id === id)?.label ?? id;
      const comparable = control ? comparableLayers() : [];
      const pairs: PaletteResult[] = control ? comparable.flatMap((a) => comparable.filter((b) => b !== a).map((b) => ({
        id: `compare:${a}:${b}`, section: 'layers' as const,
        title: fill(p.compare, { left: labelOf(a), right: labelOf(b) }), description: fill(p.compareSays, { left: labelOf(a), right: labelOf(b) }),
        glyph: 'control:compare' as GlyphName, keywords: `compare side ${a} ${b}`, quiet: true,
        run: () => beginComparison({ left: a, right: b }, comparePins(control)),
      }))) : [];
      // The quakes at two moments (CM4): a week, a month, a year or ten years earlier; or this window held.
      const quakesLabel = labelOf('EcologicalDisasters');
      const moments: PaletteResult[] = control && comparable.includes('EcologicalDisasters') ? [
        ...EARLIER_CHOICES.map((by) => ({
          id: `compare:moment:EcologicalDisasters:${by}`, section: 'layers' as const,
          title: fill(p.compareEarlier, { layer: quakesLabel, when: w.compare.earlier[by] }),
          description: fill(p.compareEarlierSays, { layer: quakesLabel, when: w.compare.earlier[by] }),
          glyph: 'control:compare' as GlyphName, keywords: `compare quakes earthquakes moment earlier ${by}`, quiet: true,
          run: () => beginComparison(momentComparison('EcologicalDisasters', { earlier: by }), comparePins(control)),
        })),
        {
          id: 'compare:moment:EcologicalDisasters:held', section: 'layers' as const,
          title: fill(p.compareHeld, { layer: quakesLabel }), description: p.compareHeldSays,
          glyph: 'control:compare' as GlyphName, keywords: 'compare quakes earthquakes moment window hold another', quiet: true,
          run: () => {
            const paused = time && !time.isLive && time.timeWindow ? { start: time.timeWindow.start.getTime(), end: time.timeWindow.end.getTime() } : null;
            beginComparison(momentComparison('EcologicalDisasters', { held: quakeWindowShown(paused) }), comparePins(control));
          },
        },
      ] : [];
      // Earth Weather now beside a forecast hour (CM5).
      const weatherLabel = labelOf('EarthWeather');
      const forecasts: PaletteResult[] = control && comparable.includes('EarthWeather') ? COMPARE_AHEAD_HOURS.map((hours) => ({
        id: `compare:moment:EarthWeather:${hours}`, section: 'layers' as const,
        title: fill(p.compareAhead, { layer: weatherLabel, step: aheadLabel(hours) }),
        description: fill(p.compareAheadSays, { layer: weatherLabel, step: aheadLabel(hours) }),
        glyph: 'control:compare' as GlyphName, keywords: `compare weather forecast ahead moment ${aheadLabel(hours)}`, quiet: true,
        run: () => beginComparison(momentComparison('EarthWeather', { ahead: hours }), comparePins(control)),
      })) : [];
      const ending: PaletteResult[] = currentComparison() ? [{
        id: 'compare:end', section: 'commands' as const, title: p.endCompare, description: p.endCompareSays, glyph: 'control:compare' as GlyphName,
        keywords: 'compare side end stop', run: () => endComparison(control ? comparePins(control) : null),
      }] : [];
      const all = [...ending, ...commands, ...panelCommands, ...layers, ...pins, ...pairs, ...moments, ...forecasts];
      if (!query) return all;
      // The layer named first is the left half: "compare eco weather" is Eco Disasters with Earth Weather.
      const typed = query.toLowerCase().split(/\s+/).filter(Boolean);
      const firstNamed = (label: string) => {
        const words = label.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
        const at = typed.findIndex((w) => words.some((x) => x.startsWith(w)));
        return at < 0 ? Infinity : at;
      };
      // Only a pair named the other way round goes later; everything else keeps its place.
      const leftFirst = (r: PaletteResult) => {
        if (!r.id.startsWith('compare:')) return 0;
        const [, a, b] = r.id.split(':');
        return b !== undefined && firstNamed(labelOf(a)) > firstNamed(labelOf(b)) ? 1 : 0;
      };
      return paletteMatch(all, query).map((r, i) => ({ r, i })).sort((x, y) => leftFirst(x.r) - leftFirst(y.r) || x.i - y.i).map((x) => x.r);
    },
  }), []);

  // The items drawn on the globe, walked once an open (CP3).
  useEffect(() => {
    let walked: { open: object | null; items: PaletteResult[] } = { open: null, items: [] };
    const items = (): PaletteResult[] => {
      const open = paletteOpen();
      if (walked.open === open && walked.open) return walked.items;
      const found = new Map<string, PaletteResult>();
      eachDrawnMark(getRegisteredTooltipGroups(), (mark) => {
        // Its note's title where it opens one ("M 4.5 - 80 km SW of Lata"), else its hover's first part.
        const noted = mark.opens?.notes[0]?.title?.trim();
        const title = noted || firstPart(mark.tooltip);
        if (!title) return;
        const layer = mark.layer ?? '';
        const id = `item:${layer}:${mark.tooltip.slice(0, 120)}`;
        if (found.has(id)) return;
        const { m: w, setFocusLocation: fly } = latest.current;
        found.set(id, {
          id, section: 'globe', title, description: fill(w.palette.itemSays, { layer: layer || w.palette.sections.globe }),
          glyph: 'control:related', keywords: noted ? `${mark.tooltip} ${firstPart(mark.tooltip)}` : mark.tooltip,
          run: () => {
            fly({ lat: mark.at.lat, lng: mark.at.lng });
            if (mark.opens) openGlobeNotes(mark.opens, { at: mark.at, layer: mark.layer });
          },
        });
      });
      walked = { open, items: [...found.values()] };
      return walked.items;
    };
    return registerPaletteSource({ id: 'globe:items', results: (query) => (query ? paletteMatch(items(), query) : items()) });
  }, []);

  return <>{drawn.map((layer) => <PaletteRailSource key={layer} layer={layer} />)}</>;
};

/** One drawn layer's rail controls, as commands in their own words: each toggle on and off, each option chosen. */
const PaletteRailSource: React.FC<{ layer: string }> = ({ layer }) => {
  const { m } = useMessages();
  const bindings = useRailBindings(layer);
  useLayerChoices(layer);
  const latest = useRef({ m, bindings });
  latest.current = { m, bindings };
  useEffect(() => registerPaletteSource({
    id: `rail:${layer}`,
    results: (query) => {
      const { m: w, bindings: bound } = latest.current;
      const spec = RAIL_SPECS[layer];
      if (!spec) return [];
      const valueOf = (c: RailControl): ChoiceValue => bound[c.id]?.value ?? layerChoice(layer, c.id, c.default as ChoiceValue);
      const set = (c: RailControl, value: ChoiceValue) => {
        const binding = bound[c.id];
        if (binding) binding.set(value);
        else setLayerChoice(layer, c.id, value, c.default as ChoiceValue);
      };
      const says = (now: boolean) => (now ? `${fill(w.palette.railSays, { layer: layerName(layer) })} · ${w.palette.now}` : fill(w.palette.railSays, { layer: layerName(layer) }));
      const all: PaletteResult[] = spec.controls.flatMap((c): PaletteResult[] => {
        const name = controlName(w, c.id);
        const value = valueOf(c);
        if (c.kind === 'toggle') {
          return [true, false].map((on) => ({
            id: `rail:${layer}:${c.id}:${on ? 'on' : 'off'}`, section: 'commands' as const,
            title: fill(on ? w.rail.on : w.rail.off, { control: name }), description: says(value === on),
            glyph: c.glyph, keywords: `${c.id} ${layerName(layer)}`, run: () => set(c, on),
          }));
        }
        if (c.kind === 'select') {
          return c.options.map((o) => ({
            id: `rail:${layer}:${c.id}:${o.value}`, section: 'commands' as const,
            title: fill(w.rail.chosen, { control: name, option: optionName(w, c.id, o.value) }), description: says(value === o.value),
            glyph: o.glyph ?? c.glyph, keywords: `${c.id} ${o.value} ${layerName(layer)}`, run: () => set(c, o.value),
          }));
        }
        // A set of chips: every one, or one alone.
        const list = Array.isArray(value) ? value : [];
        return [
          {
            id: `rail:${layer}:${c.id}:all`, section: 'commands' as const, title: fill(w.rail.chosen, { control: name, option: w.rail.all }),
            description: says(list.length === c.options.length), glyph: c.glyph, keywords: `${c.id} ${layerName(layer)}`,
            run: () => set(c, c.options.map((o) => o.value)),
          },
          ...c.options.map((o) => ({
            id: `rail:${layer}:${c.id}:only:${o.value}`, section: 'commands' as const,
            title: fill(w.rail.chosen, { control: name, option: optionName(w, c.id, o.value) }),
            description: says(list.length === 1 && list[0] === o.value), glyph: o.glyph ?? c.glyph,
            keywords: `${c.id} ${o.value} only ${layerName(layer)}`, run: () => set(c, [o.value]),
          })),
        ];
      });
      // Found by their words, or among the recent picks: the empty box shows the time bar's commands, not every
      // control of every layer drawn.
      return query ? paletteMatch(all, query) : all.map((r) => ({ ...r, quiet: true }));
    },
  }), [layer]);
  return null;
};

/** A layer's name as the rail's tooltips give it, else its id spaced. */
function layerName(layer: string): string {
  for (const primary of PRIMARY_RAIL_MODES) {
    const sub = SECONDARY_RAIL_MODES[primary.mode].find((s) => s.subMode === layer);
    if (sub) return sub.tooltip;
  }
  return layer.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export default PaletteGlobeSource;
