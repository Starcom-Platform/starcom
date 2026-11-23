/**
 * NOAA's ENLIL forecast read off its frames (space-weather-visualization.md, SW9, SW18): the frame
 * list's moments, the frames for a moment, and a disc's values read back through its colour bar, on a
 * frame made here so its values are known.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENLIL_DISC_AU, ENLIL_PANELS, framePair, framePixels, parseEnlilList, readFrame, readPanel, type Pixels } from '../enlil';

describe('the frame list', () => {
  it('times each frame from its file\'s name, oldest first, as full addresses', () => {
    const frames = parseEnlilList([
      { url: '/images/animations/enlil/enlil_com2_58554_20261011T060000.jpg' },
      { url: '/images/animations/enlil/enlil_com2_58554_20261007T180000.jpg' },
      { url: '/images/elsewhere/not-a-frame.txt' },
    ]);
    expect(frames.map((f) => new Date(f.at).toISOString())).toEqual(['2026-10-07T18:00:00.000Z', '2026-10-11T06:00:00.000Z']);
    expect(frames[0].url).toBe('https://services.swpc.noaa.gov/images/animations/enlil/enlil_com2_58554_20261007T180000.jpg');
  });

  const hourly = [0, 1, 2].map((h) => ({ at: Date.UTC(2026, 9, 10, h), url: `f${h}` }));

  it('gives the two frames round a moment and its weight between them, as the timeline moves', () => {
    const pair = framePair(hourly, Date.UTC(2026, 9, 10, 1, 15))!;
    expect([pair.before.url, pair.after.url]).toEqual(['f1', 'f2']);
    expect(pair.mix).toBeCloseTo(0.25, 9);
    const on = framePair(hourly, Date.UTC(2026, 9, 10, 1))!;
    expect([on.before.url, on.mix]).toEqual(['f1', 0]);
  });

  it('holds the run\'s end frames for half an hour past them, and gives none outside the run', () => {
    expect(framePair(hourly, Date.UTC(2026, 9, 10, 2, 20))).toEqual({ before: hourly[2], after: hourly[2], mix: 0 });
    expect(framePair(hourly, Date.UTC(2026, 9, 9, 23, 40))).toEqual({ before: hourly[0], after: hourly[0], mix: 0 });
    expect(framePair(hourly, Date.UTC(2026, 9, 10, 2, 40))).toBeNull();
    expect(framePair(hourly, Date.UTC(2026, 9, 9, 23, 20))).toBeNull();
    expect(framePair([], Date.UTC(2026, 9, 10, 1))).toBeNull();
  });

  it('blends no frames across a gap in the run: the nearer within half an hour, or none', () => {
    const gappy = [{ at: Date.UTC(2026, 9, 10, 0), url: 'f0' }, { at: Date.UTC(2026, 9, 10, 6), url: 'f6' }];
    expect(framePair(gappy, Date.UTC(2026, 9, 10, 0, 20))).toEqual({ before: gappy[0], after: gappy[0], mix: 0 });
    expect(framePair(gappy, Date.UTC(2026, 9, 10, 5, 50))).toEqual({ before: gappy[1], after: gappy[1], mix: 0 });
    expect(framePair(gappy, Date.UTC(2026, 9, 10, 3))).toBeNull();
  });
});

/** A frame: a colour bar of distinct colours, and the density disc painted from it with a known field, a dark ring through it, and markers. */
function frame(valueAt: (xAu: number, yAu: number) => number, markers = true): Pixels {
  const width = 960, height = 600;
  const data = new Uint8ClampedArray(width * height * 4);
  const { bar, cx, cy, r } = ENLIL_PANELS.density;
  const colour = (row: number) => [(row * 7) % 256, (row * 13 + 40) % 256, (row * 29 + 90) % 256];
  const set = (x: number, y: number, c: number[]) => { const k = (y * width + x) * 4; data.set([c[0], c[1], c[2], 255], k); };
  for (let y = bar.top; y <= bar.bottom; y++) set(bar.x, y, colour(y));
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const u = (x - cx) / r, v = (cy - y) / r;
      if (u * u + v * v > 1) continue;
      const rr = Math.hypot(u, v) * ENLIL_DISC_AU;
      const value = valueAt(u * ENLIL_DISC_AU, v * ENLIL_DISC_AU);
      const row = Math.round(bar.top + ((bar.high - value) / (bar.high - bar.low)) * (bar.bottom - bar.top));
      // The 1 AU circle, as SWPC draws it: what it crosses darkened, which on the bar reads as lower values.
      set(x, y, colour(Math.abs(rr - 1) < 0.015 ? Math.min(row + 40, bar.bottom) : row));
    }
  }
  if (markers) {
    // The markers SWPC draws, each a filled dot in a dark ring: the Sun, the Earth, STEREO-A ahead.
    const au = r / ENLIL_DISC_AU;
    const dot = (mx: number, my: number, fill: number[]) => {
      for (let y = Math.round(my) - 6; y <= Math.round(my) + 6; y++) for (let x = Math.round(mx) - 6; x <= Math.round(mx) + 6; x++) {
        const d = Math.hypot(x - mx, y - my);
        // The ring in the bar's top colour: SWPC's density bar runs up to near black.
        if (d <= 4) set(x, y, fill); else if (d <= 5.5) set(x, y, colour(bar.top));
      }
    };
    // Their fills are colours on the bar, as the Earth's green is on SWPC's; read, they would be values.
    dot(cx, cy, colour(bar.top));
    dot(cx + au, cy, colour(bar.top + 20));
    dot(cx + au * Math.cos(1.2), cy - au * Math.sin(1.2), [240, 105, 95]);
    // Salmon-like strays, as JPEG leaves round the Earth's marker, one above STEREO-A, and a thin arc: no
    // marker of their own.
    for (const [dx, dy] of [[-4, -33], [2, -14], [5, 1], [3, 3], [4, 4]]) set(Math.round(cx + au + dx), Math.round(cy + dy), [235, 110, 100]);
    set(Math.round(cx + au * Math.cos(1.45)), Math.round(cy - au * Math.sin(1.45)), [235, 110, 100]);
    for (let k = -30; k <= 30; k++) {
      const a = -0.6 + k * 0.004;
      set(Math.round(cx + au * 1.02 * Math.cos(a)), Math.round(cy - au * 1.02 * Math.sin(a)), [235, 110, 100]);
    }
    // JPEG noise: a blot of a colour off the bar, whose nearest colour on it is a value far from the field's.
    const [nx, ny] = [cx - 0.5 * au, cy + 0.5 * au];
    const want = valueAt(-0.5, -0.5);
    const rows = Array.from({ length: bar.bottom - bar.top + 1 }, (_, k) => bar.top + k);
    const nearest = (c: number[]) => {
      let best = Infinity, row = bar.top;
      for (const y of rows) {
        const e = colour(y), d = Math.hypot(e[0] - c[0], e[1] - c[1], e[2] - c[2]);
        if (d < best) { best = d; row = y; }
      }
      return { d: best, value: bar.high - ((bar.high - bar.low) * (row - bar.top)) / (bar.bottom - bar.top) };
    };
    let noise: number[] | null = null;
    for (let k = 0; k < 4096 && !noise; k++) {
      const c = [(k >> 8) * 16, ((k >> 4) & 15) * 16, (k & 15) * 16], n = nearest(c);
      if (n.d > 52 && Math.abs(n.value - want) > 15) noise = c;
    }
    for (let y = Math.round(ny) - 2; y <= Math.round(ny) + 2; y++) for (let x = Math.round(nx) - 2; x <= Math.round(nx) + 2; x++) set(x, y, noise!);
  }
  return { width, height, data };
}

describe('reading a disc', () => {
  const field = (x: number, y: number) => 30 + 15 * (x / ENLIL_DISC_AU) - 5 * (y / ENLIL_DISC_AU);
  const size = 64;
  const grid = readPanel(frame(field), ENLIL_PANELS.density, size);
  const cell = (xAu: number, yAu: number) => {
    const i = Math.round(((xAu / ENLIL_DISC_AU + 1) / 2) * (size - 1)), j = Math.round(((yAu / ENLIL_DISC_AU + 1) / 2) * (size - 1));
    return grid[j * size + i];
  };
  const step = (ENLIL_PANELS.density.bar.high - ENLIL_PANELS.density.bar.low) / (ENLIL_PANELS.density.bar.bottom - ENLIL_PANELS.density.bar.top);

  it('gives each place the value of its colour on the bar: x toward the Earth, y ahead of it', () => {
    for (const [x, y] of [[0.5, 0], [-1.2, 0.3], [0, -0.8], [1.3, 0.6]]) expect(Math.abs(cell(x, y) - field(x, y))).toBeLessThan(2.5 * step);
    expect(cell(1.3, 0)).toBeGreaterThan(cell(-1.3, 0));
    expect(cell(0, -1.3)).toBeGreaterThan(cell(0, 1.3));
  });

  it('fills the drawn 1 AU circle from its neighbours', () => {
    for (const a of [0, 1, 2, 3, 4, 5]) {
      const x = Math.cos(a), y = Math.sin(a);
      expect(Math.abs(cell(x, y) - field(x, y))).toBeLessThan(4 * step);
    }
  });

  it('reads no colour off the bar as a value: JPEG\'s noise is filled from round it', () => {
    expect(Math.abs(cell(-0.5, -0.5) - field(-0.5, -0.5))).toBeLessThan(4 * step);
  });

  it('reads no marker as a value: the Sun, the Earth and STEREO-A are filled from round them', () => {
    expect(Math.abs(cell(0, 0) - field(0, 0))).toBeLessThan(4 * step);
    for (const x of [0.95, 1, 1.05]) expect(Math.abs(cell(x, 0) - field(x, 0))).toBeLessThan(4 * step);
    expect(Math.abs(cell(Math.cos(1.2), Math.sin(1.2)) - field(Math.cos(1.2), Math.sin(1.2)))).toBeLessThan(4 * step);
  });

  it('is nothing outside the disc', () => {
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const u = (i / (size - 1)) * 2 - 1, v = (j / (size - 1)) * 2 - 1;
        if (u * u + v * v > 1) expect(Number.isNaN(grid[j * size + i])).toBe(true);
        if (u * u + v * v < 0.95) expect(Number.isFinite(grid[j * size + i])).toBe(true);
      }
    }
  });
});

describe('reading a frame', () => {
  it('reads both discs at once, each through its own bar', () => {
    const image = frame((x, y) => 30 + 15 * (x / ENLIL_DISC_AU) - 5 * (y / ENLIL_DISC_AU));
    const grids = readFrame(image, 32);
    expect(grids.size).toBe(32);
    expect(Array.from(grids.density)).toEqual(Array.from(readPanel(image, ENLIL_PANELS.density, 32)));
    expect(Array.from(grids.velocity)).toEqual(Array.from(readPanel(image, ENLIL_PANELS.velocity, 32)));
  });

  it('refuses a frame not laid out as its discs were measured on, rather than read the wrong places', () => {
    expect(() => readFrame({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, 32)).toThrow(/was 0 × 0, not the 960 × 600/);
    expect(() => readFrame({ width: 1920, height: 1200, data: new Uint8ClampedArray(1920 * 1200 * 4) }, 32)).toThrow(/was 1920 × 1200/);
  });
});

describe('a frame\'s pixels, in a browser', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('are read at the frame\'s own size, though a closed bitmap\'s size reads 0', async () => {
    const bitmap = { width: 960, height: 600, close() { this.width = 0; this.height = 0; } };
    let asked: number[] = [];
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { drawImage: () => undefined, getImageData: (_x: number, _y: number, w: number, h: number) => { asked = [w, h]; return { data: new Uint8ClampedArray(w * h * 4) }; } };
      }
    });
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob() }) as unknown as Response);
    const pixels = await framePixels('https://services.swpc.noaa.gov/f.jpg', fetchImpl);
    expect([pixels.width, pixels.height, pixels.data.length]).toEqual([960, 600, 960 * 600 * 4]);
    expect(asked).toEqual([960, 600]);
  });
});
