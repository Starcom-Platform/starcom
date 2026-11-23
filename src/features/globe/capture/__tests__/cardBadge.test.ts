/**
 * A card's badge (decisions IM5 and IM14; capture schema 13).
 *
 * Mecha Jono's word for what the card is about, in a colour that already means
 * it, opening the band under the picture. The card records its template and who
 * chose it. Where the shot chose a badge the item does not state, the card says
 * so: a badge is a claim about the item, and that one was not checked.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { buildGlobeViewProvenance, GLOBE_CAPTURE_SCHEMA_VERSION, type BuildProvenanceInput } from '../shareCardProvenance';
import { computeShareCardLayout, DEFAULT_CARD_STYLE, CARD_PRESETS, type LayoutInput } from '../shareCardLayout';
import { drawShareCard, DEFAULT_CARD_THEME } from '../drawShareCard';
import { TEMPLATE_SPECS } from '../cardTemplates';

const AT = new Date('2026-09-10T12:00:00.000Z');
const provenanceInput = (over: Partial<BuildProvenanceInput> = {}): BuildProvenanceInput => ({
  capturedAt: AT,
  camera: { lat: 35, lon: 71.2, altitude: 1 },
  frame: { width: 1200, height: 630 },
  layers: [{ label: 'War & Conflict', active: true, implemented: true }],
  feeds: [{ name: 'War & Conflict', lastUpdated: AT.toISOString() }],
  build: { sha: 'a'.repeat(40), builtAt: AT.toISOString() },
  featured: { id: 'x', title: 'Pakistan launches airstrikes in Afghanistan', lines: ['War & Conflict · Airstrike'] },
  now: AT,
  ...over,
});
const CRITICAL = TEMPLATE_SPECS.critical_intel.badge!;

describe('what the card records (schema 13)', () => {
  it('is schema 13', () => {
    expect(GLOBE_CAPTURE_SCHEMA_VERSION).toBeGreaterThanOrEqual(13);
  });

  it('records its template, its badge and who chose it', () => {
    const p = buildGlobeViewProvenance(provenanceInput({ template: { name: 'critical_intel', chosenBy: 'item' } }));
    expect(p.card).toEqual({ template: 'critical_intel', badge: 'CRITICAL INTEL', chosenBy: 'item' });
  });

  it('records none on the default card', () => {
    expect(buildGlobeViewProvenance(provenanceInput()).card).toBeNull();
  });

  it('says so when the shot chose a badge the item does not state, and only then', () => {
    const chosen = buildGlobeViewProvenance(provenanceInput({ template: { name: 'actionable_intel', chosenBy: 'shot' } }));
    const at = chosen.caveats.findIndex((c) => c.includes('ACTIONABLE INTEL'));
    expect(at).toBeGreaterThanOrEqual(0);
    expect(chosen.caveats[at]).toMatch(/whoever made this card.*does not state its role/);
    expect(chosen.caveatsShort[at]).toBe('The badge is the card maker\'s: the item does not state its role.');

    const own = buildGlobeViewProvenance(provenanceInput({ template: { name: 'critical_intel', chosenBy: 'item' } }));
    expect(own.caveats.join(' ')).not.toMatch(/badge/i);
    // A template with no badge claims nothing, whoever chose it.
    const plain = buildGlobeViewProvenance(provenanceInput({ template: { name: 'hazard', chosenBy: 'shot' } }));
    expect(plain.caveats.join(' ')).not.toMatch(/badge/i);
  });
});

const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;
const layoutInput = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  provenance: buildGlobeViewProvenance(provenanceInput()),
  bounds: { minX: 400, minY: 60, maxX: 1000, maxY: 660, width: 600, height: 600 },
  frame: { width: 1400, height: 708 },
  measure,
  ...over,
});

describe('where it sits (IM10)', () => {
  it('opens the band under the picture, above the headline', () => {
    const layout = computeShareCardLayout(layoutInput({ badge: CRITICAL }));
    const badge = layout.badge!;
    expect(badge).toMatchObject({ text: 'CRITICAL INTEL', tone: CRITICAL.tone, ink: CRITICAL.ink, x: DEFAULT_CARD_STYLE.padding });
    expect(badge.y).toBeGreaterThanOrEqual(layout.globeArea.y + layout.globeArea.height);
    const headline = layout.lines.find((l) => l.kind === 'featured')!;
    expect(headline.y - headline.fontPx).toBeGreaterThan(badge.y + badge.height);
  });

  it('fits its word with room either side', () => {
    const badge = computeShareCardLayout(layoutInput({ badge: CRITICAL })).badge!;
    expect(badge.width).toBeGreaterThan(measure('CRITICAL INTEL', badge.fontPx));
    expect(badge.height).toBeGreaterThan(badge.fontPx);
    expect(badge.textX).toBeGreaterThan(badge.x);
    expect(badge.textX + measure('CRITICAL INTEL', badge.fontPx)).toBeLessThan(badge.x + badge.width);
  });

  it('grows the card by its height, and leaves a card without one as it was', () => {
    const none = computeShareCardLayout(layoutInput());
    expect(none.badge).toBeUndefined();
    expect(computeShareCardLayout(layoutInput({ badge: null })).height).toBe(none.height);
    expect(computeShareCardLayout(layoutInput({ badge: CRITICAL })).height).toBeGreaterThan(none.height);
  });
});

describe('Discord\'s size (IM15)', () => {
  it('is its own preset, 1280×800, and wide stays the link preview, 1200×630: each the whole card (IM27)', () => {
    expect(CARD_PRESETS.embed).toMatchObject({ width: 1280, height: 800, side: true });
    expect(CARD_PRESETS.wide).toMatchObject({ width: 1200, height: 630, side: true });
  });
});

describe('how it is drawn', () => {
  type Call = { op: string; args: unknown[]; fill?: string; font?: string };
  const recorder = () => {
    const calls: Call[] = [];
    const ctx = {
      fillStyle: '', strokeStyle: '', font: '', lineWidth: 0, textBaseline: 'alphabetic' as CanvasTextBaseline,
      fillRect: (...a: unknown[]) => calls.push({ op: 'fillRect', args: a, fill: String(ctx.fillStyle) }),
      fillText: (...a: unknown[]) => calls.push({ op: 'fillText', args: a, fill: String(ctx.fillStyle), font: ctx.font }),
      drawImage: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, arc: () => {}, fill: () => {},
    };
    return { ctx, calls };
  };

  it('fills its box in its tone, then sets its word over it, bold, in its ink', () => {
    const layout = computeShareCardLayout(layoutInput({ badge: CRITICAL }));
    const { ctx, calls } = recorder();
    drawShareCard(ctx, {} as CanvasImageSource, layout);
    const box = calls.findIndex((c) => c.op === 'fillRect' && c.fill === CRITICAL.tone);
    const word = calls.findIndex((c) => c.op === 'fillText' && c.args[0] === 'CRITICAL INTEL');
    expect(box).toBeGreaterThanOrEqual(0);
    expect(word).toBeGreaterThan(box);
    expect(calls[box].args).toEqual([layout.badge!.x, layout.badge!.y, layout.badge!.width, layout.badge!.height]);
    expect(calls[word].fill).toBe(CRITICAL.ink);
    expect(calls[word].font).toMatch(/^700 /);
    expect(calls[word].font).toContain(`${layout.badge!.fontPx}px`);
  });

  it('draws no badge on a card without one', () => {
    const layout = computeShareCardLayout(layoutInput());
    const { ctx, calls } = recorder();
    drawShareCard(ctx, {} as CanvasImageSource, layout);
    expect(calls.some((c) => c.op === 'fillRect' && c.fill === CRITICAL.tone)).toBe(false);
    expect(calls.filter((c) => c.op === 'fillRect' && c.fill === DEFAULT_CARD_THEME.background).length).toBeGreaterThan(0);
  });
});
