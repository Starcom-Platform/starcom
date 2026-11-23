/**
 * Intel Report marks as billboarded sprites (decision D-F, step 6, part 4).
 *
 * ─── WHY NOT THE MODEL ─────────────────────────────────────────────────────
 *
 * `intel_report-01d.glb` is 182 triangles, 508 vertices, one mesh, one material
 * — nothing. The cost was never the polygons; it was per mark. Each report got
 * a mesh, a raycast target and a draw call, which `useGlobeRLSH` already
 * records in its own comment alongside thirteen models stacked in Seattle where
 * one is visible. This is one THREE.Points for every report on the globe: one
 * draw call, one raycast target, and a fixed on-screen size so a mark stays
 * legible at any zoom instead of shrinking to a pixel.
 *
 * The model stayed as the fallback where no artwork could be baked, and spun in
 * every report's popup and tooltip, each in a WebGL context of its own. It was
 * retired on 2026-10-08: the fallback is plain shapes in this shader, and the
 * popup and tooltip show the report's glyph (IntelReportGlyph).
 *
 * ─── WHY NOT A screenPoints STYLE ──────────────────────────────────────────
 *
 * It would have been tempting — screenPoints is the shared substrate and
 * already owns sizing, rims, tooltips and render order. But it is shared by ten
 * layers, and this needs two things none of the others do: a per-point atlas
 * cell and a clock. Adding a texture path and a running clock to the module
 * every layer draws through, for one layer's benefit, is the wrong trade. This
 * follows screenPoints' shape deliberately — same uniforms, same
 * `onBeforeRender` hook, same `frustumCulled = false` and tooltip contract — so
 * the two read as siblings rather than as two unrelated inventions.
 *
 * ─── WHY THE ARTWORK IS AUTHORED SVG ───────────────────────────────────────
 *
 * A shader could draw four geometric shapes more cheaply and more crisply. It
 * could not draw something that reads as an intel report. The variants have to
 * be distinguishable by SHAPE and not only by colour — the globe runs from
 * bright green land through dark ocean to a night terminator, and hue alone
 * fails somewhere on that range — and they have to look like documents, which
 * is what a person is actually being shown.
 *
 * Baked through an Image and a canvas. The app runs under an enforced CSP whose
 * `img-src` admits `data:`, which is what makes that route legal here.
 */
import * as THREE from 'three';
import { zoomOutFadeFor } from './zoomOutFade';
import { INTEL_VARIANTS, type IntelVariant } from './intelVariant';
import { SCREEN_POINTS_RENDER_ORDER } from './screenPoints';
import { FONTS, ROLES, TINT_NEUTRAL } from '../../styles/tokens';
import type { MarkerStyle } from './markerStyles';
import { getReplayMoment } from './replayClock';
import { stilledAt } from '../../globe-engine/captureClock';
import {
  GENERIC_CATEGORY_SYMBOL, INTEL_CATEGORIES, INTEL_CATEGORY_SYMBOLS, iconMarkup, type SymbolEntry,
} from '../../symbols/symbolRegistry';
import type { GlobeNoteSet } from '../../features/globe/noteDetail/globeNoteStore';

/**
 * What this layer can draw: the four report variants, and an RLSH entity.
 *
 * ─── WHY RLSH IS HERE AND NOT SOMEWHERE ELSE ───────────────────────────────
 *
 * RLSH entities have no other mark. `useGlobeRLSH` fetches them and draws
 * nothing; they have always been drawn by the shared intel path — which is
 * what its thirteen-models-in-Seattle comment is about — so excluding them
 * from this layer removed their glyph AND their clickability, since
 * Enhanced3DGlobeInteractivity picks what this layer draws. That was a
 * regression, found by clicking one and getting nothing.
 *
 * But an intel-report document says someone filed a report here, and an RLSH
 * person is not that. So both are drawn and the SHAPE separates them: four
 * documents and a person. One batched object either way.
 */
export type SpriteGlyph = IntelVariant | 'rlsh';

/** Every glyph, in the order they are laid out in the atlas. */
export const SPRITE_GLYPHS: readonly SpriteGlyph[] = [...INTEL_VARIANTS, 'rlsh'];

/** How this layer is found by a probe, a test, or the picking code. */
export const INTEL_SPRITE_TYPE = 'intelReportSprites';

/** One cell per variant, in a horizontal strip. */
const DEFAULT_CELL_PX = 128;

/*
 * How each variant differs, in all three channels at once.
 *
 * `motion` is an amplitude, not a flag: a globe where every mark moves is a
 * globe where movement says nothing, so only the variants that earn it move.
 * Critical pulses because it is asking to be looked at; Actionable breathes
 * slowly because it is waiting for someone; Standard and Raw are still.
 */
/** The clock a capture holds the glows at (IM23): the start of a pulse, where a mark is its own size. */
export const MOTION_AT_REST = Number.MIN_VALUE;

const PRESENTATION: Record<SpriteGlyph, { fill: string; motion: number }> = {
  standard:   { fill: '#4fd1ff', motion: 0 },
  critical:   { fill: '#ff4d4f', motion: 1 },
  actionable: { fill: '#ffb02e', motion: 0.45 },
  raw:        { fill: '#8fa3b0', motion: 0 },
  // The colour RLSH anchors already use, so the dot on the ground and the
  // figure above it read as one mark.
  rlsh:       { fill: '#ff6ad5', motion: 0 },
};

/**
 * The fill a glyph is baked in — exported so the legend reads its colours from
 * the same table the artwork is drawn from, and the two cannot disagree.
 */
export function spriteGlyphFill(glyph: SpriteGlyph): string {
  return PRESENTATION[glyph].fill;
}

/** How much a glyph moves on the globe, 0 for still: so a report's popup and tooltip move it as the globe does. */
export function spriteGlyphMotion(glyph: SpriteGlyph): number {
  return PRESENTATION[glyph].motion;
}

/**
 * What each glyph means, in a reader's words, for the card's legend.
 *
 * Written from intelVariantOf's rules rather than paraphrased: Actionable and
 * Critical are the AUTHOR'S word (a tag), Standard is a stated priority, and
 * Raw is a report nobody has assessed — which, on 2026-09-25, was every report
 * on the relays.
 */
export const SPRITE_GLYPH_MEANING: Record<SpriteGlyph, string> = {
  critical: 'critical',
  actionable: 'actionable, by its author',
  standard: 'assessed',
  raw: 'not assessed',
  rlsh: 'RLSH entity',
};

const OUTLINE = '#08121a';

/*
 * A page with a folded corner, which is the silhouette all four share: whatever
 * else a mark says, it should first read as a document. The outline is heavy on
 * purpose — it is what keeps a glyph visible over bright land, the same job the
 * `rim` does for a screen point.
 */
const PAGE = 'M14 5 H40 L51 16 V57 A2 2 0 0 1 49 59 H14 A2 2 0 0 1 12 57 V7 A2 2 0 0 1 14 5 Z';
const FOLD = 'M40 5 V16 H51 Z';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${body}</svg>`;

/**
 * The artwork for one variant: the markup inside a 64-unit SVG, so the bare
 * glyph and every styled one draw the same page.
 *
 * Self-contained by requirement, not by habit: this is baked through an Image
 * under a CSP, so a glyph that referenced an external resource would fail in
 * production and nowhere else.
 */
function glyphBody(variant: SpriteGlyph): string {
  const { fill } = PRESENTATION[variant];
  const page = `<path d="${PAGE}" fill="${fill}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>`
    + `<path d="${FOLD}" fill="${OUTLINE}" opacity="0.35"/>`;

  switch (variant) {
    /*
     * Lines of text: a report somebody wrote and assessed. Thick bars rather
     * than realistic text, because at 22 px on screen a hairline is nothing.
     */
    case 'standard':
      return (page
        + `<g fill="${OUTLINE}">`
        + `<rect x="19" y="26" width="25" height="5" rx="2"/>`
        + `<rect x="19" y="36" width="25" height="5" rx="2"/>`
        + `<rect x="19" y="46" width="15" height="5" rx="2"/>`
        + `</g>`);

    /*
     * An exclamation, and a spike of a corner instead of a fold. Shape carries
     * the alarm so the red is not doing the work alone.
     */
    case 'critical':
      return (page
        + `<g fill="${OUTLINE}">`
        + `<rect x="28" y="24" width="7" height="19" rx="3"/>`
        + `<rect x="28" y="47" width="7" height="7" rx="3"/>`
        + `</g>`);

    /*
     * A chevron pointing out of the page: something to act on, pointing the way.
     */
    case 'actionable':
      return (page
        + `<path d="M25 25 L39 38 L25 51" fill="none" stroke="${OUTLINE}" `
        + `stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`);

    /*
     * A blank page: the same document, in a muted colour, with nothing written
     * on it. Nobody has assessed this, and an empty page says so without
     * claiming anything else.
     *
     * Two earlier attempts were worse, and both were only visible by looking.
     * A dashed outline over a near-black fill did not read as a document at all
     * — no fold, and a rounded rectangle is not a page — and against bright
     * land it was a dark blob. Dashed interior lines fixed the legibility but
     * left Raw and Standard nearly the same SHAPE, separable only by hue, which
     * is what this step's own rule forbids: the globe runs from bright land to
     * a night terminator and colour fails somewhere on that range.
     *
     * Blank is the answer to both. It is the most distinct of the four shapes —
     * bars, a bang, a chevron, nothing — and it is also the most literal: no
     * one has written anything here. This matters more than the other three put
     * together, because every report on the relays is `unset`, so Raw is the
     * only variant a person actually sees today.
     */
    case 'raw':
      return page;

    /*
     * A person, not a document. Head and shoulders: the one silhouette that
     * cannot be mistaken for a page at 26 px, which is the whole reason RLSH
     * stopped sharing the report glyph.
     */
    case 'rlsh':
      return (`<circle cx="32" cy="20" r="10" fill="${fill}" stroke="${OUTLINE}" stroke-width="4"/>`
        + `<path d="M13 58 C13 43 21 35 32 35 C43 35 51 43 51 58 Z" `
        + `fill="${fill}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>`);
  }
}

/** The bare glyph, as a standalone SVG string. */
export function intelVariantSvg(variant: SpriteGlyph): string {
  return svg(glyphBody(variant));
}

/**
 * The styles a glyph can be drawn in, one atlas row each, in row order.
 *
 * The same three the globe's style switcher offers (decision D-F, section 18,
 * item 1.1). Mecha Jono called `setMarkerStyle('IntelReports', 'disc')` on
 * 2026-09-25 and the image did not change: the style reached the purple pins
 * under the glyphs and never the glyphs. So each style is drawn BEHIND the
 * glyph, and the glyph's own shape still says which variant it is.
 */
export const SPRITE_BACKINGS: readonly MarkerStyle[] = ['disc', 'glow', 'ring'];

/** Which row of the atlas a style is drawn from. */
export function atlasRowOf(style: MarkerStyle): number {
  const row = SPRITE_BACKINGS.indexOf(style);
  return row < 0 ? 0 : row;
}

/**
 * How much larger a styled mark is drawn than its glyph, so the glyph keeps its
 * size inside the backing. The glyph is scaled to 0.75 of the cell.
 */
export const STYLED_GLYPH_SCALE = 0.75;

/**
 * A glyph inside its style's backing, as a standalone SVG string.
 *
 * Chosen by looking at them on land and ocean at 26 px (the review page of
 * 2026-09-25): the DISC gives every glyph its own dark ground and an edge in the
 * glyph's colour, so it reads on bright Cyber-Earth land where a bare glyph
 * loses contrast, and on dark ocean where grey "not assessed" pages almost
 * vanish. The glow is a bloom in the glyph's colour; the ring a double outline.
 *
 * The one reference is the glow's gradient, by fragment, inside this same image
 * — nothing outside it, which the CSP requires.
 */
export function styledGlyphSvg(glyph: SpriteGlyph, style: MarkerStyle): string {
  const { fill } = PRESENTATION[glyph];
  const inner = `<g transform="translate(8 8) scale(${STYLED_GLYPH_SCALE})">${glyphBody(glyph)}</g>`;
  switch (style) {
    case 'disc':
      return svg(`<circle cx="32" cy="32" r="29" fill="${OUTLINE}" fill-opacity="0.78" `
        + `stroke="${fill}" stroke-width="3"/>${inner}`);
    case 'glow': {
      const id = `glow-${glyph}`;
      return svg(`<defs><radialGradient id="${id}">`
        + `<stop offset="0.35" stop-color="${fill}" stop-opacity="0.85"/>`
        + `<stop offset="1" stop-color="${fill}" stop-opacity="0"/>`
        + `</radialGradient></defs><circle cx="32" cy="32" r="31" fill="url(#${id})"/>${inner}`);
    }
    case 'ring':
      return svg(`<circle cx="32" cy="32" r="28" fill="none" stroke="${OUTLINE}" stroke-width="7"/>`
        + `<circle cx="32" cy="32" r="28" fill="none" stroke="${fill}" stroke-width="3.5"/>${inner}`);
  }
}

/** Which cell of the atlas a glyph is drawn from. */
export function atlasCellOf(glyph: SpriteGlyph): number {
  return SPRITE_GLYPHS.indexOf(glyph);
}

/*
 * ─── A CATEGORY'S EMBLEM (BA12–BA14; plan block J, item 5) ─────────────────
 *
 * A report's stated category is drawn as its icon inside the page, in place of
 * the assessment's own interior mark, and the page keeps its colour for the
 * assessment. That leaves assessed and not assessed differing only by hue,
 * which this glyph's history refuses (see glyphBody's Raw): so with an emblem a
 * report nobody assessed is a HOLLOW page, its outline and emblem grey, beside
 * the filled pages of the assessed. Chosen by looking at both at their real
 * size on ocean, dark and bright land and Cyber-Earth (2026-10-04); a badge in
 * the page's corner for the assessment was tried too, and at 35 px is a notch.
 *
 * The pages are cells of their own after every glyph, so no glyph's cell moves;
 * the emblems are a second texture of masks the shader inks in.
 */
/** The hollow page's ground: the panel's own surface, so a page nobody assessed reads as empty. */
const HOLLOW = ROLES.surface.panel;

function pageBody(variant: IntelVariant): string {
  if (variant === 'raw') {
    const grey = PRESENTATION.raw.fill;
    return `<path d="${PAGE}" fill="${HOLLOW}" stroke="${grey}" stroke-width="4" stroke-linejoin="round"/>`
      + `<path d="${FOLD}" fill="${grey}" opacity="0.5"/>`;
  }
  return `<path d="${PAGE}" fill="${PRESENTATION[variant].fill}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>`
    + `<path d="${FOLD}" fill="${OUTLINE}" opacity="0.35"/>`;
}

/** An assessment's page with nothing drawn inside, in a style's backing: the ground an emblem is inked on. */
export function styledPageSvg(variant: IntelVariant, style: MarkerStyle): string {
  return styledGlyphSvg(variant, style).replace(glyphBody(variant), pageBody(variant));
}

/** Which cell of the atlas an assessment's page is drawn from: after every glyph. */
export function emblemPageCellOf(variant: IntelVariant): number {
  return SPRITE_GLYPHS.length + INTEL_VARIANTS.indexOf(variant);
}

/** The atlas's columns: every glyph, then every assessment's page. */
const ATLAS_COLUMNS = SPRITE_GLYPHS.length + INTEL_VARIANTS.length;

/** The emblems, one cell each: every category's, then the generic one for a word not yet given its own. */
export const EMBLEM_SYMBOLS: readonly SymbolEntry[] = [
  ...INTEL_CATEGORIES.map((category) => INTEL_CATEGORY_SYMBOLS[category]),
  GENERIC_CATEGORY_SYMBOL,
];

export function emblemCellOf(symbol: SymbolEntry): number {
  return EMBLEM_SYMBOLS.indexOf(symbol);
}

/**
 * An emblem as a mask, where the page's middle is inside every backing: the
 * glyph is drawn at three quarters, translated by 8, in all three styles. Only
 * its coverage is read; the shader inks it in the page's own colour for it.
 */
export function emblemMaskSvg(symbol: SymbolEntry): string {
  const icon = iconMarkup(symbol.icon, { x: 17.5, y: 22, size: 28, stroke: 3, colour: OUTLINE });
  return svg(`<g transform="translate(8 8) scale(${STYLED_GLYPH_SCALE})">${icon}</g>`);
}

/**
 * A report's whole mark as the globe draws it, as one standalone SVG: its glyph in its
 * style's backing, or, with an emblem, its assessment's page with the emblem inked on
 * it as the shader inks it, in the outline's dark, or grey on a page nobody assessed.
 * For the places a report is shown off the globe, its popup and its tooltip, which
 * drew a 3D model of their own before (decision of 2026-10-08: SVG glyphs everywhere).
 */
export function reportGlyphSvg(glyph: SpriteGlyph, style: MarkerStyle, emblem: SymbolEntry | null): string {
  if (glyph === 'rlsh' || !emblem) return styledGlyphSvg(glyph, style);
  const ink = glyph === 'raw' ? PRESENTATION.raw.fill : OUTLINE;
  const icon = iconMarkup(emblem.icon, { x: 17.5, y: 22, size: 28, stroke: 3, colour: ink });
  return styledPageSvg(glyph, style).replace(/<\/svg>$/, `<g transform="translate(8 8) scale(${STYLED_GLYPH_SCALE})">${icon}</g></svg>`);
}

/** Every emblem's mask, in one row. */
export async function bakeEmblemAtlas(cellPx: number = DEFAULT_CELL_PX): Promise<THREE.Texture | null> {
  return bakeSvgAtlas([EMBLEM_SYMBOLS.map(emblemMaskSvg)], cellPx);
}

/** For a layer drawing no emblems: something for the shader to bind, which inks nothing. */
let noEmblems: THREE.Texture | null = null;
function emptyEmblems(): THREE.Texture {
  if (!noEmblems) {
    noEmblems = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    noEmblems.needsUpdate = true;
  }
  return noEmblems;
}

function loadSvgImage(source: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  });
}

/**
 * Rasterise a grid of self-contained SVGs into one texture, row by row, or
 * return null.
 *
 * Null is a real answer, not a failure to handle: a runtime with no 2D canvas
 * (jsdom, which is what the suite runs in) must not take the globe's marks
 * down with it. Every caller treats null as "draw the marks another way".
 *
 * Shared with Raver Watch's glyphs (raverWatchSprites.ts), which are drawn the
 * same way from an atlas of their own.
 */
export async function bakeSvgAtlas(rows: readonly (readonly string[])[], cellPx: number = DEFAULT_CELL_PX): Promise<THREE.Texture | null> {
  if (typeof document === 'undefined' || rows.length === 0) return null;
  const columns = Math.max(...rows.map((row) => row.length));

  // Each cell has a clear gutter, so the mipmaps below never blend one glyph's rim into its neighbour's corner.
  const gutter = Math.round(cellPx / ATLAS_GUTTER_DIVISOR);
  const stride = cellPx + 2 * gutter;
  const canvas = document.createElement('canvas');
  canvas.width = stride * columns;
  canvas.height = stride * rows.length;

  const context = canvas.getContext('2d');
  if (!context) return null;

  const cells = rows.flatMap((row, r) => row.map((source, c) => ({ source, r, c })));
  const images = await Promise.all(cells.map(({ source }) => loadSvgImage(source)));
  if (images.some((image) => image === null)) return null;

  images.forEach((image, i) => {
    const { r, c } = cells[i];
    context.drawImage(image as HTMLImageElement, c * stride + gutter, r * stride + gutter, cellPx, cellPx);
  });

  const texture = new THREE.CanvasTexture(canvas);
  // flipY off so gl_PointCoord's top-left origin lands on the canvas's top row.
  // With the default flip the glyphs draw upside down.
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  /*
   * Mipmapped (D-GV GV0.3). Cells of 128 px are drawn at about 35, nearly four times smaller: sampled without
   * mipmaps, a 2-unit stroke fell between the texels read and shimmered, on screen and on every card.
   */
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.userData.atlasInset = gutter / stride;
  texture.needsUpdate = true;
  return texture;
}

/** A cell's gutter is its size over this, on every side: 8 px for a 128 px glyph. */
const ATLAS_GUTTER_DIVISOR = 16;

/** The share of a cell its gutter takes on each side, which a sampler skips. 0 for an atlas without one. */
export function atlasInsetOf(texture: THREE.Texture | null | undefined): number {
  const inset = texture?.userData?.atlasInset;
  return typeof inset === 'number' ? inset : 0;
}

/** Every intel glyph in every style, then every assessment's page: one row per style. */
export async function bakeIntelSpriteAtlas(cellPx: number = DEFAULT_CELL_PX): Promise<THREE.Texture | null> {
  return bakeSvgAtlas(SPRITE_BACKINGS.map((style) => [
    ...SPRITE_GLYPHS.map((glyph) => styledGlyphSvg(glyph, style)),
    ...INTEL_VARIANTS.map((variant) => styledPageSvg(variant, style)),
  ]), cellPx);
}

/** Does this machine's owner not want things moving? */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface IntelSpriteMark {
  position: THREE.Vector3;
  /** On-screen diameter in CSS pixels. */
  sizePx: number;
  variant: SpriteGlyph;
  /** The style its layer is drawn in. Default disc. */
  style?: MarkerStyle;
  /**
   * How solid this ONE mark is, 0 to 1. Default 1.
   *
   * Per mark rather than per layer because both live and stored marks share one
   * batched object, and the point is to tell them apart inside a single frame
   * (decision D-F, step 4.4).
   */
  opacity?: number;
  /** What a hover says. A mark that cannot answer is a mark nobody can check. */
  tooltip?: string;
  /**
   * When this mark appears in a replay, in ms since the epoch: its event time, or
   * when it was written. Null or absent: it states no time, and a replay shows
   * it throughout rather than inventing a moment for it.
   */
  timeMs?: number | null;
  /** Its category's emblem (BA14), or none. Never on a person. */
  emblem?: SymbolEntry | null;
}

/** markTime for a mark with no time: far before any replay, so always shown. */
const UNTIMED = -1e9;
/** revealAt when no replay runs: after every mark, so all are shown. */
const NO_REPLAY = 1e30;

export interface IntelSpriteOptions {
  opacity?: number;
  /** False stops every mark moving. The OS preference is honoured on top of it. */
  animate?: boolean;
  userData?: Record<string, unknown>;
  /** The emblems' masks (bakeEmblemAtlas). Without them, no mark wears one. */
  emblems?: THREE.Texture | null;
  /**
   * The marks' size for the view, read each frame: Hero Watch's lifeboats shrink as the camera rises
   * (HW15). Absent, they are their own size, as every other layer's are.
   */
  sizeScaleFor?: (renderer: THREE.WebGLRenderer, camera: THREE.Camera, object: THREE.Object3D) => number;
}

const VERTEX = /* glsl */`
  attribute float pointSize;
  attribute float atlasCell;
  attribute float atlasRow;
  attribute float motion;
  attribute float markIndex;
  attribute float markOpacity;
  attribute float markTime;
  attribute float emblemCell;
  attribute float emblemTone;
  /** 1 drawn, 0 folded under another mark (glyphDeclutter.ts), between while it fades. */
  attribute float markShown;
  attribute vec3 markTint;
  uniform float pixelRatio;
  uniform float time;
  uniform float hoveredIndex;
  /** The layer's own size for the view (sizeScaleFor); 1 for every layer that gives none. */
  uniform float sizeScale;
  uniform float revealAt;
  uniform float revealFade;
  uniform float revealFrom;
  uniform float revealUntil;
  varying float vAtlasCell;
  varying float vAtlasRow;
  varying float vMotion;
  varying float vMarkOpacity;
  varying float vReveal;
  varying float vEmblemCell;
  varying float vEmblemTone;
  varying float vShown;
  varying vec3 vTint;

  void main() {
    vShown = markShown;
    vTint = markTint;
    vEmblemCell = emblemCell;
    vEmblemTone = emblemTone;
    // A replay: 0 before the mark's time, rising to 1 over the fade, and a brief
    // swell as it arrives so a newly appeared report is seen arriving.
    vReveal = markTime < -1.0e8 ? 1.0 : clamp((revealAt - markTime) / max(revealFade, 0.001), 0.0, 1.0);
    float replaying = step(revealAt, 1.0e29) * step(-1.0e8, markTime);
    // A bounded replay (BA2) hides what falls outside its span.
    vReveal *= mix(1.0, step(revealFrom, markTime) * step(markTime, revealUntil), replaying);
    float arrival = 1.0 + 0.35 * replaying * 4.0 * vReveal * (1.0 - vReveal);
    vAtlasCell = atlasCell;
    vAtlasRow = atlasRow;
    vMotion = motion;
    vMarkOpacity = markOpacity;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    // A pulse in SIZE rather than position: a mark that moves off its
    // coordinate is a mark that lies about where the report is.
    float pulse = 1.0 + motion * 0.10 * sin(time * 3.0);
    // The mark under the pointer grows. An attribute compared against a
    // uniform, so a hover costs one uniform write rather than rebuilding the
    // geometry — which, on a mousemove handler, would rebuild it continuously.
    float hover = abs(markIndex - hoveredIndex) < 0.5 ? 1.22 : 1.0;
    // A mark folding under another shrinks a little as it fades, toward the one it joins.
    float folding = 0.7 + 0.3 * markShown;
    gl_PointSize = vReveal <= 0.0 || markShown <= 0.0 ? 0.0 : pointSize * pixelRatio * pulse * hover * arrival * sizeScale * folding;
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT = /* glsl */`
  uniform sampler2D atlas;
  uniform sampler2D emblems;
  uniform float cellCount;
  uniform float rowCount;
  uniform float emblemCount;
  uniform float atlasInset;
  uniform float emblemInset;
  uniform float opacity;
  uniform float time;
  uniform float zoomFade;
  varying float vAtlasCell;
  varying float vAtlasRow;
  varying float vMotion;
  varying float vMarkOpacity;
  varying float vReveal;
  varying float vEmblemCell;
  varying float vEmblemTone;
  varying float vShown;
  varying vec3 vTint;

#ifdef DRAW_SHAPES
  uniform vec3 shapeFills[5];
  uniform vec3 shapeOutline;

  /*
   * A plain shape for a glyph, where no artwork could be baked: the disc style's dark
   * ground and rim in the mark's colour, and inside it a shape for each glyph, so they
   * still differ by shape and not by colour alone. A page, a diamond, an arrow, a
   * hollow page, a person.
   */
  vec4 plainShape(vec2 uv) {
    vec2 p = uv * 2.0 - 1.0;
    float r = length(p);
    if (r > 0.95) return vec4(0.0);
    int cell = int(vAtlasCell + 0.5);
    vec3 fill = shapeFills[0];
    if (cell == 1) fill = shapeFills[1];
    else if (cell == 2) fill = shapeFills[2];
    else if (cell == 3) fill = shapeFills[3];
    else if (cell == 4) fill = shapeFills[4];
    if (r > 0.82) return vec4(fill, 1.0);
    float square = max(abs(p.x), abs(p.y));
    bool inside = square < 0.42;
    if (cell == 1) inside = abs(p.x) + abs(p.y) < 0.56;
    else if (cell == 2) inside = p.x > -0.36 && abs(p.y) < 0.44 * (0.46 - p.x) / 0.82;
    else if (cell == 3) inside = square < 0.42 && square > 0.28;
    else if (cell == 4) inside = length(p - vec2(0.0, -0.22)) < 0.2 || (p.y > 0.08 && length(p - vec2(0.0, 0.62)) < 0.46);
    return inside ? vec4(fill, 1.0) : vec4(shapeOutline, 0.78);
  }
#endif

  void main() {
    if (vReveal <= 0.0 || vShown <= 0.0) discard;
    vec2 cellUv = gl_PointCoord;
#ifdef DRAW_SHAPES
    vec4 texel = plainShape(cellUv);
#else
    // Inside the cell's gutter: the glyph's own square of it.
    vec2 inCell = atlasInset + cellUv * (1.0 - 2.0 * atlasInset);
    vec2 uv = vec2((vAtlasCell + inCell.x) / cellCount, (vAtlasRow + inCell.y) / rowCount);
    vec4 texel = texture2D(atlas, uv);
    // A category's emblem (BA14), inked on its page: in the outline's dark, or
    // grey on the hollow page of a report nobody assessed.
    if (vEmblemCell > -0.5) {
      vec2 inEmblem = emblemInset + cellUv * (1.0 - 2.0 * emblemInset);
      float ink = texture2D(emblems, vec2((vEmblemCell + inEmblem.x) / emblemCount, inEmblem.y)).a;
      // Written as the screen shows them, so taken to linear like every other colour here (EQ13).
      vec3 inkColour = sRGBTransferEOTF(vec4(mix(vec3(0.0314, 0.0706, 0.1020), vec3(0.5608, 0.6392, 0.6902), vEmblemTone), 1.0)).rgb;
      texel = vec4(mix(texel.rgb, inkColour, ink), max(texel.a, ink));
    }
#endif
    // The glyphs are mostly transparent; discarding early keeps the square of
    // the point from writing anything and from taking a hover.
    if (texel.a < 0.04) discard;
    float breathe = 1.0 - vMotion * 0.18 * (0.5 - 0.5 * sin(time * 3.0));
    // As the Earth shrinks on screen its marks fade, so they never outgrow it (zoomOutFade.ts).
    // The atlas is decoded to linear as it is sampled, so the colour goes back to the screen's (D-EQ, EQ13): without
    // this every glyph was drawn darker than its colour in the key (the grey of GUNMETAL 300 as about GUNMETAL 500).
    gl_FragColor = sRGBTransferOETF(vec4(texel.rgb * vTint, texel.a * opacity * breathe * vMarkOpacity * vReveal * vShown * zoomFade));
  }
`;

/** One mark of any glyph atlas: which cell and row it is drawn from, and how. */
/**
 * A tint as the shader multiplies it: linear, as the decoded atlas is, so the glyph comes out the hex itself once the
 * shader takes it back to the screen's colour.
 */
export function tintOf(css: string): [number, number, number] {
  const colour = new THREE.Color(/^#[0-9a-f]{6}$/i.test(css) ? css : TINT_NEUTRAL);
  return [colour.r, colour.g, colour.b];
}

export interface GlyphSpriteMark {
  position: THREE.Vector3;
  /** On-screen diameter in CSS pixels. */
  sizePx: number;
  /** Its atlas column and row. */
  cell: number;
  row: number;
  /** How much it moves, 0 for still. */
  motion?: number;
  /** How solid this ONE mark is, 0 to 1. Default 1. */
  opacity?: number;
  tooltip?: string;
  /** What a click on it opens (D-CT, CT3): its notes, beside the hover that names them. */
  opens?: GlobeNoteSet;
  /** When it appears in a replay, in ms since the epoch; absent, it shows throughout. */
  timeMs?: number | null;
  /** Its emblem's cell in the emblems' atlas, -1 or absent for none. */
  emblem?: number;
  /** The emblem's ink: 0 the outline's dark, 1 grey. */
  emblemTone?: number;
  /**
   * A colour its glyph is multiplied by, as CSS hex (#RRGGBB), as the screen shows it: a glyph baked white takes the
   * colour, its dark ink stays dark. Absent, white: the glyph as baked. The quake flags' fill by magnitude or depth.
   */
  tint?: string;
}

/** An atlas's shape, and the type its object is found by. */
export interface GlyphSpriteLayout {
  cellCount: number;
  rowCount: number;
  type: string;
  /** The emblems' masks and how many there are; absent for a layer drawing none. */
  emblems?: { atlas: THREE.Texture; count: number } | null;
  /**
   * Plain shapes to draw when there is no atlas, each glyph's fill by cell: a layer that
   * gives these always draws; one that does not draws nothing without its atlas.
   */
  shapes?: { fills: readonly THREE.Color[]; outline: THREE.Color } | null;
}

/**
 * One object for every mark of one glyph atlas.
 *
 * Returns null rather than an empty object when there is nothing to draw, or no
 * atlas to draw it from and no plain shapes to draw instead, so a caller can fall
 * back without inspecting counts.
 */
export function buildGlyphSprites(
  marks: readonly GlyphSpriteMark[],
  atlas: THREE.Texture | null,
  layout: GlyphSpriteLayout,
  options: IntelSpriteOptions = {},
): THREE.Points | null {
  if ((!atlas && !layout.shapes) || marks.length === 0) return null;
  const shapes = atlas ? null : layout.shapes ?? null;

  const { opacity = 1, animate = true, userData } = options;
  const moving = animate && !prefersReducedMotion();

  const positions = new Float32Array(marks.length * 3);
  const sizes = new Float32Array(marks.length);
  const cells = new Float32Array(marks.length);
  const rows = new Float32Array(marks.length);
  const motions = new Float32Array(marks.length);
  const indices = new Float32Array(marks.length);
  const markOpacities = new Float32Array(marks.length);
  const markTimes = new Float32Array(marks.length);
  const emblemCells = new Float32Array(marks.length);
  const emblemTones = new Float32Array(marks.length);
  // White unless a mark names its tint: every other layer's glyphs draw as baked.
  const tints = new Float32Array(marks.length * 3).fill(1);
  /*
   * Times as seconds from the earliest mark, not ms since the epoch: a float32
   * holds about seven significant digits, and epoch milliseconds would round
   * whole hours together.
   */
  const timed = marks.map((m) => m.timeMs).filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  const timeBaseMs = timed.length ? Math.min(...timed) : 0;

  marks.forEach((mark, i) => {
    positions[i * 3] = mark.position.x;
    positions[i * 3 + 1] = mark.position.y;
    positions[i * 3 + 2] = mark.position.z;
    sizes[i] = mark.sizePx;
    cells[i] = mark.cell;
    rows[i] = mark.row;
    motions[i] = moving ? mark.motion ?? 0 : 0;
    indices[i] = i;
    markOpacities[i] = mark.opacity ?? 1;
    markTimes[i] = typeof mark.timeMs === 'number' && Number.isFinite(mark.timeMs)
      ? (mark.timeMs - timeBaseMs) / 1000
      : UNTIMED;
    emblemCells[i] = layout.emblems ? mark.emblem ?? -1 : -1;
    emblemTones[i] = mark.emblemTone ?? 0;
    if (mark.tint) tints.set(tintOf(mark.tint), i * 3);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('pointSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('atlasCell', new THREE.BufferAttribute(cells, 1));
  geometry.setAttribute('atlasRow', new THREE.BufferAttribute(rows, 1));
  geometry.setAttribute('motion', new THREE.BufferAttribute(motions, 1));
  geometry.setAttribute('markIndex', new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('markOpacity', new THREE.BufferAttribute(markOpacities, 1));
  geometry.setAttribute('markTime', new THREE.BufferAttribute(markTimes, 1));
  geometry.setAttribute('emblemCell', new THREE.BufferAttribute(emblemCells, 1));
  geometry.setAttribute('emblemTone', new THREE.BufferAttribute(emblemTones, 1));
  geometry.setAttribute('markShown', new THREE.BufferAttribute(new Float32Array(marks.length).fill(1), 1));
  geometry.setAttribute('markTint', new THREE.BufferAttribute(tints, 3));

  const material = new THREE.ShaderMaterial({
    ...(shapes ? { defines: { DRAW_SHAPES: '' } } : {}),
    uniforms: {
      pixelRatio: { value: 1 },
      // Without an atlas, something for the sampler to bind, which the shapes never read.
      atlas: { value: atlas ?? emptyEmblems() },
      ...(shapes ? { shapeFills: { value: [...shapes.fills] }, shapeOutline: { value: shapes.outline } } : {}),
      emblems: { value: layout.emblems?.atlas ?? emptyEmblems() },
      cellCount: { value: layout.cellCount },
      rowCount: { value: layout.rowCount },
      emblemCount: { value: layout.emblems?.count ?? 1 },
      atlasInset: { value: atlasInsetOf(atlas) },
      emblemInset: { value: atlasInsetOf(layout.emblems?.atlas) },
      opacity: { value: opacity },
      time: { value: 0 },
      zoomFade: { value: 1 },
      sizeScale: { value: 1 },
      hoveredIndex: { value: -1 },
      revealAt: { value: NO_REPLAY },
      revealFade: { value: 1 },
      revealFrom: { value: -NO_REPLAY },
      revealUntil: { value: NO_REPLAY },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const object = new THREE.Points(geometry, material);
  object.userData = {
    type: layout.type,
    timeBaseMs,
    // A country's name never covers a glyph (geopolitical/labels/nameObstacles.ts).
    nameObstacle: 'hard',
    ...userData,
    ...(marks.some((mark) => mark.tooltip) ? { tooltips: marks.map((mark) => mark.tooltip ?? '') } : {}),
    // In point order, as the tooltips: what a click on each opens (useGlobePointTooltips).
    ...(marks.some((mark) => mark.opens) ? { opens: marks.map((mark) => mark.opens ?? null) } : {}),
  };

  /*
   * The clock, and the pixel ratio, read where screenPoints reads its own:
   * three.js calls this before drawing the object. So motion needs no animation
   * loop, no React state, and costs nothing while the layer is off screen.
   */
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  object.onBeforeRender = (renderer, _scene, camera) => {
    material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    material.uniforms.zoomFade.value = zoomOutFadeFor(renderer, camera, object);
    if (options.sizeScaleFor) material.uniforms.sizeScale.value = options.sizeScaleFor(renderer, camera, object);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // A capture holds the glows at rest (IM23), so the same shot makes the same picture.
    material.uniforms.time.value = stilledAt() !== null ? MOTION_AT_REST : Math.max((now - started) / 1000, Number.MIN_VALUE);
    // The replay clock, read as this draws so the frame shows the moment it was set to.
    const replay = getReplayMoment();
    material.uniforms.revealAt.value = replay ? (replay.atMs - timeBaseMs) / 1000 : NO_REPLAY;
    material.uniforms.revealFade.value = replay ? Math.max(replay.fadeMs / 1000, 0.001) : 1;
    material.uniforms.revealFrom.value = replay?.fromMs !== undefined ? (replay.fromMs - timeBaseMs) / 1000 : -NO_REPLAY;
    material.uniforms.revealUntil.value = replay?.untilMs !== undefined ? (replay.untilMs - timeBaseMs) / 1000 : NO_REPLAY;
  };

  // Marks move — the globe turns, the temporal cursor rebuilds them — and a
  // bounding sphere computed once would cull marks that are on screen.
  object.frustumCulled = false;
  object.renderOrder = SCREEN_POINTS_RENDER_ORDER;
  return object;
}

/**
 * One object for every Intel Report mark on the globe.
 *
 * Without an atlas, plain shapes in the glyphs' colours (plainShape in the shader): the
 * marks still draw and are still picked, and no emblem is worn. They drew 3D models
 * before, fetched for this case alone; those were retired on 2026-10-08. Returns null
 * only when there is nothing to draw.
 */
export function buildIntelSprites(
  marks: readonly IntelSpriteMark[],
  atlas: THREE.Texture | null,
  options: IntelSpriteOptions = {},
): THREE.Points | null {
  // Emblems are inked on the artwork's pages: with no atlas there are none to ink.
  const emblems = atlas ? options.emblems ?? null : null;
  return buildGlyphSprites(
    marks.map((mark) => {
      // An emblem only with its masks to ink, and never on a person.
      const emblem = emblems && mark.emblem && mark.variant !== 'rlsh' ? emblemCellOf(mark.emblem) : -1;
      const worn = emblem >= 0;
      return {
        position: mark.position,
        sizePx: mark.sizePx,
        cell: worn ? emblemPageCellOf(mark.variant as IntelVariant) : atlasCellOf(mark.variant),
        row: atlasRowOf(mark.style ?? 'disc'),
        motion: PRESENTATION[mark.variant].motion,
        opacity: mark.opacity,
        tooltip: mark.tooltip,
        timeMs: mark.timeMs,
        emblem: worn ? emblem : -1,
        emblemTone: worn && mark.variant === 'raw' ? 1 : 0,
      };
    }),
    atlas,
    {
      cellCount: ATLAS_COLUMNS,
      rowCount: SPRITE_BACKINGS.length,
      type: INTEL_SPRITE_TYPE,
      emblems: emblems ? { atlas: emblems, count: EMBLEM_SYMBOLS.length } : null,
      shapes: { fills: SPRITE_GLYPHS.map((glyph) => new THREE.Color(PRESENTATION[glyph].fill)), outline: new THREE.Color(OUTLINE) },
    },
    options,
  );
}

/**
 * Grow the mark at `index`, or none when it is null.
 *
 * A uniform write. Rebuilding the geometry to show a hover would rebuild it on
 * every mousemove.
 */
export function setIntelSpriteHovered(points: THREE.Points, index: number | null): void {
  const material = points.material as THREE.ShaderMaterial;
  if (!material.uniforms?.hoveredIndex) return;
  material.uniforms.hoveredIndex.value = index === null ? -1 : index;
}

/**
 * How near the pointer has to be, in world units, to pick a mark.
 *
 * three.js raycasts a THREE.Points against a world-space sphere around each
 * point — it has no idea the mark is drawn at a fixed pixel size — so this is
 * an approximation of the glyph, not its outline. 1.5 is the figure
 * useGlobePointTooltips already picks screen marks with, and the two want to
 * agree: a mark that shows a tooltip and cannot be clicked is worse than
 * either on its own.
 */
export const INTEL_SPRITE_PICK_THRESHOLD_UNITS = 1.5;

/**
 * Which mark a raycast hit, or null if the hit was not this layer's.
 *
 * Mirrors resolveInstancedTooltip: the caller raycasts whatever it likes and
 * asks this what it means, rather than this owning a raycaster.
 */
export function intelSpriteIndexAt(intersection: THREE.Intersection): number | null {
  const object = intersection.object;
  if (object.userData?.type !== INTEL_SPRITE_TYPE) return null;
  const index = intersection.index;
  if (index === undefined || index === null) return null;
  return index;
}

/**
 * The first of these hits that is a mark of this layer's, as a report.
 *
 * The caller raycasts — it owns the raycaster, the camera and the throttle —
 * and this says what the answer means. Hits from other layers are skipped
 * rather than ending the search: the globe raycasts several layers at once and
 * the nearest hit is often a country fill or a satellite.
 */
export function intelReportAtHits<T>(
  hits: readonly THREE.Intersection[],
  reportAt: (index: number) => T | null,
): T | null {
  for (const hit of hits) {
    const index = intelSpriteIndexAt(hit);
    if (index === null) continue;
    const report = reportAt(index);
    if (report) return report;
  }
  return null;
}

/*
 * ─── THE COUNT BADGE ───────────────────────────────────────────────────────
 *
 * Reports at one place draw as one glyph (reportPlaces.ts), and the number
 * beside it says how many. The pin under each glyph used to say that with its
 * size; the pin is gone (decision D-F, section 18, item 1.3).
 *
 * Its own batched object, because a point sprite cannot draw outside its own
 * quad: the badge is a second point at the same place, moved on screen by a
 * fixed number of pixels in clip space. Moving it on the globe instead would
 * drift away from the glyph as the camera zooms.
 */

/** What a badge can say, one atlas cell each. More than nine is "9+". */
export const BADGE_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '9+'] as const;

/** How the badges are found by a probe or a test. Never picked. */
export const INTEL_BADGE_TYPE = 'intelReportBadges';

/** On-screen diameter of a badge, in CSS pixels. */
export const BADGE_PX = 17;

/** How far up and right of the glyph's centre, in CSS pixels: on the backing's edge. */
export const BADGE_OFFSET_PX = 13;

/** The badge's text and edge: the card's own light ink, neutral against every variant colour. */
const BADGE_INK = '#e8eefc';

/** The atlas cell for a place of `count` reports, or null when it needs no badge. */
export function badgeCellOf(count: number): number | null {
  if (!Number.isFinite(count) || count < 2) return null;
  return Math.min(Math.floor(count), BADGE_LABELS.length + 1) - 2;
}

/** Rasterise the badge labels into one strip, or return null where there is no 2D canvas. */
export async function bakeBadgeAtlas(cellPx = 64): Promise<THREE.Texture | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = cellPx * BADGE_LABELS.length;
  canvas.height = cellPx;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const centre = cellPx / 2;
  BADGE_LABELS.forEach((label, i) => {
    const x = i * cellPx + centre;
    context.beginPath();
    context.arc(x, centre, cellPx * 0.44, 0, Math.PI * 2);
    context.fillStyle = OUTLINE;
    context.fill();
    context.lineWidth = cellPx * 0.07;
    context.strokeStyle = BADGE_INK;
    context.stroke();
    context.fillStyle = BADGE_INK;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // Two characters need a smaller face to stay inside the circle.
    // A canvas reads no CSS variable, so the stack comes from the tokens (plan item 8.2).
    context.font = `700 ${Math.round(cellPx * (label.length > 1 ? 0.42 : 0.55))}px ${FONTS.text}`;
    context.fillText(label, x, centre + cellPx * 0.03);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  // Mipmapped, as the glyphs are; each badge's circle keeps 6% of its cell clear.
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export interface PlaceBadge {
  position: THREE.Vector3;
  /** How many reports the place stands for. One draws no badge. */
  count: number;
  /** The place's own opacity, so a faded place has a faded badge. Default 1. */
  opacity?: number;
}

const BADGE_VERTEX = /* glsl */`
  attribute float badgeCell;
  attribute float markOpacity;
  uniform float pixelRatio;
  uniform float sizePx;
  uniform vec2 offsetPx;
  uniform vec2 viewport;
  varying float vBadgeCell;
  varying float vMarkOpacity;

  void main() {
    vBadgeCell = badgeCell;
    vMarkOpacity = markOpacity;
    if (badgeCell < -0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // CSS pixels to clip space: two units span the viewport, scaled by w so the
    // shift survives the perspective divide.
    clip.xy += offsetPx * 2.0 / max(viewport, vec2(1.0)) * clip.w;
    gl_Position = clip;
    gl_PointSize = sizePx * pixelRatio;
  }
`;

const BADGE_FRAGMENT = /* glsl */`
  uniform sampler2D atlas;
  uniform float cellCount;
  uniform float hidden;
  uniform float zoomFade;
  varying float vBadgeCell;
  varying float vMarkOpacity;

  void main() {
    if (hidden > 0.5 || vBadgeCell < -0.5) discard;
    vec2 uv = vec2((vBadgeCell + gl_PointCoord.x) / cellCount, gl_PointCoord.y);
    vec4 texel = texture2D(atlas, uv);
    if (texel.a < 0.04) discard;
    gl_FragColor = sRGBTransferOETF(vec4(texel.rgb, texel.a * vMarkOpacity * zoomFade));
  }
`;

/**
 * One object for every count badge, or null when no place holds more than one report.
 *
 * With `everyPlace`, one badge for each place given, in its order, whatever its count: a place of one draws
 * none (cell -1, opacity 0) until its `badgeCell` and `markOpacity` are set, as a decluttered layer sets them
 * each frame (glyphDeclutter.ts).
 */
export function buildPlaceBadges(
  badges: readonly PlaceBadge[],
  atlas: THREE.Texture | null,
  options: { everyPlace?: boolean } = {},
): THREE.Points | null {
  const crowded = options.everyPlace ? [...badges] : badges.filter((badge) => badgeCellOf(badge.count) !== null);
  if (!atlas || crowded.length === 0) return null;

  const positions = new Float32Array(crowded.length * 3);
  const cells = new Float32Array(crowded.length);
  const opacities = new Float32Array(crowded.length);
  crowded.forEach((badge, i) => {
    positions[i * 3] = badge.position.x;
    positions[i * 3 + 1] = badge.position.y;
    positions[i * 3 + 2] = badge.position.z;
    const cell = badgeCellOf(badge.count);
    cells[i] = cell ?? -1;
    opacities[i] = cell === null ? 0 : badge.opacity ?? 1;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('badgeCell', new THREE.BufferAttribute(cells, 1));
  geometry.setAttribute('markOpacity', new THREE.BufferAttribute(opacities, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      atlas: { value: atlas },
      cellCount: { value: BADGE_LABELS.length },
      pixelRatio: { value: 1 },
      sizePx: { value: BADGE_PX },
      offsetPx: { value: new THREE.Vector2(BADGE_OFFSET_PX, BADGE_OFFSET_PX) },
      viewport: { value: new THREE.Vector2(1, 1) },
      hidden: { value: 0 },
      zoomFade: { value: 1 },
    },
    vertexShader: BADGE_VERTEX,
    fragmentShader: BADGE_FRAGMENT,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const object = new THREE.Points(geometry, material);
  // A country's name never covers a count either: one size, drawn off its place (nameObstacles.ts).
  object.userData = {
    type: INTEL_BADGE_TYPE,
    badges: crowded.filter((badge) => badgeCellOf(badge.count) !== null).length,
    nameObstacle: 'hard',
    nameObstacleSizePx: BADGE_PX,
    nameObstacleOffsetPx: BADGE_OFFSET_PX,
  };
  object.onBeforeRender = (renderer, _scene, camera) => {
    material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    renderer.getSize(material.uniforms.viewport.value as THREE.Vector2);
    material.uniforms.zoomFade.value = zoomOutFadeFor(renderer, camera, object);
    // Hidden in a replay: a count of three over a place showing one so far is false.
    material.uniforms.hidden.value = getReplayMoment() ? 1 : 0;
  };
  object.frustumCulled = false;
  // Over the glyph it belongs to.
  object.renderOrder = SCREEN_POINTS_RENDER_ORDER + 1;
  // Never a pick target: a hit here must not stand in for the glyph's report.
  object.raycast = () => {};
  return object;
}

/** Release a sprite layer's GPU memory. The atlas is shared and is NOT disposed. */
export function disposeIntelSprites(points: THREE.Points): void {
  points.geometry.dispose();
  (points.material as THREE.ShaderMaterial).dispose();
  // A decluttered layer's count badges, rings and pings ride on it (glyphDeclutter.ts, glyphOverlays.ts).
  for (const child of points.children) {
    const part = child as THREE.Mesh | THREE.Points;
    if (!part.geometry) continue;
    part.geometry.dispose();
    (part.material as THREE.Material).dispose();
  }
}
