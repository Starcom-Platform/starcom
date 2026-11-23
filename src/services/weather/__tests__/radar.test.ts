/**
 * Radar from RainViewer's tiles, read back to rain (decision D-W, WX4): a
 * pixel's exact colour in RainViewer's published Universal Blue table gives
 * its reflectivity (dBZ) and whether it is snow; reflectivity gives a rate by
 * the standard Z–R relations; the coverage tiles say where radar reaches.
 * The fixtures are real tiles of 2026-10-06.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { echoOfColour, rainRateOfEcho, emptyMosaic, addRadarTile, addCoverageTile, radarAt } from '../rainviewer/radar';
import table from '../rainviewer/universalBlue.json';

const DIR = 'src/services/weather/__fixtures__/rainviewer';
const decode = (f: string) => { const p = PNG.sync.read(readFileSync(`${DIR}/${f}`)); return { width: p.width, height: p.height, data: new Uint8Array(p.data) }; };
const hex = (r: number, g: number, b: number, a: number) => `#${[r, g, b, a].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** The centre of a pixel of a zoom-2 tile, as latitude and longitude (Web Mercator). */
function placeOf(tx: number, ty: number, x: number, y: number) {
  const X = (tx * 256 + x + 0.5) / 1024, Y = (ty * 256 + y + 0.5) / 1024;
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 180) / Math.PI, lng: X * 360 - 180 };
}

describe('echoOfColour', () => {
  it('reads every colour of the published table back to its dBZ, rain and snow apart', () => {
    expect(echoOfColour(0xce, 0xc0, 0x87, 0x96)).toEqual({ dbz: 10, snow: false });
    expect(echoOfColour(0x55, 0x95, 0xff, 0xff)).toEqual({ dbz: 28, snow: true });
    expect(echoOfColour(0, 0, 0, 0)).toBeNull();
    // A colour the table does not hold is no echo, never a guess.
    expect(echoOfColour(1, 2, 3, 255)).toBeNull();
  });

  it('reads every coloured pixel of a real tile, but for a few pinks the table does not hold', () => {
    for (const f of ['radar-z2-1-1.png', 'radar-z2-0-1.png']) {
      const tile = decode(f);
      let coloured = 0, read = 0;
      const unread: string[] = [];
      for (let k = 0; k < tile.width * tile.height; k++) {
        const [r, g, b, a] = tile.data.subarray(k * 4, k * 4 + 4);
        if (a === 0) continue;
        coloured++;
        if (echoOfColour(r, g, b, a)) read++; else unread.push(hex(r, g, b, a));
      }
      expect(coloured, f).toBeGreaterThan(1000);
      expect(read + unread.length).toBe(coloured);
      // Mixed precipitation, it seems: pinks RainViewer draws and does not publish. A handful a tile.
      expect(unread.length, f).toBeLessThanOrEqual(5);
      for (const c of unread) expect(c, f).toMatch(/^#ff[0-9a-f]{6}$/);
    }
  });

  it('gives a colour the table repeats its lowest dBZ', () => {
    const firstWhite = table.rain.indexOf('#ffffffff');
    expect(echoOfColour(255, 255, 255, 255)).toEqual({ dbz: table.firstDbz + firstWhite, snow: false });
  });
});

describe('rainRateOfEcho', () => {
  it('turns reflectivity into a rate: Marshall–Palmer for rain, Z = 2000R² for snow', () => {
    expect(rainRateOfEcho({ dbz: 20, snow: false })).toBeCloseTo(0.648, 3);
    expect(rainRateOfEcho({ dbz: 40, snow: false })).toBeCloseTo(11.53, 2);
    expect(rainRateOfEcho({ dbz: 20, snow: true })).toBeCloseTo(0.2236, 4);
  });
});

describe('the radar mosaic', () => {
  const mosaic = () => {
    const m = emptyMosaic(2);
    addRadarTile(m, 1, 1, decode('radar-z2-1-1.png'));
    addCoverageTile(m, 1, 1, decode('coverage-z2-1-1.png'));
    return m;
  };

  it('says where radar reaches: the US east coast does, the open Atlantic does not', () => {
    const m = mosaic();
    expect(radarAt(m, 40, -75)?.covered).toBe(true);
    expect(radarAt(m, 30, -40)?.covered).toBe(false);
    // Outside every tile loaded: nothing is known, so nothing is said.
    expect(radarAt(m, -30, 120)).toBeNull();
  });

  it('gives each covered place the rate its pixel\'s echo means', () => {
    const tile = decode('radar-z2-1-1.png');
    const m = mosaic();
    let checked = 0;
    for (let y = 0; y < 256 && checked < 25; y += 3) for (let x = 0; x < 256 && checked < 25; x += 3) {
      const [r, g, b, a] = tile.data.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4);
      if (a === 0) continue;
      const { lat, lng } = placeOf(1, 1, x, y);
      const echo = echoOfColour(r, g, b, a)!;
      const got = radarAt(m, lat, lng)!;
      expect(got.rate, `${hex(r, g, b, a)} at ${lat.toFixed(2)}, ${lng.toFixed(2)}`).toBeCloseTo(rainRateOfEcho(echo), 6);
      expect(got.snow).toBe(echo.snow);
      checked++;
    }
    expect(checked).toBe(25);
  });

  it('leaves a pixel in a colour it cannot read to the model, rather than call it dry', () => {
    const tile = decode('radar-z2-1-1.png');
    const m = mosaic();
    let found = false;
    for (let k = 0; k < 256 * 256 && !found; k++) {
      const [r, g, b, a] = tile.data.subarray(k * 4, k * 4 + 4);
      if (a === 0 || echoOfColour(r, g, b, a)) continue;
      const { lat, lng } = placeOf(1, 1, k % 256, Math.floor(k / 256));
      expect(radarAt(m, lat, lng)).toEqual({ covered: false, rate: 0, snow: false });
      found = true;
    }
    expect(found).toBe(true);
  });

  it('reads no rain, not an unknown, where radar reaches and sees nothing', () => {
    const tile = decode('radar-z2-1-1.png');
    const m = mosaic();
    // Philadelphia's pixel is clear on this frame.
    const { lat, lng } = { lat: 40, lng: -75 };
    const X = Math.floor((lng + 180) / 360 * 1024) - 256;
    const s = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const Y = Math.floor((1 - s / Math.PI) / 2 * 1024) - 256;
    expect(tile.data[(Y * 256 + X) * 4 + 3]).toBe(0);
    expect(radarAt(m, lat, lng)).toEqual({ covered: true, rate: 0, snow: false });
  });
});
