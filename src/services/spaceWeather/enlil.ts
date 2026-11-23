/**
 * NOAA's WSA-ENLIL forecast, read off its published frames (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW6, SW9, SW18).
 *
 * SWPC publishes the model run as an animation: a list of frames
 * (`products/animations/enlil.json`), an hour apart from about two days before the run to about five
 * after, each a 960 × 600 picture. Its two discs on the left are the ecliptic seen from the north, the
 * Sun at the centre, the Earth on +x at 1 AU, STEREO-A ahead of it, out to the model's edge at 1.7 AU:
 * the plasma's density (scaled by r², per cm³, 0 to 60) above, its radial speed (km/s, 200 to 1600)
 * below, each with its colour bar beside it.
 *
 * The values are read back through each frame's own colour bar: each pixel of a disc is given the
 * value of the nearest colour on the bar. The picture's annotations are left as holes and filled from
 * their neighbours: the markers of the Sun and the Earth (at known places), STEREO-A's (found by its
 * salmon fill near 1 AU), the 1 AU circle, and any colour the bar does not hold (JPEG
 * noise). The bar's top end is near black, so black annotations would otherwise read as its highest
 * values. What is drawn is ENLIL's values redrawn, not a measurement.
 */

export const ENLIL_LIST_URL = 'https://services.swpc.noaa.gov/products/animations/enlil.json';
const SWPC = 'https://services.swpc.noaa.gov';

/** The model's outer edge, AU: the discs' radius. */
export const ENLIL_DISC_AU = 1.7;

export interface EnlilPanel {
  /** The disc's centre (the Sun) and radius, pixels. */
  cx: number;
  cy: number;
  r: number;
  /** The colour bar: the column sampled, its top and bottom rows, and the values at its bottom and top. */
  bar: { x: number; top: number; bottom: number; low: number; high: number };
}

/** Where the two discs and their colour bars are on a frame, measured from SWPC's frames of October 2026. */
export const ENLIL_PANELS: Record<'density' | 'velocity', EnlilPanel> = {
  density: { cx: 201.4, cy: 183.5, r: 124.8, bar: { x: 35, top: 103, bottom: 264, low: 0, high: 60 } },
  velocity: { cx: 201.2, cy: 447.4, r: 124.7, bar: { x: 35, top: 367, bottom: 528, low: 200, high: 1600 } },
};

export interface EnlilFrame { at: number; url: string }

/** The frame list, each with its moment from its file's name, oldest first. */
export function parseEnlilList(data: unknown): EnlilFrame[] {
  if (!Array.isArray(data)) return [];
  const frames: EnlilFrame[] = [];
  for (const row of data as Array<{ url?: unknown }>) {
    const url = typeof row?.url === 'string' ? row.url : null;
    const m = url?.match(/_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(jpg|png)$/);
    if (!url || !m) continue;
    frames.push({ at: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), url: url.startsWith('http') ? url : `${SWPC}${url}` });
  }
  return frames.sort((a, b) => a.at - b.at);
}

const HALF_HOUR = 30 * 60_000;
/** Frames further apart than this are a gap in the run, not blended across. */
const MAX_BLEND_GAP = 2 * 3_600_000;

export interface FramePair {
  before: EnlilFrame;
  after: EnlilFrame;
  /** The moment's weight on `after`, 0 to 1. */
  mix: number;
}

/**
 * The two frames round a moment and its weight between them, so the disc moves smoothly as the
 * timeline does. At the run's ends, and across a gap in it, the nearer frame alone if within half an
 * hour; none outside the run.
 */
export function framePair(frames: readonly EnlilFrame[], at: number): FramePair | null {
  if (!frames.length) return null;
  const alone = (f: EnlilFrame) => (Math.abs(f.at - at) <= HALF_HOUR ? { before: f, after: f, mix: 0 } : null);
  if (at <= frames[0].at) return alone(frames[0]);
  const last = frames[frames.length - 1];
  if (at >= last.at) return alone(last);
  let k = 0;
  while (frames[k + 1].at <= at) k++;
  const [before, after] = [frames[k], frames[k + 1]];
  if (at === before.at) return { before, after: before, mix: 0 };
  if (after.at - before.at > MAX_BLEND_GAP) return alone(at - before.at < after.at - at ? before : after);
  return { before, after, mix: (at - before.at) / (after.at - before.at) };
}

export interface Pixels { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

/** Colours further than this from every colour on the bar are not values (annotations, noise). */
const MAX_COLOUR_DISTANCE = 48;
/** How far round a marker's centre is left as a hole, pixels. */
const MARKER_PX = 8.5;

/** STEREO-A's marker: a salmon fill, unlike any colour on the bars. */
const isSalmon = (c: number[]) => c[0] > 185 && c[1] > 80 && c[1] < 145 && c[2] > 70 && c[2] < 150;

/** The places on a frame's disc that are annotation, not value: a test for each pixel. */
export function annotationMask(image: Pixels, panel: EnlilPanel): (x: number, y: number) => boolean {
  const au = panel.r / ENLIL_DISC_AU;
  const pixel = (x: number, y: number) => {
    const k = (Math.round(y) * image.width + Math.round(x)) * 4;
    return [image.data[k], image.data[k + 1], image.data[k + 2]];
  };
  // STEREO-A: the densest clump of salmon pixels near 1 AU, its middle. A few stray pixels of like
  // colour (JPEG fringes round the Earth's marker, a CME's arc) are scattered or thin, never a filled dot.
  const salmon: Array<[number, number]> = [];
  for (let y = Math.floor(panel.cy - 1.15 * au); y <= panel.cy + 1.15 * au; y++) {
    for (let x = Math.floor(panel.cx - 1.15 * au); x <= panel.cx + 1.15 * au; x++) {
      const d = Math.hypot(x - panel.cx, y - panel.cy) / au;
      if (d >= 0.85 && d <= 1.15 && isSalmon(pixel(x, y))) salmon.push([x, y]);
    }
  }
  const near = (p: [number, number], r: number) => salmon.filter(([x, y]) => Math.hypot(x - p[0], y - p[1]) <= r);
  let seed: [number, number] | null = null, most = 0;
  for (const p of salmon) {
    const n = near(p, 3).length;
    if (n > most) { most = n; seed = p; }
  }
  const markers: Array<[number, number]> = [[panel.cx, panel.cy], [panel.cx + au, panel.cy]];
  // A filled dot 4 px across holds about 29 pixels within 3 px of its middle; a 1 px line, 7.
  if (seed && most >= 12) {
    const clump = near(seed, MARKER_PX);
    markers.push([clump.reduce((s, [x]) => s + x, 0) / clump.length, clump.reduce((s, [, y]) => s + y, 0) / clump.length]);
  }
  return (x, y) => {
    if (markers.some(([mx, my]) => Math.hypot(x - mx, y - my) <= MARKER_PX)) return true;
    // The 1 AU circle, a pixel wide, darkens what it crosses rather than hiding it, and JPEG smears it
    // a pixel each side: all of it is left to be filled from both sides.
    return Math.abs(Math.hypot(x - panel.cx, y - panel.cy) - au) <= 1.5;
  };
}

/**
 * A disc's values on a square grid, `size` across: row 0 at -1.7 AU along y (behind the Earth in its
 * orbit), column 0 at -1.7 AU along x (away from the Earth), the Sun at the middle; NaN outside the
 * disc. Read through the frame's own colour bar; holes filled from their neighbours.
 */
export function readPanel(image: Pixels, panel: EnlilPanel, size = 128): Float32Array {
  const { bar } = panel;
  const at = (x: number, y: number) => {
    const k = (Math.round(y) * image.width + Math.round(x)) * 4;
    return [image.data[k], image.data[k + 1], image.data[k + 2]];
  };
  const lut: Array<{ c: number[]; v: number }> = [];
  for (let y = bar.top; y <= bar.bottom; y++) lut.push({ c: at(bar.x, y), v: bar.high - ((bar.high - bar.low) * (y - bar.top)) / (bar.bottom - bar.top) });
  const out = new Float32Array(size * size).fill(NaN);
  const inside = new Uint8Array(size * size);
  const annotation = annotationMask(image, panel);
  // A frame's colours repeat: each is looked up on the bar once.
  const known = new Map<number, number>();
  const valueOf = (c: number[]) => {
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    let value = known.get(key);
    if (value === undefined) {
      let best = Infinity;
      value = NaN;
      for (const e of lut) {
        const d = (e.c[0] - c[0]) ** 2 + (e.c[1] - c[1]) ** 2 + (e.c[2] - c[2]) ** 2;
        if (d < best) { best = d; value = e.v; }
      }
      if (best > MAX_COLOUR_DISTANCE ** 2) value = NaN;
      known.set(key, value);
    }
    return value;
  };
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = (i / (size - 1)) * 2 - 1, v = (j / (size - 1)) * 2 - 1;
      if (u * u + v * v > 0.98) continue;
      inside[j * size + i] = 1;
      const [px, py] = [panel.cx + u * panel.r, panel.cy - v * panel.r];
      if (annotation(px, py)) continue;
      out[j * size + i] = valueOf(at(px, py));
    }
  }
  // Fill the holes inside the disc from their read neighbours, a ring at a time.
  for (let pass = 0; pass < 6; pass++) {
    const next = out.slice();
    let left = 0;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const k = j * size + i;
        if (!inside[k] || Number.isFinite(out[k])) continue;
        let sum = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= size || jj >= size) continue;
          const w = out[jj * size + ii];
          if (Number.isFinite(w)) { sum += w; n++; }
        }
        if (n) next[k] = sum / n;
        else left++;
      }
    }
    out.set(next);
    if (!left) break;
  }
  return out;
}

/** Cells across a disc's grid: about a cell to each of the picture's pixels. */
export const ENLIL_GRID = 160;

export interface EnlilGrids {
  size: number;
  /** Per cm³, scaled by r²; and km/s. Laid out as readPanel's. */
  density: Float32Array;
  velocity: Float32Array;
}

/** The frames' size, which the panels' places were measured on. */
export const ENLIL_FRAME = { width: 960, height: 600 };

/** Both of a frame's discs, read; refused when the frame is not laid out as the panels were measured on. */
export function readFrame(image: Pixels, size = ENLIL_GRID): EnlilGrids {
  if (image.width !== ENLIL_FRAME.width || image.height !== ENLIL_FRAME.height) {
    throw new Error(`ENLIL's frame was ${image.width} × ${image.height}, not the ${ENLIL_FRAME.width} × ${ENLIL_FRAME.height} its discs were measured on`);
  }
  return { size, density: readPanel(image, ENLIL_PANELS.density, size), velocity: readPanel(image, ENLIL_PANELS.velocity, size) };
}

/** The frame list, read; throws why when it cannot be. */
export async function fetchEnlilList(fetchImpl: typeof fetch = fetch): Promise<EnlilFrame[]> {
  const res = await fetchImpl(ENLIL_LIST_URL);
  if (!res.ok) throw new Error(`NOAA answered ${res.status}`);
  const frames = parseEnlilList(await res.json());
  if (!frames.length) throw new Error('ENLIL listed no frames');
  return frames;
}

/** A frame's pixels, in a browser: fetched, decoded, drawn to a canvas, read back. */
export async function framePixels(url: string, fetchImpl: typeof fetch = fetch): Promise<Pixels> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`NOAA answered ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bitmap.width, bitmap.height) : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error('no canvas to read the frame on');
  const { width, height } = bitmap;
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, width, height);
  // Closed, a bitmap's size reads 0: taken before.
  bitmap.close();
  return { width, height, data };
}
