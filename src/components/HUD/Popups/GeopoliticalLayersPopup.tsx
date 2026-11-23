/**
 * GeopoliticalLayersPopup — real settings UI for the National Territories,
 * Resource Zones, and Diplomatic Events globe overlays.
 *
 * This used to be ad-hoc inline JSX in Globe.tsx, gated by
 * `visualizationMode.mode === 'GeoPolitical'` — unreachable from CyberCommand
 * or EcoNatural even though the three layers it controls render in any mode
 * (each is driven by its own overlay toggle in VisualizationOverlayContext,
 * not by which primary mode is selected). Opened from CyberCommandRightSideRail's
 * ⚙️ button, next to the 🗺️/⛽/🤝 overlay toggles it configures — reachable from
 * anywhere, matching where the layers themselves are actually visible.
 *
 * The Resource Zones and Diplomatic Events sections were added after this
 * component's own docstring already claimed to cover them — their real data/config
 * existed but had no reachable settings UI until now (both sub-modes' dedicated
 * *SettingsContainer.tsx components were separately orphaned, zero importers).
 *
 * Conflict Zones (⚔️) is the third GeoPolitical overlay: real GDELT conflict/violence
 * events + real UNHCR displacement magnitudes, see useConflictZones3D.ts.
 */
import { DIPLOMATIC_CATEGORIES, diplomaticEventColor } from '../../../geopolitical/theme/diplomaticEventTheme';
import { DIPLOMACY_CATEGORY_SYMBOLS } from '../../../symbols/symbolRegistry';
import { SymbolIcon } from '../../../symbols/SymbolIcon';
import { useGlobeLayerDrawn } from '../../Globe/Hooks/drawnGlobeLayers';
import { useGdeltSpan } from '../../../geopolitical/hooks/useGdeltSpan';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { counted, fill, messagesNow, numbered } from '../../../i18n/app/i18n';
import { CONFIDENCE_CHOICES, diplomaticFilterCounts, OUTLET_CHOICES, SAID_OR_DONE_CHOICES } from '../../../geopolitical/utils/diplomaticEventFilters';
import { useGeoPoliticalSettings, type GeoPoliticalConfig } from '../../../hooks/useGeoPoliticalSettings';
import { useVisualizationOverlay } from '../../../hooks/useVisualizationOverlay';
import { useResourceZonePercentiles } from '../../../geopolitical/hooks/useResourceZonePercentiles';
import { useRealDiplomaticEvents } from '../../../geopolitical/hooks/useRealDiplomaticEvents';
import { useRealConflictEvents } from '../../../geopolitical/hooks/useRealConflictEvents';
import { useRealDisplacementData } from '../../../geopolitical/hooks/useRealDisplacementData';
import type { ResourceType } from '../../../geopolitical/theme/resourceZoneTheme';
import styles from './GeopoliticalLayersPopup.module.css';
import {
  BORDER_KINDS,
  BORDER_KIND_LABELS,
  BORDER_SWATCHES,
  TERRITORY_CROSS_FADE_MS,
  TERRITORY_LOOK_RANGES,
  TERRITORY_STYLES,
  TERRITORY_STYLE_DEFAULTS,
  TERRITORY_STYLE_LABELS,
  borderSwatchesFor,
  crossFadeMsOf,
  type TerritoryStyle,
} from '../../../geopolitical/theme/territoryStyles';
import { cssColorOf } from '../../../services/globe/globeLegendStore';

/** What the country names slider is set to, in words a screen reader says. */
function namesValueText(value: number): string {
  if (value <= 0) return '0: no country names';
  if (value === 60) return "60: Natural Earth's own";
  return `${value}: ${value < 60 ? 'fewer names' : 'more names'}`;
}

/** What each territories style looks like, in a line (decision K5). */
const TERRITORY_STYLE_HINTS: Record<TerritoryStyle, string> = {
  classic: 'Four colours, no two neighbours alike, green borders.',
  quiet: 'One dark tone, pale borders.',
};
import { SourceStatusBadge, type SourceState } from '../../Shared/SourceStatus';

type LodMode = NonNullable<GeoPoliticalConfig['nationalTerritories']['lod']>['mode'];

interface GeopoliticalLayersPopupProps {
  onClose: () => void;
}

const INTEGRITY_LABELS: Record<string, string> = {
  idle: '—',
  verifying: 'Verifying',
  verified: 'Verified',
  mismatch: 'Mismatch',
  error: 'Error'
};

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  oil: 'Oil',
  gas: 'Natural Gas',
  minerals: 'Minerals',
  water: 'Water',
  renewable: 'Renewable'
};

const CONFIDENCE_WORDS = { 0: 'any', 50: 'fifty', 80: 'eighty' } as const;
const PLACE_BY_CHOICES = ['event', 'actors'] as const;

/** How many events a choice keeps (D-DP, DP10), with the number said in words for a hover or a screen reader. */
const KeepsCount: React.FC<{ n: number | null; end?: boolean }> = ({ n, end }) => n === null ? null : (
  <span
    className={end ? `${styles.count} ${styles.countEnd}` : styles.count}
    data-testid="diplomatic-count"
    title={counted(messagesNow().diplomacy.keeps, n)}
    aria-label={counted(messagesNow().diplomacy.keeps, n)}
  >
    {numbered(n)}
  </span>
);

/*
 * There were Time Range sliders for Diplomacy and Conflict Zones here, hours back from the GDELT
 * snapshot: a second cursor beside the shared time. The shared time decides now (D-E; D-DP, DP15):
 * live shows the snapshot's whole day, a paused window what falls in it.
 */

// Real-data status badge for the three sections backed by useRealDataLayer (see that
// hook) — previously none of ResourceZones/DiplomaticEvents/ConflictZones surfaced any
// loading state at all, so toggling one on showed nothing for up to a couple of seconds
// with zero feedback that a real fetch was in flight. `pausedByBudget` also needs to be
// visible here, not just logged — it's a real, user-facing consequence (this layer
// stopped refreshing) that a toggle-off/toggle-on is required to clear.
interface DataStatusInfo {
  label: string;
  /** The shared status (plan item 8.3c), so a colour means here what it means elsewhere. */
  state: SourceState;
  detail?: string;
}

/** What a layer's hook says of its last read (useRealDataLayer's shape). */
interface ReadStatus {
  loading: boolean;
  pausedByBudget: boolean;
  lastUpdated: number | null;
  error: string | null;
}

const ageLabel = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

/**
 * `dataAsOf`, when given, is the time the data itself is from — the GDELT snapshot's
 * own time. Without it this said "Live · 12s ago" for a day of events built at the
 * last deploy, measuring the READ and presenting it as the data's freshness.
 *
 * A failed read says so (plan item 8.3b). It said "Live", in green, from the read
 * before it. Ages are measured from `now`, which the popup moves every second; it
 * used the time of the render, so an open popup said "5s ago" for as long as it
 * stayed open.
 */
function describeDataStatus(read: ReadStatus, now: number, dataAsOf?: number | null): DataStatusInfo | null {
  const { loading, pausedByBudget, lastUpdated, error } = read;
  if (pausedByBudget) return { label: 'Paused (budget)', state: 'paused' };
  if (error) {
    const label = lastUpdated === null ? 'Failed' : `Failed · last worked ${ageLabel(now - lastUpdated)} ago`;
    return { label, state: 'failed', detail: error };
  }
  if (loading && lastUpdated === null) return { label: 'Loading…', state: 'loading' };
  if (lastUpdated === null) return null;
  if (dataAsOf != null) return { label: `Snapshot · ${ageLabel(now - dataAsOf)} old`, state: 'snapshot' };
  return { label: `Live · ${ageLabel(now - lastUpdated)} ago`, state: 'ready' };
}

const DataStatusBadge: React.FC<{ status: DataStatusInfo | null }> = ({ status }) => {
  if (!status) return null;
  return <SourceStatusBadge state={status.state} text={status.label} title={status.detail} />;
};

const GeopoliticalLayersPopup: React.FC<GeopoliticalLayersPopupProps> = ({ onClose }) => {
  const { config, updateNationalTerritories, updateResourceZones, updateDiplomaticEvents, updateConflictZones, geoIntegrity, layerErrors, territoryStyle, territoryLooks, updateTerritoryLook, setTerritoryStyle, resetTerritoryLook } = useGeoPoliticalSettings();
  const look = territoryLooks[territoryStyle];
  const { resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled } = useVisualizationOverlay();
  const resourceZonesDrawn = useGlobeLayerDrawn('ResourceZones');
  const diplomaticEventsDrawn = useGlobeLayerDrawn('DiplomaticEvents');
  const conflictZonesDrawn = useGlobeLayerDrawn('ConflictZones');
  const territories = config.nationalTerritories;
  // What the fill opacity was before it was switched off, so re-enabling gives
  // back the value the operator chose rather than jumping to an arbitrary 50.
  const rememberedOpacity = useRef(territories.territoryColors.opacity || 50);
  // lod is optional in the config; the panel needs a concrete object to read
  // from, and these are the same defaults the renderer falls back to.
  const lod = territories.lod ?? { mode: 'auto' as const, lockedLevel: 2 as const, hysteresis: 25 };
  const resourceZones = config.resourceZones;
  const diplomaticEvents = config.diplomaticEvents;
  const conflictZones = config.conflictZones;

  // Same hooks the 3D layers themselves call (useResourceZones3D.ts/useDiplomaticEvents3D.ts/
  // useConflictZones3D.ts) — pollerRegistry dedupes by key, so this doesn't trigger a second
  // real fetch, just a second React-state view onto the same underlying poller/cache.
  // On as the globe has them on: the overlay, or the layer drawn from its sub-mode or a pin
  // (Globe.tsx's conflictZonesOn and the rest; drawnGlobeLayers.ts).
  const resourceZonesOn = resourceZonesOverlayEnabled || resourceZonesDrawn;
  const diplomaticEventsOn = diplomaticEventsOverlayEnabled || diplomaticEventsDrawn;
  const conflictZonesOn = conflictZonesOverlayEnabled || conflictZonesDrawn;
  const resourceZonesStatus = useResourceZonePercentiles(resourceZonesOn);
  const diplomaticEventsStatus = useRealDiplomaticEvents(diplomaticEventsOn);
  const diplomacyWords = messagesNow().diplomacy;
  const diplomaticFilters = diplomaticEvents.filters;
  // Null until the day's events are read: a 0 would say a choice keeps nothing.
  const { span: diplomaticSpan } = useGdeltSpan({ from: diplomaticEventsStatus.from ?? null, asOf: diplomaticEventsStatus.asOf ?? null });
  const diplomaticCounts = useMemo(
    () => typeof diplomaticEventsStatus.asOf !== 'number' ? null
      : diplomaticFilterCounts(diplomaticEventsStatus.events, diplomaticEvents, diplomaticSpan),
    [diplomaticEventsStatus.events, diplomaticEventsStatus.asOf, diplomaticEvents, diplomaticSpan],
  );
  const conflictWarEventsStatus = useRealConflictEvents(conflictZonesOn && conflictZones.layerTypes.warEvents);
  const conflictDisplacementStatus = useRealDisplacementData(conflictZonesOn && conflictZones.layerTypes.humanitarianCrisis);
  // ConflictZones has two independent real sources — combine into one status: loading if
  // either is loading, paused if either tripped its own budget, and "live" using whichever
  // source has actually completed a fetch most recently.
  const conflictZonesStatus = {
    loading: conflictWarEventsStatus.loading || conflictDisplacementStatus.loading,
    pausedByBudget: conflictWarEventsStatus.pausedByBudget || conflictDisplacementStatus.pausedByBudget,
    lastUpdated: Math.max(conflictWarEventsStatus.lastUpdated ?? 0, conflictDisplacementStatus.lastUpdated ?? 0) || null,
    // Failed if either source failed: half a layer is not live.
    error: conflictWarEventsStatus.error || conflictDisplacementStatus.error
  };

  // The badges' clock, moved every second while the popup is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const integrityLabel = geoIntegrity.status === 'mismatch' && geoIntegrity.mismatchCount
    ? `Mismatch ${geoIntegrity.mismatchCount}`
    : INTEGRITY_LABELS[geoIntegrity.status];

  const hasErrors = layerErrors.nationalTerritories || layerErrors.resourceZones || layerErrors.diplomaticEvents || layerErrors.conflictZones || layerErrors.zones || layerErrors.spheres || layerErrors.organisations;

  return (
    <section className={styles.popup} aria-label="Geopolitical layers popup">
      <header className={styles.header}>
        <h2 className={styles.title}>Geopolitical Layers</h2>
        <span className={`${styles.integrityBadge} ${styles[`integrity-${geoIntegrity.status}`]}`}>
          {integrityLabel}
        </span>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close geopolitical layers popup"
        >
          ✕
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>National Territories</div>

          {/*
            * The style (decision K5). Every setting below belongs to the style
            * chosen here: each keeps its own, so switching loses nothing.
            */}
          <div className={styles.styleRow} role="radiogroup" aria-label="Territories style">
            {TERRITORY_STYLES.map((style) => (
              <label key={style} className={styles.styleOption} data-active={territoryStyle === style ? '' : undefined}>
                <input
                  type="radio"
                  name="territory-style"
                  value={style}
                  checked={territoryStyle === style}
                  onChange={() => setTerritoryStyle(style)}
                />
                {TERRITORY_STYLE_LABELS[style]}
              </label>
            ))}
          </div>
          <p className={styles.hint}>
            {TERRITORY_STYLE_HINTS[territoryStyle]} The settings below are this style&apos;s. Cards draw Quiet, without names.
          </p>

          {/*
            * "Fills" used to be a checkbox that wrote opacity 50 when checked and
            * 0 when unchecked, sitting directly above the opacity slider. The two
            * fought: dragging opacity to 0 silently unchecked the box, and
            * re-checking it threw away whatever value had been chosen and jumped
            * back to 50. The checkbox now remembers what it hid.
            */}
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={territories.territoryColors.opacity > 0}
              onChange={e => {
                if (e.target.checked) {
                  updateNationalTerritories({
                    territoryColors: { ...territories.territoryColors, opacity: rememberedOpacity.current },
                  });
                } else {
                  rememberedOpacity.current = territories.territoryColors.opacity || 50;
                  updateNationalTerritories({
                    territoryColors: { ...territories.territoryColors, opacity: 0 },
                  });
                }
              }}
            />
            Fills
          </label>
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Fill opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={territories.territoryColors.opacity}
              onChange={e => updateNationalTerritories({
                territoryColors: { ...territories.territoryColors, opacity: parseInt(e.target.value, 10) }
              })}
              className={styles.slider}
              aria-label="Territory fill opacity, percent"
            />
            <span className={styles.sliderValue}>{territories.territoryColors.opacity}</span>
          </label>
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Shading</span>
            <input
              type="range"
              min={TERRITORY_LOOK_RANGES.shading.min}
              max={TERRITORY_LOOK_RANGES.shading.max}
              step={5}
              value={look.shading}
              onChange={e => updateTerritoryLook({ shading: parseInt(e.target.value, 10) })}
              className={styles.slider}
              aria-label="Fill shading, percent"
            />
            <span className={styles.sliderValue}>{look.shading}</span>
          </label>

          {/* A "Colour scheme" select sat here — Default, Political, Economic,
              Population. It chose which palette each country's id was hashed
              into, so its names promised an encoding the colours never had.
              The hash is gone (materialTheme.ts), every country is one quiet
              tone, and a select whose options change nothing reads as broken. */}

          <div className={styles.subTitle}>Borders</div>
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Visibility</span>
            <input
              type="range"
              min={0}
              max={100}
              value={territories.borderVisibility}
              onChange={e => updateNationalTerritories({ borderVisibility: parseInt(e.target.value, 10) })}
              className={styles.slider}
              aria-label="Border visibility, percent"
            />
            <span className={styles.sliderValue}>{territories.borderVisibility}</span>
          </label>
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Thickness</span>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.1}
              value={territories.borderThickness}
              onChange={e => updateNationalTerritories({ borderThickness: parseFloat(e.target.value) })}
              className={styles.slider}
              aria-label="Border thickness"
            />
            <span className={styles.sliderValue}>{territories.borderThickness.toFixed(1)}</span>
          </label>
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Dash length</span>
            <input
              type="range"
              min={TERRITORY_LOOK_RANGES.dashLength.min}
              max={TERRITORY_LOOK_RANGES.dashLength.max}
              step={10}
              value={look.dashLength}
              onChange={e => updateTerritoryLook({ dashLength: parseInt(e.target.value, 10) })}
              className={styles.slider}
              aria-label="Dash length of unsettled borders, percent"
            />
            <span className={styles.sliderValue}>{look.dashLength}</span>
          </label>
          {/*
            * A colour per kind, from the palette (owner, 2026-10-08): red only for a
            * disputed border and amber only for a line of control, which they mean.
            */}
          {BORDER_KINDS.map((kind) => (
            <div key={kind} className={styles.swatchRow} role="radiogroup" aria-label={`${BORDER_KIND_LABELS[kind]} border colour`}>
              <span className={styles.sliderLabel}>{BORDER_KIND_LABELS[kind]}</span>
              {borderSwatchesFor(kind).map((swatch) => (
                <label key={swatch} className={styles.swatchOption} title={BORDER_SWATCHES[swatch].label}>
                  <input
                    type="radio"
                    name={`border-colour-${kind}`}
                    value={swatch}
                    checked={look.borderColours[kind] === swatch}
                    onChange={() => updateTerritoryLook({ borderColours: { [kind]: swatch } })}
                    aria-label={BORDER_SWATCHES[swatch].label}
                  />
                  <span className={styles.swatch} style={{ backgroundColor: cssColorOf(BORDER_SWATCHES[swatch].hex) }} aria-hidden="true" />
                </label>
              ))}
            </div>
          ))}
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={territories.showDisputedTerritories}
              onChange={e => updateNationalTerritories({ showDisputedTerritories: e.target.checked })}
            />
            Disputed borders
          </label>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={territories.showMaritimeBorders}
              onChange={e => updateNationalTerritories({ showMaritimeBorders: e.target.checked })}
            />
            Maritime borders
          </label>

          <div className={styles.subTitle}>Labels &amp; interaction</div>
          {/*
            * How many country names the screen shows (decision K5, step 4). It moves
            * Natural Earth's own thresholds; collision has the last word, so names
            * never overlap at any setting.
            */}
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Country names</span>
            <input
              type="range"
              min={0}
              max={100}
              value={territories.labelVisibility}
              onChange={e => updateNationalTerritories({ labelVisibility: parseInt(e.target.value, 10) })}
              className={styles.slider}
              aria-label="Country names, how many"
              aria-valuetext={namesValueText(territories.labelVisibility)}
            />
            <span className={styles.sliderValue}>{territories.labelVisibility}</span>
          </label>
          <p className={styles.hint}>
            By Natural Earth&apos;s rank: the largest far out, more as you come in. 0 hides them; 60 is Natural Earth&apos;s own choice. Cards show names only when a shot asks.
          </p>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={territories.highlightOnHover}
              onChange={e => updateNationalTerritories({ highlightOnHover: e.target.checked })}
            />
            Highlight on hover
          </label>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={!!territories.reducedMotion}
              onChange={e => updateNationalTerritories({ reducedMotion: e.target.checked })}
            />
            Reduced motion
          </label>
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Cross-fade</span>
            <input
              type="range"
              min={TERRITORY_CROSS_FADE_MS.min}
              max={TERRITORY_CROSS_FADE_MS.max}
              step={100}
              value={crossFadeMsOf(territories)}
              onChange={e => updateNationalTerritories({ crossFadeMs: parseInt(e.target.value, 10) })}
              className={styles.slider}
              aria-label="Cross-fade length, milliseconds"
            />
            {/* In seconds, so it fits its column as the other values do. */}
            <span className={styles.sliderValue}>{(crossFadeMsOf(territories) / 1000).toFixed(1)}s</span>
          </label>

          {/*
            * Collapsed by default. These matter when something looks wrong — a
            * border shimmering against the fill, detail popping as the camera
            * moves — and never when someone is choosing a colour. Putting them
            * behind a disclosure is why the common controls above stay reachable
            * without scrolling.
            */}
          <details className={styles.advanced}>
            <summary>Rendering &amp; detail</summary>
            <p className={styles.hint}>
              Only worth touching if borders shimmer against fills, or detail pops
              as the camera moves.
            </p>

            <label className={styles.selectRow}>
              <span className={styles.sliderLabel}>Detail level</span>
              <select
                className={styles.select}
                value={lod.mode}
                onChange={e => updateNationalTerritories({
                  lod: { ...lod, mode: e.target.value as LodMode },
                })}
              >
                <option value="auto">Auto (by distance)</option>
                <option value="locked">Locked</option>
              </select>
            </label>

            {lod.mode === 'locked' ? (
              <label className={styles.selectRow}>
                <span className={styles.sliderLabel}>Locked to</span>
                <select
                  className={styles.select}
                  value={lod.lockedLevel}
                  onChange={e => updateNationalTerritories({
                    lod: { ...lod, lockedLevel: parseInt(e.target.value, 10) as 0 | 1 | 2 },
                  })}
                >
                  <option value={0}>Coarse</option>
                  <option value={1}>Medium</option>
                  <option value={2}>Fine</option>
                </select>
              </label>
            ) : (
              <label className={styles.sliderRow}>
                <span className={styles.sliderLabel}>Switch margin</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={lod.hysteresis}
                  onChange={e => updateNationalTerritories({
                    lod: { ...lod, hysteresis: parseInt(e.target.value, 10) },
                  })}
                  className={styles.slider}
                  aria-label="Detail switching margin"
                />
                <span className={styles.sliderValue}>{lod.hysteresis}</span>
              </label>
            )}

            <label className={styles.sliderRow}>
              <span className={styles.sliderLabel}>Fill lift</span>
              <input
                type="range"
                min={TERRITORY_LOOK_RANGES.height.min}
                max={TERRITORY_LOOK_RANGES.height.max}
                step={0.01}
                value={territories.fillElevationEpsilon ?? TERRITORY_STYLE_DEFAULTS[territoryStyle].height}
                onChange={e => updateNationalTerritories({ fillElevationEpsilon: parseFloat(e.target.value) })}
                className={styles.slider}
                aria-label="Fill elevation above the globe surface"
              />
              <span className={styles.sliderValue}>{(territories.fillElevationEpsilon ?? TERRITORY_STYLE_DEFAULTS[territoryStyle].height).toFixed(2)}</span>
            </label>

            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={territories.usePolygonOffset !== false}
                onChange={e => updateNationalTerritories({ usePolygonOffset: e.target.checked })}
              />
              Depth offset for fills
            </label>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={territories.frontSideOnly !== false}
                onChange={e => updateNationalTerritories({ frontSideOnly: e.target.checked })}
              />
              Hide far-side geometry
            </label>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={!!territories.bvhPicking}
                onChange={e => updateNationalTerritories({ bvhPicking: e.target.checked })}
              />
              Accelerated picking
            </label>

            <div className={styles.resetRow}>
              {/*
                * To the defaults (useGeoPoliticalSettings.ts). This wrote a lift of
                * 0.5 and far-side hiding on, against defaults of 0.2 and off, so
                * "reset" left the fills higher than a first visit's.
                */}
              <button
                type="button"
                className={styles.resetButton}
                onClick={() => updateNationalTerritories({
                  fillElevationEpsilon: TERRITORY_STYLE_DEFAULTS[territoryStyle].height,
                  usePolygonOffset: true,
                  polygonOffsetFactor: -1.5,
                  polygonOffsetUnits: -1.5,
                  frontSideOnly: false,
                  lod: { mode: 'auto', lockedLevel: 2, hysteresis: 25 },
                })}
              >
                Reset rendering
              </button>
            </div>
          </details>

          <div className={styles.resetRow}>
            <button type="button" className={styles.resetButton} onClick={() => resetTerritoryLook(territoryStyle)}>
              Reset {TERRITORY_STYLE_LABELS[territoryStyle]}
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <div className={styles.sectionTitle}>Resource Zones</div>
            <DataStatusBadge status={describeDataStatus(resourceZonesStatus, now)} />
          </div>
          {(Object.keys(resourceZones.resourceTypes) as ResourceType[]).map((type) => (
            <label key={type} className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={resourceZones.resourceTypes[type]}
                onChange={e => updateResourceZones({
                  resourceTypes: { ...resourceZones.resourceTypes, [type]: e.target.checked }
                })}
              />
              {RESOURCE_TYPE_LABELS[type]}
            </label>
          ))}
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={resourceZones.zoneOpacity}
              onChange={e => updateResourceZones({ zoneOpacity: parseInt(e.target.value, 10) })}
              className={styles.slider}
            />
            <span className={styles.sliderValue}>{resourceZones.zoneOpacity}</span>
          </label>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={resourceZones.showTradeRoutes}
              onChange={e => updateResourceZones({ showTradeRoutes: e.target.checked })}
            />
            Trade Routes
          </label>
          {resourceZones.showTradeRoutes && (
            <label className={styles.sliderRow}>
              <span className={styles.sliderLabel}>Intensity</span>
              <input
                type="range"
                min={0}
                max={100}
                value={resourceZones.tradeRouteIntensity}
                onChange={e => updateResourceZones({ tradeRouteIntensity: parseInt(e.target.value, 10) })}
                className={styles.slider}
              />
              <span className={styles.sliderValue}>{resourceZones.tradeRouteIntensity}</span>
            </label>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <div className={styles.sectionTitle}>Diplomatic Events</div>
            <DataStatusBadge status={describeDataStatus(diplomaticEventsStatus, now, diplomaticEventsStatus.asOf)} />
          </div>
          {/*
            * Every cooperative CAMEO category, in CAMEO's order and words, with the glyph and colour it
            * is drawn in (D-DP, DP4); then the filters (DP10). Each choice says how many of the day's
            * events it keeps, the others as they are, so nothing is hidden without a number on it.
            */}
          {DIPLOMATIC_CATEGORIES.map((category) => (
            <label key={category} className={styles.toggleRow} data-testid={`diplomatic-category-${category}`}>
              <input
                type="checkbox"
                checked={diplomaticEvents.eventTypes[category]}
                onChange={e => updateDiplomaticEvents({
                  eventTypes: { ...diplomaticEvents.eventTypes, [category]: e.target.checked }
                })}
              />
              <SymbolIcon symbol={DIPLOMACY_CATEGORY_SYMBOLS[category]} size={14} color={cssColorOf(diplomaticEventColor(category))} />
              <span data-testid="diplomatic-name">{diplomacyWords.categories[category].many}</span>
              <KeepsCount n={diplomaticCounts?.categories[category] ?? null} end />
            </label>
          ))}
          <div className={styles.subTitle}>{diplomacyWords.placeBy}</div>
          <div className={styles.styleRow} role="radiogroup" aria-label={diplomacyWords.placeBy}>
            {PLACE_BY_CHOICES.map((choice) => (
              <label key={choice} className={styles.styleOption} data-active={diplomaticEvents.placeBy === choice ? '' : undefined} data-testid={`diplomatic-place-${choice}`}>
                <input
                  type="radio"
                  name="diplomatic-place-by"
                  checked={diplomaticEvents.placeBy === choice}
                  onChange={() => updateDiplomaticEvents({ placeBy: choice })}
                />
                {diplomacyWords.placeByChoices[choice]}
              </label>
            ))}
          </div>
          <p className={styles.hint}>{diplomacyWords.placeByHint}</p>
          <div className={styles.subTitle}>{diplomacyWords.toldBy}</div>
          <div className={styles.styleRow} role="radiogroup" aria-label={diplomacyWords.toldBy}>
            {OUTLET_CHOICES.map((n) => (
              <label key={n} className={styles.styleOption} data-active={diplomaticFilters.minOutlets === n ? '' : undefined} data-testid={`diplomatic-outlets-${n}`}>
                <input
                  type="radio"
                  name="diplomatic-outlets"
                  checked={diplomaticFilters.minOutlets === n}
                  onChange={() => updateDiplomaticEvents({ filters: { ...diplomaticFilters, minOutlets: n } })}
                />
                {counted(diplomacyWords.outlets, n)}
                <KeepsCount n={diplomaticCounts?.minOutlets[n] ?? null} />
              </label>
            ))}
          </div>
          <p className={styles.hint}>{diplomacyWords.toldByHint}</p>
          <div className={styles.subTitle}>{diplomacyWords.saidOrDone}</div>
          <div className={styles.styleRow} role="radiogroup" aria-label={diplomacyWords.saidOrDone}>
            {SAID_OR_DONE_CHOICES.map((choice) => (
              <label key={choice} className={styles.styleOption} data-active={diplomaticFilters.saidOrDone === choice ? '' : undefined} data-testid={`diplomatic-said-${choice}`}>
                <input
                  type="radio"
                  name="diplomatic-said-or-done"
                  checked={diplomaticFilters.saidOrDone === choice}
                  onChange={() => updateDiplomaticEvents({ filters: { ...diplomaticFilters, saidOrDone: choice } })}
                />
                {diplomacyWords.saidOrDoneChoices[choice]}
                <KeepsCount n={diplomaticCounts?.saidOrDone[choice] ?? null} />
              </label>
            ))}
          </div>
          <p className={styles.hint}>{diplomacyWords.saidOrDoneHint}</p>
          {/* From snapshot version 3; a snapshot that carries neither offers neither. */}
          {diplomaticCounts && diplomaticCounts.known.confidence > 0 && (
            <>
              <div className={styles.subTitle}>{diplomacyWords.confidence}</div>
              <div className={styles.styleRow} role="radiogroup" aria-label={diplomacyWords.confidence}>
                {CONFIDENCE_CHOICES.map((percent) => (
                  <label key={percent} className={styles.styleOption} data-active={diplomaticFilters.minConfidence === percent ? '' : undefined} data-testid={`diplomatic-confidence-${percent}`}>
                    <input
                      type="radio"
                      name="diplomatic-confidence"
                      checked={diplomaticFilters.minConfidence === percent}
                      onChange={() => updateDiplomaticEvents({ filters: { ...diplomaticFilters, minConfidence: percent } })}
                    />
                    {diplomacyWords.confidenceChoices[CONFIDENCE_WORDS[percent]]}
                    <KeepsCount n={diplomaticCounts.minConfidence[percent]} />
                  </label>
                ))}
              </div>
              <p className={styles.hint}>{diplomacyWords.confidenceHint}</p>
            </>
          )}
          {diplomaticCounts && diplomaticCounts.known.lead > 0 && (
            <>
              <label className={styles.toggleRow} data-testid="diplomatic-lead">
                <input
                  type="checkbox"
                  checked={diplomaticFilters.leadOnly}
                  onChange={e => updateDiplomaticEvents({ filters: { ...diplomaticFilters, leadOnly: e.target.checked } })}
                />
                {diplomacyWords.leadOnly}
                <KeepsCount n={diplomaticCounts.lead.only} end />
              </label>
              <p className={styles.hint}>{diplomacyWords.leadHint}</p>
            </>
          )}
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={diplomaticEvents.showConnections}
              onChange={e => updateDiplomaticEvents({ showConnections: e.target.checked })}
            />
            Connections
          </label>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={diplomaticEvents.animateEvents}
              onChange={e => updateDiplomaticEvents({ animateEvents: e.target.checked })}
            />
            Animate
          </label>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <div className={styles.sectionTitle}>Conflict Zones</div>
            <DataStatusBadge status={describeDataStatus(conflictZonesStatus, now, conflictZones.layerTypes.warEvents ? conflictWarEventsStatus.asOf : null)} />
          </div>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={conflictZones.layerTypes.warEvents}
              onChange={e => updateConflictZones({
                layerTypes: { ...conflictZones.layerTypes, warEvents: e.target.checked }
              })}
            />
            War Events
          </label>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={conflictZones.layerTypes.humanitarianCrisis}
              onChange={e => updateConflictZones({
                layerTypes: { ...conflictZones.layerTypes, humanitarianCrisis: e.target.checked }
              })}
            />
            Humanitarian Crisis
          </label>
        </div>

        {geoIntegrity.artifacts && geoIntegrity.artifacts.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Asset Integrity</div>
            <div className={styles.artifactList}>
              {geoIntegrity.artifacts.map(a => (
                <div key={a.path} className={styles.artifactRow}>
                  <span className={styles.artifactPath}>{a.path.replace('public/', '')}</span>
                  <span className={`${styles.artifactStatus} ${styles[`artifact-${a.status}`] ?? ''}`}>{a.status}</span>
                  <span className={styles.artifactSize}>{(a.bytes / 1024).toFixed(1)}kB</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The border key that was here is on the globe now, published by the
            territories layer from the borders it actually drew (GlobeLegend).
            This one was typed in by hand, and it was wrong: it showed
            International as one green swatch when international borders came in
            four hashed colours, and drew every swatch solid, never saying the
            dash is what marks a provisional border. */}
        <div className={styles.section}>
          <div className={styles.lodReadout}>
            LOD: {territories.lod?.mode === 'locked' ? `Locked ${territories.lod.lockedLevel}` : 'Auto'}
          </div>
        </div>

        {hasErrors && (
          <div className={styles.errorSection}>
            {layerErrors.nationalTerritories && <div>Territories: {layerErrors.nationalTerritories}</div>}
            {layerErrors.resourceZones && <div>Resource Zones: {layerErrors.resourceZones}</div>}
            {layerErrors.diplomaticEvents && <div>Diplomatic Events: {layerErrors.diplomaticEvents}</div>}
            {layerErrors.conflictZones && <div>Conflict Zones: {layerErrors.conflictZones}</div>}
            {layerErrors.zones && <div>{fill(messagesNow().zones.layerError, { error: layerErrors.zones })}</div>}
            {layerErrors.spheres && <div>{fill(messagesNow().spheres.layerError, { error: layerErrors.spheres })}</div>}
            {layerErrors.organisations && <div>{fill(messagesNow().organisations.layerError, { error: layerErrors.organisations })}</div>}
          </div>
        )}
      </div>
    </section>
  );
};

export default GeopoliticalLayersPopup;
