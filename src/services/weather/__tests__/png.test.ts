/**
 * The PNG reader for RainViewer's radar tiles (decision D-W, WX4). A canvas
 * would round the colours of half-transparent pixels as it premultiplies
 * them, and a radar pixel is read back to its intensity by its exact colour;
 * so the tiles are decoded here, byte for byte. The tests hold every byte to
 * pngjs, an independent decoder, on real tiles.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { decodePngRgba } from '../png';

const DIR = 'src/services/weather/__fixtures__/rainviewer';
const FILES = ['radar-z2-1-1.png', 'radar-z2-0-1.png', 'coverage-z2-1-1.png'];
const bytes = (f: string) => new Uint8Array(readFileSync(`${DIR}/${f}`));

/** The IHDR chunk's data starts at byte 16; its CRC is not checked by the reader, so a byte can be changed in place. */
const withIhdr = (src: Uint8Array, offset: number, value: number) => { const b = src.slice(); b[16 + offset] = value; return b; };

describe('decodePngRgba', () => {
  it.each(FILES)('reads %s exactly as pngjs does, every byte', async (f) => {
    const ours = await decodePngRgba(bytes(f));
    const theirs = PNG.sync.read(Buffer.from(bytes(f)));
    expect([ours.width, ours.height]).toEqual([theirs.width, theirs.height]);
    expect(ours.data.length).toBe(theirs.data.length);
    expect(Buffer.compare(Buffer.from(ours.data), theirs.data)).toBe(0);
  });

  it.each([0, 1, 2, 3, 4])('undoes row filter %i as PNG defines it', async (filterType) => {
    // Real tiles happen not to use every filter, so an image is made with each, by pngjs.
    const made = new PNG({ width: 37, height: 23 });
    for (let k = 0; k < made.data.length; k++) made.data[k] = (k * 97 + (k >> 3) * 31 + ((k * k) % 251)) & 0xff;
    const encoded = new Uint8Array(PNG.sync.write(made, { filterType }));
    const ours = await decodePngRgba(encoded);
    expect([ours.width, ours.height]).toEqual([37, 23]);
    expect(Buffer.compare(Buffer.from(ours.data), made.data)).toBe(0);
  });

  it('refuses what it does not read, rather than return wrong colours', async () => {
    const good = bytes('radar-z2-1-1.png');
    const notPng = good.slice(); notPng[1] = 0x51;
    await expect(decodePngRgba(notPng)).rejects.toThrow(/not a PNG/i);
    await expect(decodePngRgba(withIhdr(good, 9, 2))).rejects.toThrow(/colour type 2/);
    await expect(decodePngRgba(withIhdr(good, 8, 16))).rejects.toThrow(/bit depth 16/i);
    await expect(decodePngRgba(withIhdr(good, 12, 1))).rejects.toThrow(/interlaced/i);
    await expect(decodePngRgba(good.slice(0, 2000))).rejects.toThrow(/ends before its IDAT chunk does/);
  });
});
