/**
 * The second left rail's kits (critique-2026-11-01, OR1, OR10, OR11; plan A2): at the top, the layers drawn that
 * have controls, as their glyphs, the one chosen showing its controls below (the sub-mode's own at first); each
 * control one icon button whose face shows its state. A toggle switches on a click; a selector or a set of chips
 * opens a flyout beside the rail. What each control holds is the layer's own setting where it keeps one
 * (railBindings.ts), or a layer choice (layerChoices.ts), kept in this browser and in links.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Glyph } from '../../../../symbols/Glyph';
import type { GlyphName } from '../../../../symbols/uiSymbols';
import { fill, useMessages } from '../../../../i18n/app/i18n';
import { useGlobeLayerControlOptional } from '../../../Globe/Hooks/useGlobeLayerControl';
import { useVisualizationOverlay } from '../../../../hooks/useVisualizationOverlay';
import { useWarConflictOverlay } from '../../../../services/globe/warConflictOverlay';
import { RAIL_SPECS, hasRailSpec, type RailControl, type RailOption } from '../../../../features/globe/rail/railSpecs';
import { controlName, optionName } from '../../../../features/globe/rail/railWords';
import { useRailBindings } from '../../../../features/globe/rail/railBindings';
import { layerChoice, setLayerChoice, useLayerChoices, type ChoiceValue } from '../../../../features/globe/rail/layerChoices';
import { useSolarSystemShown } from '../../../../solar-system/solarScale';
import { beginComparison, endComparison, momentComparison, useComparableLayers, useComparison } from '../../../../globe-engine/compareLayers';
import { EARLIER_CHOICES } from '../../../../features/globe/compare/quakeMoments';
import { quakeWindowShown } from '../../../../features/globe/compare/heldWindow';
import { aheadLabel, COMPARE_AHEAD_HOURS } from '../../../../features/globe/compare/weatherMoments';
import { useTemporalStateOptional } from '../../../../context/TemporalContext';
import { comparePins } from '../../../Compare/comparePins';
import styles from './RailKits.module.css';

const NO_LAYERS: ReadonlyArray<{ id: string; isActive: boolean; isPrimary: boolean }> = [];

/**
 * The layers drawn now that have controls: the mode's own first, then those its overlays draw. Without the layer
 * control's provider (a rail rendered alone, as in its tests) it knows only the mode's own.
 */
export function useRailLayers(subMode: string): string[] {
  const layers = useGlobeLayerControlOptional()?.layers ?? NO_LAYERS;
  const { resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled } = useVisualizationOverlay();
  const warOverlay = useWarConflictOverlay();
  const solarShown = useSolarSystemShown();
  return useMemo(() => {
    const on = layers.filter((l) => l.isActive).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((l) => l.id as string);
    const overlays = [
      ...(warOverlay ? ['WarConflict'] : []),
      ...(resourceZonesOverlayEnabled ? ['ResourceZones'] : []),
      ...(diplomaticEventsOverlayEnabled ? ['DiplomaticEvents'] : []),
    ];
    // The solar system's own while it is drawn, and always in Space Weather, so its scale is set before pulling out (OR9).
    const solar = solarShown || subMode === 'SpaceWeather' ? ['SolarSystem'] : [];
    const all = [...(hasRailSpec(subMode) ? [subMode] : []), ...on, ...overlays, ...solar];
    return [...new Set(all)].filter(hasRailSpec);
  }, [layers, subMode, warOverlay, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, solarShown]);
}




export const RailKits: React.FC<{ subMode: string }> = ({ subMode }) => {
  const { m } = useMessages();
  const drawn = useRailLayers(subMode);
  const [chosen, setChosen] = useState<string | null>(null);
  const layer = chosen && drawn.includes(chosen) ? chosen : drawn[0];
  if (!layer) return null;
  return (
    <div className={styles.kits} data-testid="rail-kits" role="group" aria-label={m.rail.label}>
      {drawn.length > 1 ? (
        <div className={styles.switcher} role="tablist" aria-label={m.rail.layers}>
          {drawn.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === layer}
              className={`${styles.layerButton} ${id === layer ? styles.layerButtonChosen : ''}`}
              onClick={() => setChosen(id)}
              data-testid={`rail-layer-${id}`}
              title={id}
            >
              <KitFace layer={id} />
            </button>
          ))}
        </div>
      ) : null}
      <LayerControls layer={layer} />
    </div>
  );
};

/** A kit's button: the layer's glyph, or, for a kit with a face (railSpecs.ts), its chosen option's. */
const KitFace: React.FC<{ layer: string }> = ({ layer }) => {
  const bindings = useRailBindings(layer);
  useLayerChoices(layer);
  const face = RAIL_SPECS[layer].face ? RAIL_SPECS[layer].controls.find((c) => c.id === RAIL_SPECS[layer].face) : undefined;
  const value = face ? bindings[face.id]?.value ?? layerChoice(layer, face.id, face.default as ChoiceValue) : undefined;
  const option = face?.kind === 'select' ? face.options.find((o) => o.value === value) : undefined;
  return <Glyph name={option?.glyph ?? face?.glyph ?? (`layer:${layer}` as GlyphName)} title={layer} />;
};

const LayerControls: React.FC<{ layer: string }> = ({ layer }) => {
  const { m } = useMessages();
  const spec = RAIL_SPECS[layer];
  const bindings = useRailBindings(layer);
  useLayerChoices(layer);
  const [open, setOpen] = useState<string | null>(null);
  const anchors = useRef(new Map<string, HTMLButtonElement | null>());
  useEffect(() => { setOpen(null); }, [layer]);
  const valueOf = useCallback((c: RailControl): ChoiceValue => bindings[c.id]?.value ?? layerChoice(layer, c.id, c.default as ChoiceValue), [bindings, layer]);
  const setValue = useCallback((c: RailControl, value: ChoiceValue) => {
    const bound = bindings[c.id];
    if (bound) bound.set(value);
    else setLayerChoice(layer, c.id, value, c.default as ChoiceValue);
  }, [bindings, layer]);
  // Two layers side by side (D-CM, CM2): this layer with another that can be drawn apart.
  const control = useGlobeLayerControlOptional();
  const comparison = useComparison();
  const comparable = useComparableLayers().split(',').filter(Boolean);
  const canCompare = !!control && comparable.includes(layer);
  const inComparison = !!comparison && (comparison.left === layer || comparison.right === layer);
  const labelOf = (id: string) => control?.layers.find((l) => l.id === id)?.label ?? id;
  // The quakes at another moment too (D-CM, CM4).
  const temporal = useTemporalStateOptional();
  const momentsOffered = layer === 'EcologicalDisasters';
  const holdThis = () => {
    const paused = temporal && !temporal.isLive && temporal.timeWindow ? { start: temporal.timeWindow.start.getTime(), end: temporal.timeWindow.end.getTime() } : null;
    return quakeWindowShown(paused);
  };

  return (
    <div className={styles.controls}>
      {spec.controls.map((c) => {
        const value = valueOf(c);
        const name = controlName(m, c.id);
        if (c.kind === 'toggle') {
          const on = value === true;
          return (
            <button
              key={c.id}
              type="button"
              className={`${styles.control} ${on ? styles.controlOn : ''}`}
              aria-pressed={on}
              onClick={() => setValue(c, !on)}
              title={fill(on ? m.rail.on : m.rail.off, { control: name })}
              data-testid={`rail-control-${c.id}`}
            >
              <Glyph name={c.glyph} />
            </button>
          );
        }
        const list = Array.isArray(value) ? value as readonly string[] : [];
        const option = c.kind === 'select' ? c.options.find((o) => o.value === value) : undefined;
        const title = c.kind === 'select'
          ? fill(m.rail.chosen, { control: name, option: option ? optionName(m, c.id, option.value) : String(value) })
          : fill(m.rail.some, { control: name, n: list.length, total: c.options.length });
        const narrowed = c.kind === 'chips' && list.length < c.options.length;
        return (
          <button
            key={c.id}
            ref={(el) => { anchors.current.set(c.id, el); }}
            type="button"
            className={`${styles.control} ${open === c.id ? styles.controlOpen : ''} ${narrowed ? styles.controlNarrowed : ''}`}
            aria-haspopup="dialog"
            aria-expanded={open === c.id}
            onClick={() => setOpen(open === c.id ? null : c.id)}
            title={title}
            data-testid={`rail-control-${c.id}`}
          >
            <Glyph name={option?.glyph ?? c.glyph} />
            {narrowed ? <span className={styles.badge} aria-hidden="true">{list.length}</span> : null}
          </button>
        );
      })}
      {canCompare ? (
        <button
          key="__compare"
          ref={(el) => { anchors.current.set('__compare', el); }}
          type="button"
          className={`${styles.control} ${inComparison ? styles.controlOn : ''} ${open === '__compare' ? styles.controlOpen : ''}`}
          aria-haspopup={inComparison ? undefined : 'dialog'}
          aria-pressed={inComparison}
          onClick={() => {
            if (inComparison && control) endComparison(comparePins(control));
            else setOpen(open === '__compare' ? null : '__compare');
          }}
          title={inComparison ? m.compare.ends : fill(m.compare.choose, { layer: labelOf(layer) })}
          data-testid="rail-control-compare"
        >
          <Glyph name="control:compare" />
        </button>
      ) : null}
      {open === '__compare' && control ? (
        <Flyout anchor={anchors.current.get('__compare') ?? null} title={fill(m.compare.choose, { layer: labelOf(layer) })} onClose={() => setOpen(null)}>
          {layer === 'EarthWeather' ? (
            <div className={styles.options} role="group" aria-label={m.compare.moments}>
              {COMPARE_AHEAD_HOURS.map((hours) => (
                <button key={hours} type="button" className={styles.option} data-testid={`rail-compare-ahead-${hours}`}
                  onClick={() => { beginComparison(momentComparison(layer, { ahead: hours }), comparePins(control)); setOpen(null); }}>
                  <Glyph name="control:timeline" /><span>{aheadLabel(hours)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {momentsOffered ? (
            <div className={styles.options} role="group" aria-label={m.compare.moments}>
              {EARLIER_CHOICES.map((by) => (
                <button key={by} type="button" className={styles.option} data-testid={`rail-compare-earlier-${by}`}
                  onClick={() => { beginComparison(momentComparison(layer, { earlier: by }), comparePins(control)); setOpen(null); }}>
                  <Glyph name="control:timeline" /><span>{m.compare.earlier[by]}</span>
                </button>
              ))}
              <button type="button" className={styles.option} data-testid="rail-compare-held"
                onClick={() => { beginComparison(momentComparison(layer, { held: holdThis() }), comparePins(control)); setOpen(null); }}>
                <Glyph name="control:timeline" /><span>{m.compare.held}</span>
              </button>
            </div>
          ) : null}
          <div className={styles.options} role="group">
            {comparable.filter((id) => id !== layer).length ? comparable.filter((id) => id !== layer).map((id) => (
              <button key={id} type="button" className={styles.option} data-testid={`rail-compare-with-${id}`}
                onClick={() => { beginComparison({ left: layer, right: id }, comparePins(control)); setOpen(null); }}>
                <Glyph name={`layer:${id}` as GlyphName} /><span>{labelOf(id)}</span>
              </button>
            )) : <span>{m.compare.none}</span>}
          </div>
        </Flyout>
      ) : null}
      {open && open !== '__compare' ? (() => {
        const c = spec.controls.find((x) => x.id === open);
        if (!c || c.kind === 'toggle') return null;
        return (
          <Flyout
            anchor={anchors.current.get(c.id) ?? null}
            title={controlName(m, c.id)}
            onClose={() => setOpen(null)}
          >
            <Options
              control={c}
              value={valueOf(c)}
              nameOf={(v) => optionName(m, c.id, v)}
              allWord={m.rail.all}
              noneWord={m.rail.none}
              onChange={(v) => setValue(c, v)}
            />
          </Flyout>
        );
      })() : null}
    </div>
  );
};

const Options: React.FC<{
  control: Extract<RailControl, { kind: 'select' | 'chips' }>;
  value: ChoiceValue;
  nameOf: (value: string) => string;
  allWord: string;
  noneWord: string;
  onChange: (value: ChoiceValue) => void;
}> = ({ control, value, nameOf, allWord, noneWord, onChange }) => {
  const mark = (o: RailOption) => (o.glyph ? <Glyph name={o.glyph} /> : o.swatch ? <i className={styles.swatch} style={{ background: o.swatch }} aria-hidden="true" /> : null);
  if (control.kind === 'select') {
    return (
      <div className={styles.options} role="radiogroup">
        {control.options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
            className={`${styles.option} ${value === o.value ? styles.optionChosen : ''}`} onClick={() => onChange(o.value)}
            data-testid={`rail-option-${control.id}-${o.value}`}>
            {mark(o)}<span>{nameOf(o.value)}</span>
          </button>
        ))}
      </div>
    );
  }
  const list = Array.isArray(value) ? value as readonly string[] : [];
  const flip = (v: string) => onChange(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className={styles.options} role="group">
      {control.options.map((o) => (
        <button key={o.value} type="button" role="checkbox" aria-checked={list.includes(o.value)}
          className={`${styles.option} ${list.includes(o.value) ? styles.optionChosen : ''}`} onClick={() => flip(o.value)}
          data-testid={`rail-option-${control.id}-${o.value}`}>
          {mark(o)}<span>{nameOf(o.value)}</span>
        </button>
      ))}
      <div className={styles.allNone}>
        <button type="button" onClick={() => onChange(control.options.map((o) => o.value))}>{allWord}</button>
        <button type="button" onClick={() => onChange([])}>{noneWord}</button>
      </div>
    </div>
  );
};

/** A small panel beside the rail, at its button: closed by Escape or a click elsewhere. */
const Flyout: React.FC<{ anchor: HTMLElement | null; title: string; onClose: () => void; children: React.ReactNode }> = ({ anchor, title, onClose, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const height = ref.current?.offsetHeight ?? 0;
    setAt({ left: r.right + 10, top: Math.max(8, Math.min(r.top, window.innerHeight - height - 8)) });
  }, [anchor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className={styles.flyout} role="dialog" aria-label={title} style={at ? { left: at.left, top: at.top } : { visibility: 'hidden' }} data-testid="rail-flyout">
      <div className={styles.flyoutTitle}>{title}</div>
      {children}
    </div>,
    document.body,
  );
};

export default RailKits;
