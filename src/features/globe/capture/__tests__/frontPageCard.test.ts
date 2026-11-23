/**
 * A front page (decision IM16; capture schema 14): the War & Conflict Brief of
 * one UTC day, headed and stated as Starcom read it, in place of an item's
 * title and facts, under the brief's gunmetal badge with its glyph (IM5).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  buildGlobeViewProvenance,
  GLOBE_CAPTURE_SCHEMA_VERSION,
  type BuildProvenanceInput,
  type FrontPageProvenance,
} from '../shareCardProvenance';
import { computeShareCardLayout, type LayoutInput } from '../shareCardLayout';
import { drawShareCard } from '../drawShareCard';
import { TEMPLATE_SPECS } from '../cardTemplates';

const AT = new Date('2026-10-03T01:00:00.000Z');
const FRONT: FrontPageProvenance = {
  template: 'conflict_brief', day: '2026-10-02', title: 'War & Conflict Brief · 2 Oct 2026',
  lines: ['14 items reported on 2 Oct 2026 (UTC), posted on The Record', 'By war, worst first: Russo-Ukrainian war 4', '3 name no war'],
  count: 14, theatres: [{ name: 'Russo-Ukrainian war', count: 4, tier: 'major_war' }], noTheatre: 3,
};
const provenanceInput = (over: Partial<BuildProvenanceInput> = {}): BuildProvenanceInput => ({
  capturedAt: AT,
  camera: { lat: 30, lon: 40, altitude: 2.5 },
  frame: { width: 1200, height: 628 },
  layers: [{ label: 'War & Conflict', active: true, implemented: true }],
  feeds: [{ name: 'War & Conflict', lastUpdated: AT.toISOString() }],
  build: { sha: 'a'.repeat(40), builtAt: AT.toISOString() },
  now: AT,
  ...over,
});
const BRIEF_BADGE = TEMPLATE_SPECS.conflict_brief.badge!;
const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;
const layoutInput = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  provenance: buildGlobeViewProvenance(provenanceInput({ frontPage: FRONT, template: { name: 'conflict_brief', chosenBy: 'subject' } })),
  bounds: { minX: 300, minY: 0, maxX: 900, maxY: 628, width: 600, height: 628 },
  frame: { width: 1200, height: 628 },
  measure,
  badge: BRIEF_BADGE,
  ...over,
});

describe('what the card records (schema 14)', () => {
  it('is schema 14', () => {
    expect(GLOBE_CAPTURE_SCHEMA_VERSION).toBeGreaterThanOrEqual(14);
  });

  it('records the front page as read, and none on any other card', () => {
    expect(buildGlobeViewProvenance(provenanceInput({ frontPage: FRONT })).frontPage).toEqual(FRONT);
    expect('frontPage' in buildGlobeViewProvenance(provenanceInput())).toBe(false);
  });

  it('says nothing of the badge: a front page is what its subject is, not a claim about an item', () => {
    const p = buildGlobeViewProvenance(provenanceInput({ frontPage: FRONT, template: { name: 'conflict_brief', chosenBy: 'subject' } }));
    expect(p.card).toEqual({ template: 'conflict_brief', badge: 'WAR & CONFLICT BRIEF', chosenBy: 'subject' });
    expect(p.caveats.join(' ')).not.toMatch(/badge/i);
  });
});

describe('how it reads', () => {
  it('heads the card with the brief and its day, its facts under it', () => {
    const layout = computeShareCardLayout(layoutInput());
    const headline = layout.lines.filter((l) => l.kind === 'featured').map((l) => l.text).join(' ');
    expect(headline).toBe('War & Conflict Brief · 2 Oct 2026');
    const details = layout.lines.filter((l) => l.kind === 'detail').map((l) => l.text).join(' ');
    for (const line of FRONT.lines) expect(details).toContain(line.split(' ').slice(0, 4).join(' '));
    expect(layout.callout).toBeUndefined();
  });

  it('carries the brief\'s glyph on its badge, before its word', () => {
    const badge = computeShareCardLayout(layoutInput()).badge!;
    expect(badge.glyph).toBe('report');
    expect(badge.glyphBox).toBeDefined();
    expect(badge.glyphBox!.x).toBeGreaterThanOrEqual(badge.x);
    expect(badge.glyphBox!.x + badge.glyphBox!.size).toBeLessThan(badge.textX);
    expect(badge.glyphBox!.y).toBeGreaterThanOrEqual(badge.y);
    expect(badge.glyphBox!.y + badge.glyphBox!.size).toBeLessThanOrEqual(badge.y + badge.height);
  });

  it('gives a badge with no glyph no room for one', () => {
    const plain = computeShareCardLayout(layoutInput({ badge: TEMPLATE_SPECS.critical_intel.badge })).badge!;
    expect(plain.glyph).toBeNull();
    expect(plain.glyphBox).toBeNull();
  });
});

describe('how the glyph is drawn', () => {
  type Call = { op: string; args: unknown[]; style?: string };
  const recorder = () => {
    const calls: Call[] = [];
    const ctx = {
      fillStyle: '', strokeStyle: '', font: '', lineWidth: 0, textBaseline: 'alphabetic' as CanvasTextBaseline,
      fillRect: (...a: unknown[]) => calls.push({ op: 'fillRect', args: a, style: String(ctx.fillStyle) }),
      fillText: (...a: unknown[]) => calls.push({ op: 'fillText', args: a, style: String(ctx.fillStyle) }),
      drawImage: () => {}, beginPath: () => calls.push({ op: 'beginPath', args: [] }),
      moveTo: (...a: unknown[]) => calls.push({ op: 'moveTo', args: a }), lineTo: (...a: unknown[]) => calls.push({ op: 'lineTo', args: a }),
      stroke: () => calls.push({ op: 'stroke', args: [], style: String(ctx.strokeStyle) }), arc: () => {}, fill: () => {},
    };
    return { ctx, calls };
  };

  it('strokes it in the badge\'s ink, inside its box, after the box is filled', () => {
    const layout = computeShareCardLayout(layoutInput());
    const { ctx, calls } = recorder();
    drawShareCard(ctx, {} as CanvasImageSource, layout);
    const box = layout.badge!.glyphBox!;
    const fill = calls.findIndex((c) => c.op === 'fillRect' && c.style === BRIEF_BADGE.tone);
    const inked = calls.map((c, i) => ({ c, i })).filter(({ c }) => c.op === 'stroke' && c.style === BRIEF_BADGE.ink);
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(inked.length).toBeGreaterThan(0);
    expect(inked[0].i).toBeGreaterThan(fill);
    const points = calls.filter((c) => c.op === 'moveTo' || c.op === 'lineTo').map((c) => c.args as number[])
      .filter(([x, y]) => x >= box.x - 1 && x <= box.x + box.size + 1 && y >= box.y - 1 && y <= box.y + box.size + 1);
    expect(points.length).toBeGreaterThanOrEqual(8);
  });
});
