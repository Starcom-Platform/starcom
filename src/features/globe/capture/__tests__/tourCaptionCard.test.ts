/**
 * A tour's caption burned into a clip's frame (briefing-playlists.md, BP15, BP19): the
 * screen's panel at the foot of the frame, sized to its height as the end card is.
 */
import { describe, expect, it, vi } from 'vitest';
import { drawTourCaption, layoutTourCaption } from '../tourCaptionCard';
import type { TourCaption } from '../../tour/tourPlayer';

// Half a font size per character: a measure the tests can reason about.
const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;
const STOP: TourCaption = {
  playlist: 'War & Conflict today', progress: '1 of 3 · 12 in all', title: 'Missile strike on Kramatorsk',
  why: 'Critical, as its report tagged it', lines: ['Kramatorsk, Ukraine', 'Reported 9 Oct 21:40Z'],
};

describe('the caption panel', () => {
  it('sits centred at the foot of the frame, and says what the screen says, in its order', () => {
    const { box, lines } = layoutTourCaption({ width: 1280, height: 720, caption: STOP, measure });
    expect(box.x + box.width / 2).toBeCloseTo(640, 0);
    expect(box.x).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThan(720);
    expect(box.y + box.height).toBeGreaterThan(720 * 0.9);
    expect(lines.map((l) => [l.tone, l.text])).toEqual([
      ['meta', 'WAR & CONFLICT TODAY · 1 OF 3 · 12 IN ALL'],
      ['title', 'Missile strike on Kramatorsk'],
      ['why', 'Critical, as its report tagged it'],
      ['line', 'Kramatorsk, Ukraine'],
      ['line', 'Reported 9 Oct 21:40Z'],
    ]);
    // Every line inside the panel, each below the one before.
    for (const l of lines) {
      expect(l.x).toBeGreaterThanOrEqual(box.x);
      expect(l.x + measure(l.text, l.fontPx)).toBeLessThanOrEqual(box.x + box.width);
      expect(l.y).toBeGreaterThanOrEqual(box.y);
      expect(l.y + l.fontPx).toBeLessThanOrEqual(box.y + box.height);
    }
    lines.slice(1).forEach((l, i) => expect(l.y).toBeGreaterThan(lines[i].y));
  });

  it('says only the playlist at the opening', () => {
    const { lines } = layoutTourCaption({
      width: 1280, height: 720, measure,
      caption: { playlist: 'War & Conflict today', progress: '', title: 'War & Conflict today', why: 'The worst 3 of 12, worst first, by region', lines: [] },
    });
    expect(lines.map((l) => l.tone)).toEqual(['meta', 'title', 'why']);
    expect(lines[0].text).toBe('WAR & CONFLICT TODAY');
  });

  it('gives a long title two lines at most, the second cut to fit', () => {
    const { box, lines } = layoutTourCaption({ width: 1280, height: 720, measure, caption: { ...STOP, title: 'A very long headline '.repeat(12).trim() } });
    const title = lines.filter((l) => l.tone === 'title');
    expect(title).toHaveLength(2);
    expect(title[1].text.endsWith('…')).toBe(true);
    for (const l of title) expect(l.x + measure(l.text, l.fontPx)).toBeLessThanOrEqual(box.x + box.width);
  });

  it('keeps the panel to the foot of the frame, cutting item lines and saying where the rest are', () => {
    const many = { ...STOP, lines: Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of what the item says`) };
    const { box, lines } = layoutTourCaption({ width: 1280, height: 720, caption: many, measure });
    expect(box.height).toBeLessThanOrEqual(720 * 0.38);
    const shown = lines.filter((l) => l.tone === 'line');
    expect(shown.length).toBeLessThan(30);
    expect(shown[shown.length - 1].text).toMatch(/^\+\d+ more in the clip's record$/);
    const cut = Number(shown[shown.length - 1].text.match(/\d+/)![0]);
    expect(shown.length - 1 + cut).toBe(30);
  });

  it('is sized to the frame\'s height, as the end card is', () => {
    const small = layoutTourCaption({ width: 1280, height: 720, caption: STOP, measure });
    const large = layoutTourCaption({ width: 1920, height: 1080, caption: STOP, measure });
    expect(large.lines[1].fontPx / small.lines[1].fontPx).toBeCloseTo(1.5, 1);
    expect(large.box.width / small.box.width).toBeCloseTo(1.5, 1);
  });
});

// A field mission's safety limits are never shown cut (HW7, HW12); in a clip, the owner's choice (HW13):
// the panel widens toward the frame's edges, then grows, and only the other lines are cut, from the end.
describe('lines a clip never cuts', () => {
  const LIMITS = 'Safety limits: Work in pairs. Never confront anyone, enter private property or take anyone\'s personal details. '
    + 'Ask before you photograph anyone, and never post faces or the places people sleep. Follow official responders. '
    + 'Look after yourself first. If someone is unresponsive, call 911 first, then give naloxone and stay with them. '
    + 'Naloxone does no harm to someone who hasn\'t taken opioids.';
  const MISSION: TourCaption = {
    playlist: 'Hero Watch this week', progress: '5 of 7 · 13 in all',
    title: 'Carry naloxone in New Mexico: overdose deaths up 28.1% in a year', why: 'A field mission, open to 9 Nov 2026',
    lines: [
      'Field mission · open · posted by an AI agent',
      'New Mexico, the whole state · open to 9 Nov 2026 · 4 asks, 75 minutes in all',
      LIMITS,
      'A signed Nostr event from The Record; its signature was checked on intake',
    ],
    neverCut: [2],
  };
  const said = (lines: Array<{ tone: string; text: string }>) => lines.filter((l) => l.tone === 'line').map((l) => l.text).join(' ');

  it('widens the panel in a landscape frame, so every line is shown and the panel keeps to the foot of the frame', () => {
    const { box, lines } = layoutTourCaption({ width: 1280, height: 720, caption: MISSION, measure });
    expect(said(lines)).toBe(MISSION.lines.join(' '));
    expect(box.width).toBeGreaterThan(720 * 0.8);
    expect(box.x).toBeGreaterThan(0);
    expect(box.x + box.width / 2).toBeCloseTo(640, 0);
    expect(box.height).toBeLessThanOrEqual(720 * 0.38);
    for (const l of lines) expect(l.x + measure(l.text, l.fontPx)).toBeLessThanOrEqual(box.x + box.width);
  });

  it('is no wider than it needs: a stop whose lines fit keeps the screen\'s width', () => {
    const short = layoutTourCaption({ width: 1280, height: 720, measure, caption: { ...MISSION, lines: ['New Mexico', 'Safety limits: Work in pairs.'], neverCut: [1] } });
    expect(short.box.width).toBe(Math.round(720 * 0.8));
  });

  it('grows where it cannot widen, cutting the other lines from the end and never the limits', () => {
    const { box, lines } = layoutTourCaption({ width: 1080, height: 1920, caption: MISSION, measure });
    expect(said(lines)).toContain(LIMITS);
    expect(box.height).toBeGreaterThan(1920 * 0.38);
    expect(box.y).toBeGreaterThan(0);
    const last = lines.filter((l) => l.tone === 'line').at(-1)!.text;
    expect(last).toMatch(/^\+\d+ more in the clip's record$/);
    // The signature line goes first.
    expect(said(lines)).not.toContain('A signed Nostr event');
  });

  it('cuts as before where no line is held whole', () => {
    const { box, lines } = layoutTourCaption({ width: 1280, height: 720, measure, caption: { ...MISSION, neverCut: undefined } });
    expect(box.width).toBe(Math.round(720 * 0.8));
    expect(said(lines)).not.toContain(LIMITS);
  });

  it('refuses a frame that cannot hold them whole, rather than cut them', () => {
    expect(() => layoutTourCaption({ width: 320, height: 180, measure, caption: { ...MISSION, lines: [LIMITS.repeat(20)], neverCut: [0] } }))
      .toThrow('The caption at "Carry naloxone in New Mexico: overdose deaths up 28.1% in a year" holds a field mission\'s safety limits, which a clip never cuts, and they do not fit whole in a 320×180 frame.');
  });
});

describe('drawing it', () => {
  it('fills the panel, then writes each line where the layout put it', () => {
    const layout = layoutTourCaption({ width: 1280, height: 720, caption: STOP, measure });
    const calls: string[] = [];
    const ctx = {
      fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, textBaseline: 'alphabetic',
      fillRect: vi.fn(() => calls.push('panel')),
      strokeRect: vi.fn(() => calls.push('border')),
      fillText: vi.fn((text: string) => calls.push(text)),
    };
    drawTourCaption(ctx as never, layout);
    expect(calls).toEqual(['panel', 'border', ...layout.lines.map((l) => l.text)]);
    expect(ctx.fillText).toHaveBeenCalledWith('Missile strike on Kramatorsk', layout.lines[1].x, layout.lines[1].y);
  });
});
