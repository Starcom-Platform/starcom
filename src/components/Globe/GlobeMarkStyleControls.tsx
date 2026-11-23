import React from 'react';
import Circle from '@mui/icons-material/Circle';
import Flare from '@mui/icons-material/Flare';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import { Docked } from '../Dock/Docked';
import {
  MARKER_STYLES, layerHonoursMarkerStyle, resolveMarkerStyle,
  type MarkerStyle, type MarkerStyleChoices,
} from './markerStyles';
import { layerLabel, type GlobeLayerId } from './Hooks/useGlobeLayerControl';

/**
 * How the layer in front draws its marks (decision D-F, step 6, part 2).
 *
 * ─── WHY IT ACTS ON ONE LAYER ──────────────────────────────────────────────
 *
 * Three buttons for the current sub-mode's layer, rather than a row per active
 * layer. A row each reaches eleven, needs a collapse toggle, and competes for
 * corner height with the notes stack already in bottom-left — and the choice a
 * person wants to make is almost always about what they are looking at. The
 * layer is named beside the buttons for the case that makes this safe: since it
 * follows whatever is in front, a click must never restyle something the person
 * had stopped looking at.
 *
 * ─── WHY IT SOMETIMES RENDERS NOTHING ──────────────────────────────────────
 *
 * A style is only a feature on a layer that reads one. ResourceZones draws a
 * mesh and line batches and never will; the layers still awaiting their wiring
 * would store a choice nothing draws. On both, three buttons whose clicks leave
 * the globe unchanged read as a broken control, so the slot renders nothing and
 * the arrangement closes over it. `markerStyles.ts` holds which is which, and
 * this asks rather than deciding — see MARKER_STYLE_SUPPORT.
 */
// One row, the name beside the buttons (BD4): stacked, it took 55px of a left
// column that ran over the clock at 1280×720.
const box: React.CSSProperties = {
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  color: '#00ffff',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  lineHeight: 1.3,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
};

const nameStyle: React.CSSProperties = {
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  opacity: 0.75,
  whiteSpace: 'nowrap',
};

const row: React.CSSProperties = { display: 'flex', gap: '4px' };

const buttonStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '26px',
  height: '26px',
  padding: 0,
  cursor: 'pointer',
  borderRadius: '3px',
  border: `1px solid ${active ? '#00ffff' : 'rgba(0, 255, 255, 0.3)'}`,
  backgroundColor: active ? 'rgba(0, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.35)',
  color: active ? '#00ffff' : 'rgba(0, 255, 255, 0.6)',
});

/*
 * A Record over the style union, so adding a style to the shader cannot leave a
 * button unbuilt — the same reason markerStyles.ts writes its style list this
 * way. Each icon is shaped like what it draws: a filled disc, a soft bloom, an
 * open ring, so the button reads without its label being visible.
 */
const PRESENTATION: Record<MarkerStyle, { Icon: React.ElementType; name: string; says: string }> = {
  disc: { Icon: Circle, name: 'Disc', says: 'Filled discs' },
  // Not "brighter where marks crowd" — that was true when a glow was additive
  // light, and it is the one thing this style deliberately stopped doing. See
  // ScreenPointStyle: the crowd-brightening one is `bloom`, which nobody picks.
  glow: { Icon: Flare, name: 'Glow', says: 'Discs with a halo of light around them' },
  ring: { Icon: RadioButtonUnchecked, name: 'Ring', says: 'Open rings' },
};

export interface GlobeMarkStyleControlsProps {
  /** The layer in front — whichever the current sub-mode draws. */
  layerId: GlobeLayerId;
  /** What the person has chosen so far, for every layer. */
  styles: MarkerStyleChoices;
  onPick: (layerId: GlobeLayerId, style: MarkerStyle) => void;
}

export const GlobeMarkStyleControls: React.FC<GlobeMarkStyleControlsProps> = ({
  layerId, styles, onPick,
}) => {
  if (!layerHonoursMarkerStyle(layerId)) return null;

  const label = layerLabel(layerId);
  const current = resolveMarkerStyle(styles, layerId);

  return (
    <Docked slot="globeMarkStyle">
      <div
        data-testid="globe-mark-style"
        style={box}
        role="group"
        aria-label={`Mark style for ${label}`}
      >
        <span style={nameStyle}>{label}</span>
        <div style={row}>
          {MARKER_STYLES.map((style) => {
            const { Icon, name, says } = PRESENTATION[style];
            const active = style === current;
            return (
              <button
                key={style}
                type="button"
                onClick={() => onPick(layerId, style)}
                aria-pressed={active}
                aria-label={name}
                title={says}
                data-style={style}
                style={buttonStyle(active)}
              >
                <Icon style={{ fontSize: '16px' }} />
              </button>
            );
          })}
        </div>
      </div>
    </Docked>
  );
};

export default GlobeMarkStyleControls;
