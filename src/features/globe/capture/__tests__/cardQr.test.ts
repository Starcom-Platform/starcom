/**
 * A card's QR code (IM13, IM30–IM32), only when a shot asks: a short link to
 * the view on starcom.app, encoded by a small library loaded only then, and
 * drawn with the footer, right-aligned, in the room the text gives up.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import qrcode from 'qrcode-generator';
import { qrViewLink, encodeQr, STARCOM_SITE } from '../cardQr';
import { buildGlobeViewProvenance } from '../shareCardProvenance';
import { computeShareCardLayout, pictureSizeFor, CARD_PRESETS, type CardPreset, type LayoutInput } from '../shareCardLayout';

const LINK = {
  v: 1 as const, sub: 'WarConflict' as const, at: { lat: 24.1, lng: 44.5, alt: 1 }, pins: ['HeatRisk' as const],
  focus: '30023:6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692:starcom-intel-conflict-easa-b582f0c184d60e5f',
  win: { from: 1790899200, until: 1790985600 }, look: { skin: 'blueMarble' as const },
};

describe('what the code opens (IM31)', () => {
  it('is a short link to the view on starcom.app: the place, the altitude and the layers, never the item, the window or the look', () => {
    const link = qrViewLink(LINK as never);
    expect(STARCOM_SITE).toBe('https://starcom.app');
    expect(link).toBe('https://starcom.app/?v=1&sub=WarConflict&at=24.1,44.5,1&pin=HeatRisk');
    expect(link.length).toBeLessThan(80);
  });
});

describe('how it is encoded (IM30)', () => {
  it('as the library makes it, at error correction M: a square of modules with its three finder patterns', async () => {
    const modules = await encodeQr('https://starcom.app/?v=1&sub=WarConflict&at=24.1,44.5,1');
    const n = modules.length;
    expect(n).toBeGreaterThanOrEqual(21);
    expect((n - 17) % 4).toBe(0);
    for (const row of modules) expect(row).toHaveLength(n);
    // A finder pattern's dark ring and dark centre, at three corners.
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(modules[r][c]).toBe(true);
      expect(modules[r + 1][c + 1]).toBe(false);
      expect(modules[r + 3][c + 3]).toBe(true);
    }
    expect(await encodeQr('https://starcom.app/?v=1&sub=WarConflict&at=24.1,44.5,1')).toEqual(modules);
    // The library's own code at level M, module for module.
    const code = qrcode(0, 'M');
    code.addData('https://starcom.app/?v=1&sub=WarConflict&at=24.1,44.5,1', 'Byte');
    code.make();
    expect(modules).toEqual(Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => code.isDark(r, c))));
  });

  it('a short link makes a small code, several versions smaller than the full link\'s', async () => {
    const short = await encodeQr(qrViewLink(LINK as never));
    const full = await encodeQr(`${STARCOM_SITE}/?v=2&sub=WarConflict&at=24.1,44.5,1&pin=HeatRisk&focus=${LINK.focus}&win=1790899200..1790985600&look=blueMarble`);
    // Version 5 at most: 37 modules a side, against the full link's 53 or more.
    expect(short.length).toBeLessThanOrEqual(37);
    expect(full.length - short.length).toBeGreaterThanOrEqual(16);
  });
});

const AT = new Date('2026-10-03T01:00:00.000Z');
const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;
const at = (preset: CardPreset, qr: boolean): LayoutInput => ({
  provenance: buildGlobeViewProvenance({
    capturedAt: AT, camera: { lat: 24.1, lon: 44.5, altitude: 1 }, frame: { width: 1080, height: 1080 },
    layers: [{ label: 'War & Conflict', active: true, implemented: true }], feeds: [{ name: 'War & Conflict', lastUpdated: AT.toISOString() }],
    build: { sha: 'a'.repeat(40), builtAt: AT.toISOString() },
    featured: { id: 'x', title: 'A short title', lines: ['War & Conflict · A report'] }, now: AT,
  }),
  bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 },
  frame: { width: 1000, height: 1000 },
  measure,
  style: { ...CARD_PRESETS[preset] },
  qr,
});

describe('where it sits (IM32)', () => {
  for (const preset of ['square', 'portrait', 'story', 'embed', 'wide'] as const) {
    it(`${preset}: with the footer, right-aligned, inside the card, the footer's words beside it`, () => {
      const layout = computeShareCardLayout(at(preset, true));
      const { padding } = CARD_PRESETS[preset];
      const box = layout.qr!;
      expect(box.size).toBe(CARD_PRESETS[preset].qrPx);
      expect(box.x + box.size).toBe(layout.width - padding);
      expect(box.y + box.size).toBeLessThanOrEqual(layout.height - padding / 2);
      expect(box.x).toBeGreaterThanOrEqual(layout.strip.x);
      // In the bottom-right corner: the caveats and the footer wrap beside it, so it costs little height.
      const beside = layout.lines.filter((l) => l.kind === 'caveat' || l.kind === 'footer');
      expect(box.y).toBe(beside[0].y - beside[0].fontPx);
      for (const line of beside) expect(line.x + measure(line.text, line.fontPx), line.text).toBeLessThanOrEqual(box.x);
      // Every other line is above it.
      for (const line of layout.lines.filter((l) => l.kind !== 'caveat' && l.kind !== 'footer')) expect(line.y, line.text).toBeLessThanOrEqual(box.y);
      expect(pictureSizeFor(at(preset, true))).toEqual({ width: layout.globeArea.width, height: layout.globeArea.height });
    });
  }

  it('beside the caveats as well as the footer, so the lines beside it save part of its height', () => {
    const without = computeShareCardLayout(at('square', false));
    const with_ = computeShareCardLayout(at('square', true));
    const cost = without.globeArea.height - with_.globeArea.height;
    // Under everything, the code would cost its own height and a gap; the lines beside it save some of that.
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(CARD_PRESETS.square.qrPx);
  });

  it('stands beside the footer alone when there is no caveat to stand beside, never dropped', () => {
    const input = at('square', true);
    const bare = computeShareCardLayout({ ...input, provenance: { ...input.provenance, caveats: [], caveatsShort: [] } });
    const footer = bare.lines.filter((l) => l.kind === 'footer');
    expect(bare.qr).toBeDefined();
    expect(bare.qr!.y).toBe(footer[0].y - footer[0].fontPx);
  });

  it('takes its room from the picture on a stacked card, as any line does', () => {
    const without = computeShareCardLayout(at('square', false));
    const with_ = computeShareCardLayout(at('square', true));
    expect(without.qr).toBeUndefined();
    expect(with_.globeArea.height).toBeLessThan(without.globeArea.height);
    expect([with_.width, with_.height]).toEqual([1080, 1080]);
  });
});
