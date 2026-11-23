/**
 * The marks' atlas (critique-2026-11-01, OR2, OR3, OR15; plan A4): for each kind a layer draws, its icon on its frame,
 * the frame's rim in its kind's colour, and a dot of that colour. Two rows: the icon (Icon and Pin styles), the dot
 * (Dot style). Baked once per set of kinds, as War & Conflict's and the Intel Reports' atlases are, by the same
 * baker (bakeSvgAtlas).
 *
 * The frame says what sort of thing (globe-visuals-overhaul.md, "The ontology"): a disc an event, a rounded square
 * an asset, a hexagon an area, a diamond an actor, a shield a protective resource, an open ring a forecast. The
 * icon says exactly what; the colour which of the twelve kinds. A kind still to be drawn is its frame alone.
 */
import type * as THREE from 'three';
import { bakeSvgAtlas } from '../../../components/Globe/intelReportSprites';
import { GUNMETAL, KIND_COLOURS } from '../../../styles/tokens';
import { KINDS, type KindEntry, type KindFrame } from './kindLexicon';

export const KIND_ATLAS_ROWS = { icon: 0, dot: 1 } as const;
export const KIND_ATLAS_ROW_COUNT = 2;
/** What an unknown kind is drawn as: the conflict domain's report, the plainest event. */
export const FALLBACK_KIND = 'conflict:report';

const GROUND = GUNMETAL[950];
const INK = GUNMETAL[100];
const OUTLINE = GUNMETAL[950];

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${body}</svg>`;

/** Each frame's shape on the cell's 64-unit box, its rim in the kind's colour. */
function frameMarkup(frame: KindFrame, rim: string): string {
  const fill = `fill="${GROUND}" fill-opacity="0.86" stroke="${rim}" stroke-width="3.4" stroke-linejoin="round"`;
  switch (frame) {
    case 'asset': return `<rect x="5" y="5" width="54" height="54" rx="13" ${fill}/>`;
    case 'area': return `<polygon points="32,3.5 56.7,17.75 56.7,46.25 32,60.5 7.3,46.25 7.3,17.75" ${fill}/>`;
    case 'actor': return `<polygon points="32,2.5 61.5,32 32,61.5 2.5,32" ${fill}/>`;
    case 'protective': return `<path d="M32 3.5 L56.5 11.8 V29.8 C56.5 44.5 46 55.2 32 60.5 C18 55.2 7.5 44.5 7.5 29.8 V11.8 Z" ${fill}/>`;
    case 'forecast':
      return `<circle cx="32" cy="32" r="28.5" fill="${GROUND}" fill-opacity="0.6"/>`
        + `<path d="M44.3 6.1 A28.5 28.5 0 1 1 19.7 6.1" fill="none" stroke="${rim}" stroke-width="3.4" stroke-linecap="round"/>`;
    case 'event':
    default: return `<circle cx="32" cy="32" r="28.5" ${fill}/>`;
  }
}

/** How far each frame's icon is drawn in from the cell's edge: the diamond and the shield hold less. */
const ICON_SCALE: Record<KindFrame, number> = { event: 1, asset: 1, area: 0.94, actor: 0.8, protective: 0.86, forecast: 0.94 };

/** The icon, light over a dark outline, centred: Lucide's 24-unit grid at 36 of the cell's 64 (times the frame's scale). */
function iconMarkup(entry: KindEntry): string {
  if (!entry.icon) return '';
  const scale = (entry.grid === 64 ? 36 / 64 : 1.5) * ICON_SCALE[entry.frame];
  const size = (entry.grid === 64 ? 64 : 24) * scale;
  const at = (64 - size) / 2;
  const frame = `transform="translate(${at.toFixed(2)} ${at.toFixed(2)}) scale(${scale.toFixed(4)})" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  if (entry.grid === 64) return `<g transform="translate(${at.toFixed(2)} ${at.toFixed(2)}) scale(${scale.toFixed(4)})">${entry.icon}</g>`;
  return `<g ${frame} stroke="${OUTLINE}" stroke-width="${(4.5 / scale * 1.5).toFixed(2)}">${entry.icon}</g>`
    + `<g ${frame} stroke="${INK}" stroke-width="${(2.25 / scale * 1.5).toFixed(2)}">${entry.icon}</g>`;
}

const struck = `<path d="M14 50 L50 14" stroke="${OUTLINE}" stroke-width="7" stroke-linecap="round"/><path d="M14 50 L50 14" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;

export const kindEntry = (kind: string): KindEntry => KINDS[kind] ?? KINDS[FALLBACK_KIND];
export const kindColour = (kind: string): string => KIND_COLOURS[kindEntry(kind).colour];

/** One cell: a kind as an icon on its frame, or as a dot of its colour. */
export function kindCellSvg(kind: string, row: number): string {
  const entry = kindEntry(kind);
  const colour = KIND_COLOURS[entry.colour];
  if (row === KIND_ATLAS_ROWS.dot) {
    return svg(`<circle cx="32" cy="32" r="22" fill="${colour}" stroke="${OUTLINE}" stroke-width="5"/>`);
  }
  return svg(frameMarkup(entry.frame, colour) + iconMarkup(entry) + (entry.modifier === 'struck' ? struck : ''));
}

export interface KindAtlas {
  texture: THREE.Texture | null;
  /** The kinds in the atlas, by column. */
  kinds: readonly string[];
  cellOf(kind: string): number;
}

const baked = new Map<string, Promise<KindAtlas>>();

/** The atlas for a set of kinds (unknown ones fall back to a plain report), baked once per set. */
export function kindAtlas(kinds: readonly string[]): Promise<KindAtlas> {
  const known = [...new Set([...kinds.filter((k) => KINDS[k]), FALLBACK_KIND])].sort();
  const key = known.join('|');
  const cached = baked.get(key);
  if (cached) return cached;
  const promise = bakeSvgAtlas([known.map((k) => kindCellSvg(k, KIND_ATLAS_ROWS.icon)), known.map((k) => kindCellSvg(k, KIND_ATLAS_ROWS.dot))])
    .then((texture) => ({
      texture,
      kinds: known,
      cellOf: (kind: string) => {
        const at = known.indexOf(KINDS[kind] ? kind : FALLBACK_KIND);
        return at < 0 ? 0 : at;
      },
    }));
  baked.set(key, promise);
  return promise;
}

/** Test-only: forget the atlases baked. */
export function resetKindAtlasesForTests(): void { baked.clear(); }
