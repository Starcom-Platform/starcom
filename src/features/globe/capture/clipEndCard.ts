/**
 * The closing card of a clip: its caveats, as frames of the video itself.
 *
 * ─── WHY THE CAVEATS HAVE TO BE IN THE PIXELS ──────────────────────────────
 *
 * A still share card cannot be separated from its caveats — they are drawn
 * into the image, and the only way to publish the picture without them is to
 * crop them off deliberately. When recordClip shipped, video had no such
 * property: provenance came back as data beside the frames, and a clip posted
 * without that data was a clip with no caveats at all. That made video the one
 * output the share path produced that could lose its disclosures by accident.
 *
 * So the clip ends on a card, and the card's frames are part of `frames`.
 * Assembling the video includes them because assembling the video includes
 * everything; dropping them means deliberately truncating the array. That is
 * the same bar as the still — possible on purpose, never by accident.
 *
 * ─── THE LAYOUT RULES, AND THE ONE REFUSAL ─────────────────────────────────
 *
 * The card is the footage's own size — a video's frames must all match — so
 * it cannot grow the way a share card's strip does. It PAGINATES instead:
 *
 *   - the heading is on every page, so any paused frame explains itself
 *   - details (camera path, layers, build) go on the first page
 *   - each caveat stays whole on one page; half a caveat can invert its sense
 *   - a caveat too long for an empty page, or more pages than `maxPages`, is
 *     REFUSED. Same rule as computeShareCardLayout: the caveat that would be
 *     cut is the one a viewer most needs.
 *
 * Each page is held long enough to read, scaled by how much is on it. A
 * caveat shown too briefly to read has not been shown.
 */
import { formatCameraLine } from './shareCardProvenance';
import { wrapText, type MeasureText, type TextLine } from './shareCardLayout';
import { formatOffset, type ClipProvenance } from './clipProvenance';
import { CREDITS, creditLine, creditsParagraph } from './sourceCredits';
import { PLAYLIST_ORDER, type PlaylistId } from '../tour/briefingPlaylist';

export interface EndCardStyle {
  padding: number;
  headingPx: number;
  bodyPx: number;
  lineGap: number;
  /** Extra space between the details and the first caveat. */
  sectionGap: number;
  maxPages: number;
  baseHoldMs: number;
  perCaveatHoldMs: number;
  maxHoldMs: number;
}

/**
 * Proportional to the frame's height, so a 1080-line clip gets text as legible
 * as a 708-line one rather than the same pixel size at two-thirds the scale.
 */
export function endCardStyleFor(height: number): EndCardStyle {
  return {
    padding: Math.round(height * 0.068),
    headingPx: Math.round(height * 0.042),
    bodyPx: Math.round(height * 0.031),
    lineGap: Math.round(height * 0.014),
    sectionGap: Math.round(height * 0.02),
    maxPages: 3,
    baseHoldMs: 4000,
    perCaveatHoldMs: 1200,
    maxHoldMs: 9000,
  };
}

export interface EndCardPage {
  lines: TextLine[];
  /** How long this page is held on screen. */
  holdMs: number;
}

export interface EndCardLayout {
  width: number;
  height: number;
  pages: EndCardPage[];
}

export class EndCardLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EndCardLayoutError';
  }
}

export interface EndCardInput {
  width: number;
  height: number;
  provenance: ClipProvenance;
  /** Frames per second of the footage the card closes — stated on the card. */
  fps: number;
  measure: MeasureText;
  style?: Partial<EndCardStyle>;
}

type Block = { text: string; fontPx: number; kind: TextLine['kind'] };

export function layoutEndCard(input: EndCardInput): EndCardLayout {
  const style = { ...endCardStyleFor(input.height), ...input.style };
  const { width, height, provenance: p, measure } = input;
  const textWidth = width - style.padding * 2;
  const bottom = height - style.padding;

  if (textWidth <= 0 || bottom <= style.padding) {
    throw new EndCardLayoutError(`A ${width}x${height} frame leaves no room for an end card.`);
  }

  const stamp = p.startedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
  const headingFor = (page: number, total: number) =>
    `STARCOM · recorded ${stamp}${total > 1 ? ` · ${page} of ${total}` : ''}`;

  /*
   * The report the clip is about, first, as a still's card puts it: the subject,
   * then the view that shows it.
   */
  const featured: Block[] = p.featured
    ? [
      { text: p.featured.title, fontPx: style.bodyPx + 2, kind: 'featured' as const },
      ...p.featured.lines.map((text) => ({ text, fontPx: style.bodyPx, kind: 'detail' as const })),
    ]
    : [];
  // A tour's subject is its playlist, then each stop with when it starts (BP15, BP18).
  const tour = p.tour;
  const toured: Block[] = tour
    ? [
      {
        // "The worst" only for a playlist that ranks how bad: Hero Watch's ranks no harm (HW13).
        text: `${tour.title}: a tour of ${tour.total > tour.shown
          ? `${PLAYLIST_ORDER[tour.playlist as PlaylistId]?.worstFirst === false ? '' : 'the worst '}${tour.shown} of ${tour.total}`
          : `its ${tour.shown} ${tour.shown === 1 ? 'stop' : 'stops'}`}`,
        fontPx: style.bodyPx + 2,
        kind: 'featured' as const,
      },
      ...tour.stops.map((stop) => ({ text: `${formatOffset(stop.fromMs)} ${stop.title}`, fontPx: style.bodyPx, kind: 'detail' as const })),
    ]
    : [];

  // Who to credit for the data drawn (record D-L, decision L5), the names (K5, TS14) and who made the images (TX10), as a still's card names them.
  const credited = creditsParagraph(p.credits ?? [], p.imagery ?? [], p.countryNames ? [creditLine(CREDITS.naturalEarth)] : []);
  const details: Block[] = [...featured, ...toured, ...[
    `${formatCameraLine(p.camera.start)}  →  ${formatCameraLine(p.camera.end)}`,
    p.layersShown.length ? `Layers: ${p.layersShown.join(', ')}` : 'No data layer active',
    `${formatOffset(p.durationMs)} of footage at ${input.fps} fps`
      + (p.build.sha ? ` · build ${p.build.sha.slice(0, 8)}` : ''),
    ...(credited ? [credited] : []),
  ].map((text) => ({ text, fontPx: style.bodyPx, kind: 'detail' as const }))];

  const caveats: Block[] = p.caveats.map((text) => ({ text: `· ${text}`, fontPx: style.bodyPx, kind: 'caveat' as const }));

  /** Height a block takes once wrapped. */
  const heightOf = (b: Block) => wrapText(b.text, textWidth, b.fontPx, measure).length * (b.fontPx + style.lineGap);

  /*
   * Paginate against the WIDEST heading any page could carry ("· 9 of 9"), so
   * that filling in the real page numbers afterwards can never push a page
   * over the edge it was measured against.
   */
  const headingHeight = heightOf({ text: headingFor(9, 9), fontPx: style.headingPx, kind: 'heading' });
  const pagesOfCaveats: Block[][] = [[]];
  let used = style.padding + headingHeight + details.reduce((n, d) => n + heightOf(d), 0) + style.sectionGap;

  for (const caveat of caveats) {
    const h = heightOf(caveat);
    const emptyPage = style.padding + headingHeight + style.sectionGap;
    if (emptyPage + h > bottom) {
      throw new EndCardLayoutError(
        `A single caveat needs ${Math.ceil(h)}px and an empty page offers ${Math.floor(bottom - emptyPage)}px. `
        + 'Refusing rather than splitting it across pages or cutting it: half a caveat can '
        + 'invert its meaning.',
      );
    }
    if (used + h > bottom) {
      pagesOfCaveats.push([]);
      used = emptyPage;
    }
    pagesOfCaveats[pagesOfCaveats.length - 1].push(caveat);
    used += h;
  }

  if (pagesOfCaveats.length > style.maxPages) {
    throw new EndCardLayoutError(
      `The caveats need ${pagesOfCaveats.length} pages, over the limit of ${style.maxPages}. `
      + 'Refusing rather than dropping any: the one that would be cut is the one a viewer most '
      + 'needs. Resolve the conditions being disclosed, or record a shorter clip with fewer of them.',
    );
  }

  const total = pagesOfCaveats.length;
  const pages: EndCardPage[] = pagesOfCaveats.map((pageCaveats, index) => {
    const lines: TextLine[] = [];
    let y = style.padding;
    const push = (b: Block) => {
      for (const text of wrapText(b.text, textWidth, b.fontPx, measure)) {
        y += b.fontPx;
        lines.push({ text, x: style.padding, y, fontPx: b.fontPx, kind: b.kind });
        y += style.lineGap;
      }
    };
    push({ text: headingFor(index + 1, total), fontPx: style.headingPx, kind: 'heading' });
    if (index === 0) details.forEach(push);
    y += style.sectionGap;
    pageCaveats.forEach(push);

    return {
      lines,
      holdMs: Math.min(style.maxHoldMs, style.baseHoldMs + style.perCaveatHoldMs * pageCaveats.length),
    };
  });

  return { width, height, pages };
}
