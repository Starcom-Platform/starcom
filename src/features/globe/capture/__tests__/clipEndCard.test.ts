/**
 * The end card's layout. The load-bearing property first: every caveat reaches
 * the video, whole, or the card is refused. Nothing in between.
 */
import { describe, it, expect } from 'vitest';
import { layoutEndCard, endCardStyleFor, EndCardLayoutError } from '../clipEndCard';
import { buildClipProvenance, type ClipProvenance } from '../clipProvenance';

/** 0.5px per character per font pixel — predictable, not a font. */
const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;

const T0 = new Date('2026-09-11T12:00:00.000Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

const baseProvenance = (): ClipProvenance => buildClipProvenance(
  [0, 3].map((s) => ({
    at: at(s),
    camera: { lat: 10, lon: -40 + s * 28, altitude: 2.5 },
    layers: [{ label: 'Space Weather', active: true, implemented: true }],
    feeds: [{ name: 'NOAA', lastUpdated: at(s).toISOString() }],
    marks: null,
    build: { sha: 'c'.repeat(40), builtAt: T0.toISOString() },
  })),
  { startedAt: T0, endedAt: at(3) },
);

const withCaveats = (caveats: string[]): ClipProvenance => ({ ...baseProvenance(), caveats });

const layout = (caveats: string[], size = { width: 1400, height: 708 }) =>
  layoutEndCard({ ...size, provenance: withCaveats(caveats), fps: 30, measure });

/**
 * Enough caveats to force pagination at 1400x708 with this measurer. Twelve
 * fitted on one page, and the pagination tests ran against a single page until
 * their own `pages.length > 1` assertion caught it — so the count is chosen,
 * and asserted, rather than assumed.
 */
const MANY = 20;

const sentence = (n: number) => `Caveat ${n}: ${'this is a disclosure a viewer needs to read in full '.repeat(2).trim()}.`;

describe('every caveat reaches the video, whole', () => {
  it('fits a typical card on one page, with no page number in the heading', () => {
    const l = layout([sentence(1), sentence(2)]);
    expect(l.pages).toHaveLength(1);
    expect(l.pages[0].lines[0].text).not.toMatch(/of \d/);
  });

  /**
   * Reassemble the caveat text from the laid-out lines. If any caveat were
   * dropped, duplicated, or split across pages, this would not round-trip.
   */
  it('places each caveat exactly once, never split across pages', () => {
    const caveats = Array.from({ length: MANY }, (_, i) => sentence(i + 1));
    const l = layout(caveats);
    expect(l.pages.length).toBeGreaterThan(1);

    const perPage = l.pages.map((page) =>
      page.lines.filter((ln) => ln.kind === 'caveat').map((ln) => ln.text).join(' '));
    for (const c of caveats) {
      const pagesContaining = perPage.filter((text) => text.includes(c.split(':')[0] + ':'));
      expect(pagesContaining).toHaveLength(1);
      // And whole: every word of it is on that one page.
      expect(pagesContaining[0]).toContain(`· ${c}`);
    }
  });

  it('keeps every line inside the frame', () => {
    const l = layout(Array.from({ length: MANY }, (_, i) => sentence(i + 1)));
    const { padding } = endCardStyleFor(708);
    for (const page of l.pages) {
      for (const line of page.lines) expect(line.y).toBeLessThanOrEqual(708 - padding);
    }
  });
});

describe('pagination', () => {
  const l = () => layout(Array.from({ length: MANY }, (_, i) => sentence(i + 1)));

  it('puts the heading on every page, numbered, so any paused frame explains itself', () => {
    const pages = l().pages;
    pages.forEach((page, i) => {
      expect(page.lines[0].kind).toBe('heading');
      expect(page.lines[0].text).toContain(`${i + 1} of ${pages.length}`);
    });
  });

  it('puts the details on the first page only', () => {
    const pages = l().pages;
    expect(pages[0].lines.some((ln) => ln.kind === 'detail')).toBe(true);
    for (const page of pages.slice(1)) expect(page.lines.some((ln) => ln.kind === 'detail')).toBe(false);
  });

  it('states the camera path, the layers and the build on the card', () => {
    const details = layout([sentence(1)]).pages[0].lines.filter((ln) => ln.kind === 'detail').map((ln) => ln.text).join(' ');
    expect(details).toMatch(/10\.00°N 40\.00°W .*→.*10\.00°N 44\.00°E/);
    expect(details).toContain('Layers: Space Weather');
    expect(details).toContain('build cccccccc');
    expect(details).toContain('0:03 of footage at 30 fps');
  });
});

describe('refusals — rather than truncating', () => {
  it('refuses a caveat too long for an empty page', () => {
    const enormous = 'word '.repeat(2000).trim();
    expect(() => layout([enormous])).toThrow(/half a caveat can invert its meaning/);
  });

  it('refuses more pages than the limit, rather than dropping the rest', () => {
    const many = Array.from({ length: 60 }, (_, i) => sentence(i + 1));
    expect(() => layout(many)).toThrow(EndCardLayoutError);
    expect(() => layout(many)).toThrow(/the one that would be cut is the one a viewer most needs/);
  });
});

describe('reading time', () => {
  it('holds a page longer the more caveats it carries, up to a cap', () => {
    const one = layout([sentence(1)]).pages[0].holdMs;
    const three = layout([sentence(1), sentence(2), sentence(3)]).pages[0].holdMs;
    expect(three).toBeGreaterThan(one);
    const { maxHoldMs } = endCardStyleFor(708);
    for (const page of layout(Array.from({ length: MANY }, (_, i) => sentence(i + 1))).pages) {
      expect(page.holdMs).toBeLessThanOrEqual(maxHoldMs);
    }
  });

  it('scales type with the frame, so a taller clip does not get smaller text', () => {
    expect(endCardStyleFor(1080).bodyPx).toBeGreaterThan(endCardStyleFor(708).bodyPx);
  });
});

/*
 * The end card names the report the clip is about, as a still's card does
 * (decision D-F, section 18, item 5).
 */
describe('an end card\'s credits', () => {
  it('names the data\'s sources after the view details, as a still names them above its footer', () => {
    const provenance = { ...withCaveats(['A caveat.']), credits: ['NOAA GFS', 'TeleGeography, 2022 (CC BY-NC-SA 3.0)'] };
    const texts = layoutEndCard({ width: 1400, height: 708, provenance, fps: 30, measure }).pages[0].lines.map((l) => l.text);
    const data = texts.indexOf('Data: NOAA GFS · TeleGeography, 2022 (CC BY-NC-SA 3.0)');
    expect(data).toBeGreaterThan(texts.findIndex((t) => t.startsWith('Layers:')));
    expect(data).toBeLessThan(texts.findIndex((t) => t.startsWith('· A caveat')));
    expect(layoutEndCard({ width: 1400, height: 708, provenance: withCaveats(['A caveat.']), fps: 30, measure })
      .pages[0].lines.some((l) => l.text.startsWith('Data:'))).toBe(false);
  });

  it('names who made the imagery after the data, in the same paragraph (TX10), and alone when there is no data', () => {
    const both = { ...withCaveats(['A caveat.']), credits: ['NOAA GFS'], imagery: ['Solar System Scope (CC BY 4.0)', 'NASA'] };
    const texts = layoutEndCard({ width: 1400, height: 708, provenance: both, fps: 30, measure }).pages[0].lines.map((l) => l.text);
    expect(texts).toContain('Data: NOAA GFS. Imagery: Solar System Scope (CC BY 4.0) · NASA');
    const alone = { ...withCaveats(['A caveat.']), imagery: ['NASA'] };
    expect(layoutEndCard({ width: 1400, height: 708, provenance: alone, fps: 30, measure }).pages[0].lines.map((l) => l.text))
      .toContain('Imagery: NASA');
  });
});

describe('an end card for a clip with country names', () => {
  it('credits the names between the data and the imagery, as a still\'s card does', () => {
    const named = { ...withCaveats(['A caveat.']), credits: ['NOAA GFS'], imagery: ['NASA'], countryNames: true as const };
    const texts = layoutEndCard({ width: 1400, height: 708, provenance: named, fps: 30, measure }).pages[0].lines.map((l) => l.text);
    expect(texts).toContain('Data: NOAA GFS. Names: Natural Earth. Imagery: NASA');
    const plain = { ...withCaveats(['A caveat.']), credits: ['NOAA GFS'], imagery: ['NASA'] };
    expect(layoutEndCard({ width: 1400, height: 708, provenance: plain, fps: 30, measure }).pages[0].lines.map((l) => l.text))
      .toContain('Data: NOAA GFS. Imagery: NASA');
  });
});

describe('an end card for a clip featuring a report', () => {
  it('names the report and what is stated about it, before the view details', () => {
    const provenance = {
      ...withCaveats(['A caveat.']),
      featured: { id: 'evt1', title: 'Grant closes Friday', lines: ['not assessed · by npub1abc…wxyz'] },
    };
    const page = layoutEndCard({ width: 1400, height: 708, provenance, fps: 30, measure }).pages[0];
    const texts = page.lines.map((l) => l.text);
    const title = texts.indexOf('Grant closes Friday');
    expect(title).toBe(1);
    expect(page.lines[title].kind).toBe('featured');
    expect(texts).toContain('not assessed · by npub1abc…wxyz');
    expect(texts.findIndex((t) => t.startsWith('Layers:'))).toBeGreaterThan(title);
  });
});

// A briefing playlist as a clip (briefing-playlists.md, BP15, BP18): its end card names the tour as its subject.
describe('an end card for a clip touring a playlist', () => {
  it('names the playlist, how many stops of how many, and each stop with when it starts, before the view details', () => {
    const provenance = {
      ...withCaveats(['A caveat.']),
      tour: {
        playlist: 'war', title: 'War & Conflict today', shown: 2, total: 12, partial: false,
        opening: { why: 'The worst 2 of 12, worst first, by region', fromMs: 0, toMs: 3000 },
        stops: [
          { id: 'a', title: 'Missile strike on Kramatorsk', progress: '1 of 2 · 12 in all', why: 'Critical', lines: [], fromMs: 3000, toMs: 11_900 },
          { id: 'b', title: 'Shelling of El Fasher', progress: '2 of 2 · 12 in all', why: 'Deaths reported', lines: [], fromMs: 11_900, toMs: 20_800 },
        ],
      },
    };
    const page = layoutEndCard({ width: 1400, height: 708, provenance, fps: 30, measure }).pages[0];
    const texts = page.lines.map((l) => l.text);
    const title = texts.indexOf('War & Conflict today: a tour of the worst 2 of 12');
    expect(title).toBe(1);
    expect(page.lines[title].kind).toBe('featured');
    expect(texts).toContain('0:03 Missile strike on Kramatorsk');
    expect(texts).toContain('0:12 Shelling of El Fasher');
    expect(texts.findIndex((t) => t.startsWith('Layers:'))).toBeGreaterThan(texts.indexOf('0:12 Shelling of El Fasher'));
  });

  it('says a tour of every stop when it shows them all', () => {
    const provenance = {
      ...withCaveats(['A caveat.']),
      tour: {
        playlist: 'heat', title: 'Heat watch', shown: 1, total: 1, partial: false,
        opening: { why: '1 stop, worst first, by region', fromMs: 0, toMs: 3000 },
        stops: [{ id: 'h', title: 'HeatRisk Red in Phoenix', progress: '1 of 1', why: 'Red', lines: [], fromMs: 3000, toMs: 11_900 }],
      },
    };
    const texts = layoutEndCard({ width: 1400, height: 708, provenance, fps: 30, measure }).pages[0].lines.map((l) => l.text);
    expect(texts).toContain('Heat watch: a tour of its 1 stop');
  });

  it('does not call a Hero Watch tour the worst: it ranks no harm (HW13)', () => {
    const provenance = {
      ...withCaveats(['A caveat.']),
      tour: {
        playlist: 'heroes', title: 'Hero Watch this week', shown: 7, total: 13, partial: false,
        opening: { why: '7 of 13: relief, the largest first, then field missions, the soonest to close first', fromMs: 0, toMs: 3000 },
        stops: [{ id: 'e', title: 'Ethiopian Red Cross Society: Ethiopia Drought Response', progress: '1 of 7 · 13 in all', why: 'Relief', lines: [], fromMs: 3000, toMs: 14_300 }],
      },
    };
    const texts = layoutEndCard({ width: 1400, height: 708, provenance, fps: 30, measure }).pages[0].lines.map((l) => l.text);
    expect(texts).toContain('Hero Watch this week: a tour of 7 of 13');
  });
});
