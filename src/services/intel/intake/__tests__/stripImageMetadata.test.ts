import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripImageMetadata } from '../stripImageMetadata';

/** A JPEG APPn segment: FF, marker, 2-byte length, payload. */
const app = (n: number, payload: number[]) => {
  const len = payload.length + 2;
  return [0xff, 0xe0 + n, (len >> 8) & 0xff, len & 0xff, ...payload];
};
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/**
 * A minimal but structurally valid JPEG: SOI, segments, SOS, entropy data, EOI.
 * The entropy data is what must survive byte-identical.
 */
const ENTROPY = [0x01, 0x02, 0x03, 0xfe, 0x77, 0x00, 0x42];
const jpeg = (segments: number[][]) => new Uint8Array([
  0xff, 0xd8,
  ...segments.flat(),
  // A real DQT-shaped segment, to prove non-metadata segments are preserved.
  0xff, 0xdb, 0x00, 0x05, 0x00, 0x11, 0x22,
  0xff, 0xda, 0x00, 0x04, 0x01, 0x00,
  ...ENTROPY,
  0xff, 0xd9,
]);

/** GPS coordinates as a phone would embed them, inside an EXIF APP1. */
const EXIF_WITH_GPS = app(1, [
  ...ascii('Exif'), 0x00, 0x00,
  ...ascii('II'), 0x2a, 0x00,
  ...ascii('GPSLatitude 51.5074 GPSLongitude -0.1278'),
  ...ascii('Canon EOS SERIAL#1234567'),
]);

const chunk = (type: string, data: number[]) => {
  const len = data.length;
  return [(len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
    ...ascii(type), ...data, 0, 0, 0, 0];
};
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (chunks: number[][]) => new Uint8Array([...PNG_SIG, ...chunks.flat()]);

/**
 * Chunked, because spreading a 100KB Uint8Array into String.fromCharCode
 * overflows the call stack — which is how the real-file test first failed.
 */
const bytesToString = (b: Uint8Array) => {
  let out = '';
  for (let i = 0; i < b.length; i += 8192) {
    out += String.fromCharCode(...b.subarray(i, i + 8192));
  }
  return out;
};

describe('JPEG metadata stripping', () => {
  it('removes an EXIF block containing GPS coordinates', () => {
    const r = stripImageMetadata(jpeg([EXIF_WITH_GPS]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(bytesToString(r.bytes)).not.toContain('GPSLatitude');
    expect(bytesToString(r.bytes)).not.toContain('51.5074');
    expect(r.removed).toContain('APP1');
  });

  it('removes the device identifier too, not just the coordinates', () => {
    const r = stripImageMetadata(jpeg([EXIF_WITH_GPS]));
    expect(r.ok && bytesToString(r.bytes)).not.toContain('SERIAL#1234567');
  });

  it('leaves the entropy-coded image data byte-identical', () => {
    // The whole reason this strips segments instead of re-encoding: an
    // evidence pipeline that launders every submission into a re-encoded copy
    // is protecting the source by destroying the evidence.
    const r = stripImageMetadata(jpeg([EXIF_WITH_GPS]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = [...r.bytes];
    const sosAt = out.findIndex((b, i) => b === 0xff && out[i + 1] === 0xda);
    expect(out.slice(sosAt + 6, sosAt + 6 + ENTROPY.length)).toEqual(ENTROPY);
  });

  it('preserves the segments a decoder needs', () => {
    const r = stripImageMetadata(jpeg([EXIF_WITH_GPS]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = [...r.bytes];
    expect(out.some((b, i) => b === 0xff && out[i + 1] === 0xdb)).toBe(true); // DQT kept
    expect(out.slice(0, 2)).toEqual([0xff, 0xd8]);
    expect(out.slice(-2)).toEqual([0xff, 0xd9]);
  });

  it('strips EVERY APPn, not a list of known-bad ones', () => {
    // XMP rides in APP1, Photoshop IRB in APP13, and vendors use the rest for
    // whatever they like. An allowlist would be a promise to have thought of
    // every extension.
    const all = Array.from({ length: 16 }, (_, n) => app(n, ascii(`payload-${n}`)));
    const r = stripImageMetadata(jpeg(all));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (let n = 0; n < 16; n++) expect(bytesToString(r.bytes)).not.toContain(`payload-${n}`);
    expect(r.removed).toHaveLength(16);
  });

  it('removes JPEG comments, which are free text a person may not realise is there', () => {
    // Length covers the 2 length bytes plus the payload: 12 + 2 = 14.
    // My first attempt wrote 13, and the stripper correctly refused the whole
    // file as malformed — the fail-closed path, working.
    const comment = [0xff, 0xfe, 0x00, 0x0e, ...ascii('shot at home')];
    const r = stripImageMetadata(jpeg([comment]));
    expect(r.ok && bytesToString(r.bytes)).not.toContain('shot at home');
    expect(r.ok && r.removed).toContain('COM');
  });

  it('reports how much was removed, for the chain of custody', () => {
    const r = stripImageMetadata(jpeg([EXIF_WITH_GPS]));
    expect(r.ok && r.bytesRemoved).toBeGreaterThan(40);
  });
});

describe('PNG metadata stripping', () => {
  const IHDR = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const IDAT = chunk('IDAT', [0x78, 0x9c, 0x63, 0x00]);
  const IEND = chunk('IEND', []);

  it('removes eXIf chunks', () => {
    const r = stripImageMetadata(png([IHDR, chunk('eXIf', ascii('GPS 51.5074')), IDAT, IEND]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(bytesToString(r.bytes)).not.toContain('51.5074');
    expect(r.removed).toContain('eXIf');
  });

  it('removes text chunks, where phone software writes location', () => {
    const r = stripImageMetadata(png([
      IHDR,
      chunk('tEXt', ascii('Location\x00Home')),
      chunk('iTXt', ascii('Author\x00Jane')),
      IDAT, IEND,
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(bytesToString(r.bytes)).not.toContain('Home');
    expect(bytesToString(r.bytes)).not.toContain('Jane');
  });

  it('removes tIME, which dates the file even with no other metadata', () => {
    const r = stripImageMetadata(png([IHDR, chunk('tIME', [0x07, 0xe8, 1, 1, 1, 1, 1]), IDAT, IEND]));
    expect(r.ok && r.removed).toContain('tIME');
  });

  it('keeps the chunks a decoder needs', () => {
    const r = stripImageMetadata(png([IHDR, chunk('eXIf', ascii('x')), IDAT, IEND]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = bytesToString(r.bytes);
    expect(s).toContain('IHDR');
    expect(s).toContain('IDAT');
    expect(s).toContain('IEND');
  });

  it('keeps rendering chunks that carry no identity', () => {
    const r = stripImageMetadata(png([IHDR, chunk('gAMA', [0, 1, 2, 3]), chunk('sRGB', [0]), IDAT, IEND]));
    expect(r.ok && r.removed).toEqual([]);
  });

  it('removes private and unknown chunks rather than passing them through', () => {
    const r = stripImageMetadata(png([IHDR, chunk('prVt', ascii('secret')), IDAT, IEND]));
    expect(r.ok && bytesToString(r.bytes)).not.toContain('secret');
  });
});

describe('refusal', () => {
  it('refuses a format it cannot parse rather than passing it through', () => {
    // The one outcome that must never happen: a file that looks processed and
    // still carries whatever the camera wrote into it.
    const heicish = new Uint8Array([0, 0, 0, 0x18, ...ascii('ftypheic'), 1, 2, 3]);
    const r = stripImageMetadata(heicish);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('unsupported-format');
    expect(r.detail).toMatch(/HEIC/);
  });

  it('refuses a truncated JPEG', () => {
    const r = stripImageMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  it('refuses a segment whose length runs past the end of the file', () => {
    const r = stripImageMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x7f, 0xff, 0x00]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  it('refuses an empty file', () => {
    expect(stripImageMetadata(new Uint8Array([])).ok).toBe(false);
  });
});

describe('against real image files in this repo', () => {
  const real = ['public/starcom.png', 'public/apple-touch-icon.png', 'public/starcom-512.png']
    .map((p) => path.join(process.cwd(), p))
    .filter((p) => fs.existsSync(p));

  it('finds real files to test, or these assertions prove nothing', () => {
    expect(real.length).toBeGreaterThan(0);
  });

  for (const file of real) {
    it(`processes ${path.basename(file)} and keeps it decodable`, () => {
      const input = new Uint8Array(fs.readFileSync(file));
      const r = stripImageMetadata(input);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const s = bytesToString(r.bytes);
      // Structure intact: signature, header, image data, terminator.
      expect([...r.bytes.slice(0, 8)]).toEqual(PNG_SIG);
      expect(s).toContain('IHDR');
      expect(s).toContain('IDAT');
      expect(s).toContain('IEND');
      // Never larger than the original — stripping only removes.
      expect(r.bytes.length).toBeLessThanOrEqual(input.length);
    });
  }
});

describe('a wrong length is refused, not guessed at', () => {
  it('rejects a segment whose declared length disagrees with its content', () => {
    // Found by writing this test suite's own fixture wrong. A parser that
    // resynchronised on the next marker would have produced a plausible file
    // from misaligned input, which is worse than refusing.
    const badLength = [0xff, 0xfe, 0x00, 0x0d, ...ascii('shot at home')];
    const r = stripImageMetadata(jpeg([badLength]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });
});
describe('metadata that hides past the first scan', () => {
  /**
   * Both of these were found by running a real phone-shaped photo through the
   * pipeline and checking the OUTPUT with exiftool rather than with this
   * module's own parser. Both returned `ok: true` while handing back GPS
   * coordinates and a device serial in plain text.
   */

  const bytes = (u: Uint8Array) => Array.from(u);
  const ascii2 = (t: string) => [...t].map((c) => c.charCodeAt(0));

  it('removes anything appended after the end-of-image marker', () => {
    // Phones and editors append proprietary blobs routinely, and so does
    // anyone who wants to. The stripper used to copy from the scan to the end
    // of the file verbatim, so this survived untouched.
    const clean = jpeg([]);
    const withTrailer = new Uint8Array([...bytes(clean), ...ascii2('GPS 59.9139,10.7522 SERIAL F2LX9K')]);

    const r = stripImageMetadata(withTrailer);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.removed).toContain('trailing-data');
    expect(Array.from(r.bytes)).toEqual(bytes(clean));
    expect(String.fromCharCode(...r.bytes)).not.toContain('59.9139');
  });

  it('removes a metadata segment placed AFTER the scan', () => {
    // Progressive JPEGs legitimately carry several scans with segments between
    // them, so this is not only an attacker's trick. Spliced before EOI, an
    // APP1 previously survived whole: removed [], zero bytes removed, output
    // byte-identical to input.
    const clean = jpeg([]);
    const arr = bytes(clean);
    const eoi = arr.length - 2;
    const payload = [...ascii2('Exif'), 0, 0, ...ascii2('GPS 59.9139 SERIAL F2LX9K OWNER A. Person')];
    const spliced = new Uint8Array([
      ...arr.slice(0, eoi),
      0xff, 0xe1, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload,
      ...arr.slice(eoi),
    ]);

    const r = stripImageMetadata(spliced);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.removed).toContain('APP1');
    expect(Array.from(r.bytes)).toEqual(arr);
    expect(String.fromCharCode(...r.bytes)).not.toContain('OWNER');
  });

  it('keeps entropy data byte-identical across stuffing and restart markers', () => {
    // Walking the scan means understanding byte stuffing and restart markers.
    // Treating an RST as a segment boundary would truncate the image; treating
    // a stuffed FF 00 as a marker would do the same. Inside entropy-coded data
    // an 0xFF is only ever stuffing or a restart marker — a literal FF FF
    // there is not valid JPEG, and the stripper rejects it as malformed.
    const withRst = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xda, 0x00, 0x04, 0x01, 0x00,
      0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33, 0x44,
      0xff, 0xd9,
    ]);

    const r = stripImageMetadata(withRst);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Array.from(r.bytes)).toEqual(Array.from(withRst));
  });

  it('still strips a segment that appears between two scans', () => {
    const two = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xda, 0x00, 0x04, 0x01, 0x00, 0x11, 0x22,
      ...[0xff, 0xe1, 0x00, 0x08, ...ascii2('Exif'), 0, 0],
      0xff, 0xda, 0x00, 0x04, 0x01, 0x00, 0x33, 0x44,
      0xff, 0xd9,
    ]);

    const r = stripImageMetadata(two);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.removed).toContain('APP1');
    expect(String.fromCharCode(...r.bytes)).not.toContain('Exif');
  });
});
