/**
 * A layer can be drawn more than one way (decision D-F, step 6, part 1).
 *
 * ─── WHAT WAS ALREADY TRUE ─────────────────────────────────────────────────
 *
 * buildScreenPoints has taken `style: 'disc' | 'glow' | 'ring'` for some time,
 * and screenPoints.test.ts proves all three render distinctly. Of the fourteen
 * call sites in the tree, thirteen never pass it — so every layer but one is
 * drawing discs because nobody chose, not because discs were chosen. This part
 * exposes the choice that already exists; it does not add a drawing mode.
 *
 * ─── WHY THE DEFAULTS ARE ALL 'disc' ───────────────────────────────────────
 *
 * Measured, not assumed. The one site that does pass a style is
 * useCyberAttacks3D, and it passes three across FOUR sub-layers:
 *
 *   density      glow, 3x size      crowded regions brighten
 *   newHalo      glow, 2.2x size    new since the last snapshot
 *   indicators   (no style: disc)   the primary mark, rim: 'light'
 *   enrichment   ring, +10px        OTX-corroborated
 *
 * So CyberThreats' primary mark is a disc too, and its glow and ring are not
 * alternative renderings of one mark — they are separate layers whose style
 * IS their meaning. A per-layer style that overrode every draw call would
 * redraw the density bloom as discs and delete what it encodes.
 *
 * Hence the rule this module is built to: a style governs a layer's PRIMARY
 * mark. Auxiliary layers that encode meaning in their style keep it.
 *
 * ─── WHY ONLY CHOICES ARE STORED ───────────────────────────────────────────
 *
 * The stored map holds what the user picked, and nothing else. Defaults are
 * derived at read time. That is the difference between a record that can go
 * stale and one that cannot: a stored full map would freeze today's catalogue
 * into every returning user's localStorage, and the layer added next month
 * would resolve to undefined for all of them — one level below the shallow
 * merge, where no migration can see it.
 */
import { describe, it, expect } from 'vitest';
import {
  MARKER_STYLES,
  DEFAULT_MARKER_STYLES,
  MARKER_STYLE_SUPPORT,
  isMarkerStyle,
  layerHonoursMarkerStyle,
  resolveMarkerStyle,
  type MarkerStyleChoices,
} from '../markerStyles';
import type { GlobeLayerId } from '../Hooks/useGlobeLayerControl';

describe('marker style defaults', () => {
  /*
   * Record<GlobeLayerId, MarkerStyle> makes this compiler-enforced: a layer
   * added to the union without a default is a build error, not a test failure.
   * Asserted anyway because the guarantee is the point of the shape.
   */
  it('gives every layer a default the drawing code can actually draw', () => {
    const ids = Object.keys(DEFAULT_MARKER_STYLES) as GlobeLayerId[];

    expect(ids.length).toBeGreaterThanOrEqual(11);
    for (const id of ids) {
      expect(isMarkerStyle(DEFAULT_MARKER_STYLES[id])).toBe(true);
    }
  });

  /*
   * The defaults must describe what the globe draws TODAY, or turning the
   * switcher on would silently restyle eleven layers at once for every
   * existing user. Thirteen of fourteen call sites take buildScreenPoints'
   * 'disc' default, and the fourteenth draws its primary mark as one.
   *
   * One default was chosen rather than measured: Intel Reports draw as discs
   * with a halo of light, the owner's pick of 25 October (plan H4).
   */
  it('describes what each layer draws today: a disc, and Intel Reports a halo disc', () => {
    for (const [layer, style] of Object.entries(DEFAULT_MARKER_STYLES)) {
      expect(style, layer).toBe(layer === 'IntelReports' ? 'glow' : 'disc');
    }
  });

  /*
   * A change detector on purpose. Widening the shader's union without widening
   * the picker would add a style no user can reach; the Record in the module
   * catches it at compile time and this catches it here.
   */
  it('offers exactly the styles the shader supports', () => {
    expect([...MARKER_STYLES].sort()).toEqual(['disc', 'glow', 'ring']);
  });
});

describe('resolveMarkerStyle', () => {
  it('falls back to the default when the user has chosen nothing', () => {
    expect(resolveMarkerStyle({}, 'IntelReports')).toBe('glow');
    expect(resolveMarkerStyle(undefined, 'Satellites')).toBe('disc');
  });

  it('returns the style the user chose', () => {
    // Glow on IntelReports and ring on Satellites, because Satellites cannot
    // draw a glow — see "the styles a layer can offer" below.
    const chosen: MarkerStyleChoices = { IntelReports: 'glow', Satellites: 'ring' };

    expect(resolveMarkerStyle(chosen, 'IntelReports')).toBe('glow');
    expect(resolveMarkerStyle(chosen, 'Satellites')).toBe('ring');
  });

  /*
   * The case no migration can catch. A user picks a style, their choice map is
   * stored, a layer is added to the catalogue later — loadSettings' merge is
   * top-level, so their stored map survives whole, missing the new layer. It
   * must resolve to that layer's default rather than to undefined.
   */
  it('falls back for a layer the stored choices have never heard of', () => {
    const storedBeforeTheLayerExisted = { IntelReports: 'ring' } as MarkerStyleChoices;

    expect(resolveMarkerStyle(storedBeforeTheLayerExisted, 'ConflictZones')).toBe('disc');
    expect(resolveMarkerStyle(storedBeforeTheLayerExisted, 'IntelReports')).toBe('ring');
  });

  /*
   * localStorage is editable by hand and survives every deploy. An unknown
   * string must not reach buildScreenPoints, where it would fall through the
   * shader's style branches and draw nothing.
   */
  it('refuses a stored value that is not a style', () => {
    const tampered = { IntelReports: 'sparkle', Satellites: '' } as unknown as MarkerStyleChoices;

    expect(resolveMarkerStyle(tampered, 'IntelReports')).toBe('glow');
    expect(resolveMarkerStyle(tampered, 'Satellites')).toBe('disc');
  });

  it('knows a style from anything else', () => {
    expect(isMarkerStyle('glow')).toBe(true);
    expect(isMarkerStyle('sparkle')).toBe(false);
    expect(isMarkerStyle(undefined)).toBe(false);
    expect(isMarkerStyle(null)).toBe(false);
    expect(isMarkerStyle(3)).toBe(false);
  });
});

/*
 * These read out of localStorage, which is hand-editable and outlives every
 * deploy. Both cases are ones the type signature forbids and the runtime
 * cannot.
 */
describe('marker styles, given input the types said was impossible', () => {
  /*
   * `'constructor' in EVERY_MARKER_STYLE` is true through the prototype chain.
   * A membership test written with `in` would accept it, store it, and hand
   * "constructor" to the shader as a style.
   */
  it('does not accept an inherited property as a style', () => {
    expect(isMarkerStyle('constructor')).toBe(false);
    expect(isMarkerStyle('toString')).toBe(false);
    expect(isMarkerStyle('hasOwnProperty')).toBe(false);
    expect(isMarkerStyle('__proto__')).toBe(false);
  });

  it('still returns a drawable style for a layer id it has never heard of', () => {
    const unknown = 'AlienBases' as GlobeLayerId;

    expect(isMarkerStyle(resolveMarkerStyle({}, unknown))).toBe(true);
    expect(resolveMarkerStyle({}, unknown)).toBe('disc');
  });
});

/*
 * Which layers a chosen style actually reaches.
 *
 * The switcher is absent wherever this says the style would not be read,
 * because a control that stores a value nothing draws is the "setting, not a
 * feature" this step keeps warning about. Three states rather than a boolean,
 * so "cannot ever" and "not wired yet" stay distinguishable: ResourceZones
 * draws a mesh, border line batches and trade-route lines and will never have
 * screen-point marks, while the not-yet layers are remaining work.
 */
describe('which layers honour a chosen style', () => {
  it('declares a state for every layer, so a new one cannot inherit an answer', () => {
    const ids = Object.keys(DEFAULT_MARKER_STYLES) as GlobeLayerId[];

    for (const id of ids) {
      expect(['honoured', 'not-yet', 'no-marks', 'shape-is-the-legend']).toContain(MARKER_STYLE_SUPPORT[id]);
    }
    expect(Object.keys(MARKER_STYLE_SUPPORT).sort()).toEqual(ids.sort());
  });

  /*
   * ResourceZones is the measured exception: useResourceZones3D builds a
   * THREE.Mesh, buildBorderLineBatches and buildTradeRouteLines, and calls
   * buildScreenPoints nowhere. Its state is not "not yet".
   */
  it('says ResourceZones has no marks to style, rather than calling it unfinished', () => {
    expect(MARKER_STYLE_SUPPORT.ResourceZones).toBe('no-marks');
    expect(layerHonoursMarkerStyle('ResourceZones')).toBe(false);
  });

  it('honours only what is wired, and something is', () => {
    const honoured = (Object.keys(MARKER_STYLE_SUPPORT) as GlobeLayerId[])
      .filter((id) => layerHonoursMarkerStyle(id));

    expect(honoured.length).toBeGreaterThan(0);
    for (const id of honoured) {
      expect(MARKER_STYLE_SUPPORT[id]).toBe('honoured');
    }
  });

  it('does not honour a layer still marked not-yet', () => {
    const notYet = (Object.keys(MARKER_STYLE_SUPPORT) as GlobeLayerId[])
      .filter((id) => MARKER_STYLE_SUPPORT[id] === 'not-yet');

    for (const id of notYet) {
      expect(layerHonoursMarkerStyle(id)).toBe(false);
    }
  });
});

/*
 * Every layer offers every style (decision D-F, step 6.3).
 *
 * It did not, for four months of this step. A glow was a bloom BEHIND the mark
 * and that pairing lived in useScreenMarkLayer, which builds two objects; a
 * layer calling buildScreenPoints directly got one, so a glow there was a faint
 * halo with nothing inside it — very nearly invisible as measured on the intel
 * anchors. A `markerStyleOptionsFor(layerId)` withheld glow from the three
 * layers in that position, so the switcher could not offer a click that hides a
 * layer.
 *
 * GLOW_QUAD_SCALE moved the pairing into the shader on 2026-09-18. One object
 * draws a glowing mark, every caller gets it, and the per-layer list is gone —
 * so these tests pin its ABSENCE, because reintroducing a filter here is how the
 * switcher would quietly start showing different options per layer again.
 */
describe('the styles a layer can offer', () => {
  it('offers exactly the three ways of drawing a mark', () => {
    expect([...MARKER_STYLES].sort()).toEqual(['disc', 'glow', 'ring']);
  });

  it('does not offer the bloom, which is light rather than a mark', () => {
    expect(MARKER_STYLES).not.toContain('bloom');
    expect(isMarkerStyle('bloom')).toBe(false);
  });

  it('offers the same styles to every layer, including the direct callers', () => {
    // Satellites, Diplomacy and Eco Disasters are the three that were withheld.
    for (const id of Object.keys(DEFAULT_MARKER_STYLES) as GlobeLayerId[]) {
      expect(resolveMarkerStyle({ [id]: 'glow' }, id)).toBe('glow');
    }
  });

  it('honours a stored glow on a layer that once could not draw one', () => {
    expect(resolveMarkerStyle({ Satellites: 'glow' }, 'Satellites')).toBe('glow');
    expect(resolveMarkerStyle({ DiplomaticEvents: 'glow' }, 'DiplomaticEvents')).toBe('glow');
    expect(resolveMarkerStyle({ EcologicalDisasters: 'glow' }, 'EcologicalDisasters')).toBe('glow');
  });

  it('still refuses a stored value that is not a way of drawing a mark', () => {
    // localStorage is hand-editable, and `bloom` is a real shader style — so it
    // is the one wrong value a person could plausibly put there.
    const stored = { Satellites: 'bloom' } as unknown as MarkerStyleChoices;
    expect(resolveMarkerStyle(stored, 'Satellites')).toBe('disc');
  });

  it('still honours a ring everywhere', () => {
    expect(resolveMarkerStyle({ Satellites: 'ring' }, 'Satellites')).toBe('ring');
  });
});
