/**
 * A PNG reader for RainViewer's radar tiles (decision D-W, WX4): 8-bit RGBA,
 * not interlaced, which is what every tile and coverage tile is (checked
 * 2026-10-06). Anything else is refused by name.
 *
 * Why not a canvas: a 2D canvas keeps colours premultiplied by their alpha,
 * so a half-transparent pixel comes back with its colour rounded, and a radar
 * pixel is read back to its intensity by its exact colour. The zlib stream
 * is inflated by the platform (DecompressionStream) and the rows unfiltered
 * here; the tests hold every byte to pngjs.
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** Row by row from the top, four bytes a pixel. */
  data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export async function decodePngRgba(png: Uint8Array): Promise<RgbaImage> {
  if (png.length < 8 || SIGNATURE.some((b, i) => png[i] !== b)) throw new Error('This is not a PNG.');
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0, height = 0;
  const idat: Uint8Array[] = [];
  let ended = false;
  for (let o = 8; o < png.length;) {
    if (o + 8 > png.length) break;
    const length = dv.getUint32(o);
    const type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7]);
    const data = o + 8;
    if (data + length + 4 > png.length) throw new Error(`The PNG ends before its ${type} chunk does.`);
    if (type === 'IHDR') {
      width = dv.getUint32(data);
      height = dv.getUint32(data + 4);
      const depth = png[data + 8], colour = png[data + 9], interlace = png[data + 12];
      if (depth !== 8) throw new Error(`Bit depth ${depth} is not read; only 8 is.`);
      if (colour !== 6) throw new Error(`PNG colour type ${colour} is not read; only 6 (RGBA) is.`);
      if (interlace !== 0) throw new Error('Interlaced PNGs are not read.');
    } else if (type === 'IDAT') {
      idat.push(png.subarray(data, data + length));
    } else if (type === 'IEND') {
      ended = true;
      break;
    }
    o = data + length + 4;
  }
  if (!ended || !width || !height || !idat.length) throw new Error('The PNG ends before its image data does.');

  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of idat) { joined.set(c, at); at += c.length; }
  const inflated = new Uint8Array(await new Response(new Response(joined).body!.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());

  const stride = width * 4;
  if (inflated.length < (stride + 1) * height) throw new Error('The PNG\'s image data is shorter than its size says.');
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (stride + 1)];
    const src = y * (stride + 1) + 1, row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const raw = inflated[src + x];
      const a = x >= 4 ? out[row + x - 4] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= 4 && y > 0 ? out[prev + x - 4] : 0;
      let value: number;
      switch (filter) {
        case 0: value = raw; break;
        case 1: value = raw + a; break;
        case 2: value = raw + b; break;
        case 3: value = raw + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          value = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Row ${y} has filter ${filter}, which PNG does not define.`);
      }
      out[row + x] = value & 0xff;
    }
  }
  return { width, height, data: out };
}
