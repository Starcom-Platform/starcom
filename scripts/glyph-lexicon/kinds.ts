/**
 * Colour by kind (critique-2026-11-01 OR3, OR15; plan A3), as drafted for the owner's review: twelve kinds, each a
 * colour, drawn from the Lexicon's own domains (draft.ts) so there is one taxonomy, not two. An item's icon says
 * exactly what it is; its colour says which of the twelve it belongs to; severity is size and brightness, never hue.
 * Colour is never the only cue: every kind's items carry icons of their own.
 *
 * The sheet shows each colour as it is and as three kinds of colour blindness see it (Machado, Oliveira and
 * Fernandes 2009, full severity), with the closest pair in each, measured in OKLab. Nothing here is wired.
 */

import { KIND_COLOURS } from '../../src/styles/tokens';

export interface DraftColourKind {
  id: string;
  name: string;
  colour: string;
  /** Draft kinds (draft.ts ids) that take this colour: a domain id, or an id prefix. */
  takes: readonly string[];
  note?: string;
}

export const COLOUR_KINDS: readonly DraftColourKind[] = [
  { id: 'conflict', name: 'Armed conflict', colour: KIND_COLOURS.conflict, takes: ['conflict:'] },
  { id: 'unrest', name: 'Unrest', colour: KIND_COLOURS.unrest, takes: ['society:civic:protest', 'society:unrest:'], note: "Civil Unrest's own chartreuse (D-CU, CU1), kept." },
  { id: 'hazards', name: 'Ground and sea hazards', colour: KIND_COLOURS.hazards, takes: ['earth:geo:', 'earth:fire:', 'earth:env:'] },
  { id: 'weather', name: 'Weather and climate', colour: KIND_COLOURS.weather, takes: ['earth:weather:'] },
  { id: 'health', name: 'Health and harm reduction', colour: KIND_COLOURS.health, takes: ['health:'] },
  { id: 'cyber', name: 'Cyber', colour: KIND_COLOURS.cyber, takes: ['cyber:'] },
  { id: 'ai', name: 'AI and technology', colour: KIND_COLOURS.ai, takes: ['ai:'], note: "AI Watch's own magenta (D-AW, AW5), kept." },
  { id: 'economy', name: 'Economy, energy and resources', colour: KIND_COLOURS.economy, takes: ['economy:'] },
  { id: 'infra', name: 'Infrastructure and transport', colour: KIND_COLOURS.infra, takes: ['infra:'] },
  { id: 'space', name: 'Space', colour: KIND_COLOURS.space, takes: ['space:'] },
  { id: 'civic', name: 'Diplomacy, governance and society', colour: KIND_COLOURS.civic, takes: ['society:'] },
  { id: 'missions', name: 'Missions, aid and rescue', colour: KIND_COLOURS.missions, takes: ['work:', 'society:aid:', 'society:rescue:'], note: "Hero Watch's and Missions' rescue orange, kept." },
];

/** The colour kind a draft kind takes: the longest matching prefix wins, so society:aid: beats society:. */
export function colourKindOf(kindId: string): DraftColourKind | null {
  let best: DraftColourKind | null = null;
  let length = -1;
  for (const ck of COLOUR_KINDS) {
    for (const t of ck.takes) {
      if (kindId.startsWith(t) && t.length > length) { best = ck; length = t.length; }
    }
  }
  return best;
}

export type Vision = 'normal' | 'protan' | 'deutan' | 'tritan';

const MACHADO: Record<Exclude<Vision, 'normal'>, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** A colour as one kind of vision sees it, as hex. */
export function seen(hex: string, vision: Vision): string {
  if (vision === 'normal') return hex;
  const lin = rgbOf(hex).map(toLinear);
  const m = MACHADO[vision];
  const out = m.map((row) => clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
  return `#${out.map((v) => Math.round(toGamma(v) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** OKLab of a hex colour. */
export function oklab(hex: string): [number, number, number] {
  const [r, g, b] = rgbOf(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export const deltaE = (a: string, b: string): number => {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

/** The closest pair of kinds as one vision sees them. */
export function closestPair(vision: Vision): { a: string; b: string; d: number } {
  let best = { a: '', b: '', d: Infinity };
  for (let i = 0; i < COLOUR_KINDS.length; i++) {
    for (let j = i + 1; j < COLOUR_KINDS.length; j++) {
      const d = deltaE(seen(COLOUR_KINDS[i].colour, vision), seen(COLOUR_KINDS[j].colour, vision));
      if (d < best.d) best = { a: COLOUR_KINDS[i].name, b: COLOUR_KINDS[j].name, d };
    }
  }
  return best;
}
