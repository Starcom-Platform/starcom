/**
 * A card's record written into its own file (block I, item 5): XMP in a PNG's
 * iTXt chunk, a JPEG's APP1 segment and a WebP's "XMP " chunk, holding the alt
 * text and the provenance, so a copy carries what the card states. Checked on
 * real one-pixel files of each kind, read back as a reader would.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { buildGlobeViewProvenance } from '../shareCardProvenance';
import { cardXmp, crc32, readXmp, withCardRecord, JPEG_XMP_MAX, STARCOM_XMP_NAMESPACE } from '../cardFileRecord';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPEG = '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A7iiiiv8AQA+XP//Z';
const WEBP_LOSSY = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
const WEBP_LOSSLESS = 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
const WEBP_ALPHA = 'UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==';

const AT = new Date('2026-10-03T05:52:00.000Z');
const provenance = buildGlobeViewProvenance({
  capturedAt: AT, camera: { lat: 33, lon: 43.7, altitude: 1 }, frame: { width: 1, height: 1 },
  layers: [{ label: 'War & Conflict', active: true, implemented: true }],
  feeds: [{ name: 'War & Conflict', lastUpdated: AT.toISOString() }],
  build: { sha: 'a'.repeat(40), builtAt: AT.toISOString() }, now: AT,
});
const ALT = 'CRITICAL INTEL: Strikes near "Kunar" <reported> & disputed.';
const bytesOf = (base64: string) => Uint8Array.from(Buffer.from(base64, 'base64'));
const card = (mimeType: string, over: Record<string, unknown> = {}) => ({ mimeType, width: 1, height: 1, provenance, alt: ALT, ...over });
const unescape = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const recordIn = (xmp: string) => JSON.parse(unescape(xmp.match(/<starcom:provenance>(.*)<\/starcom:provenance>/s)![1]));
const altIn = (xmp: string) => unescape(xmp.match(/<rdf:li xml:lang="x-default">(.*)<\/rdf:li>/s)![1]);
const write = (mime: string, base64: string, over: Record<string, unknown> = {}) => {
  const { dataUrl, omitted } = withCardRecord(`data:${mime};base64,${base64}`, card(mime, over));
  return { bytes: bytesOf(dataUrl.slice(dataUrl.indexOf(',') + 1)), omitted, dataUrl };
};

describe('the packet', () => {
  it('holds the alt text, Starcom as its maker, the moment, and the provenance, escaped as XML', () => {
    const xmp = cardXmp({ provenance, alt: ALT });
    expect(xmp).toContain('<xmp:CreatorTool>Starcom</xmp:CreatorTool>');
    expect(xmp).toContain('<xmp:CreateDate>2026-10-03T05:52:00.000Z</xmp:CreateDate>');
    expect(xmp).toContain(`xmlns:starcom="${STARCOM_XMP_NAMESPACE}"`);
    expect(xmp).toContain('&lt;reported&gt; &amp; disputed');
    expect(altIn(xmp)).toBe(ALT);
    expect(recordIn(xmp)).toEqual(JSON.parse(JSON.stringify(provenance)));
  });
});

describe('a PNG', () => {
  it('carries the packet in an iTXt chunk right after its header, before the image data, with a CRC a reader accepts', () => {
    const { bytes } = write('image/png', PNG);
    const xmp = readXmp(bytes, 'image/png')!;
    expect(altIn(xmp)).toBe(ALT);
    expect(recordIn(xmp)).toEqual(JSON.parse(JSON.stringify(provenance)));
    // Every chunk's CRC holds, and the file still ends with IEND.
    for (let at = 8; at < bytes.length;) {
      const length = Buffer.from(bytes.subarray(at, at + 4)).readUInt32BE(0);
      const stated = Buffer.from(bytes.subarray(at + 8 + length, at + 12 + length)).readUInt32BE(0);
      expect(crc32(bytes.subarray(at + 4, at + 8 + length))).toBe(stated);
      at += 12 + length;
    }
    expect(Buffer.from(bytes.subarray(bytes.length - 8, bytes.length - 4)).toString('latin1')).toBe('IEND');
    // Before any IDAT, where XMP readers look first (exiftool warns of text after the image data).
    const types: string[] = [];
    for (let at = 8; at < bytes.length;) {
      const length = Buffer.from(bytes.subarray(at, at + 4)).readUInt32BE(0);
      types.push(Buffer.from(bytes.subarray(at + 4, at + 8)).toString('latin1'));
      at += 12 + length;
    }
    expect(types.slice(0, 2)).toEqual(['IHDR', 'iTXt']);
    expect(types.indexOf('iTXt')).toBeLessThan(types.indexOf('IDAT'));
  });
});

describe('a JPEG', () => {
  it('carries the packet in an APP1 segment after its JFIF header', () => {
    const { bytes } = write('image/jpeg', JPEG);
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    const app0 = 4 + ((bytes[4] << 8) | bytes[5]);
    expect([bytes[app0], bytes[app0 + 1]]).toEqual([0xff, 0xe1]);
    expect(recordIn(readXmp(bytes, 'image/jpeg')!)).toEqual(JSON.parse(JSON.stringify(provenance)));
  });

  it('leaves out the longest lists, and says which, when the record is too large for one segment', () => {
    const items = Array.from({ length: 900 }, (_, i) => ({ id: `30023:${'f'.repeat(64)}:item-${i}`, layer: 'WarConflict', level: 'report' }));
    const { bytes, omitted } = write('image/jpeg', JPEG, { provenance: { ...provenance, raverWatchItems: items } });
    expect(omitted).toEqual(['raverWatchItems']);
    const xmp = readXmp(bytes, 'image/jpeg')!;
    expect(new TextEncoder().encode(xmp).length).toBeLessThanOrEqual(JPEG_XMP_MAX);
    expect(xmp).toContain('<starcom:omitted>raverWatchItems</starcom:omitted>');
    expect(recordIn(xmp).caveats).toEqual(provenance.caveats);
  });
});

describe('a WebP', () => {
  const riffHolds = (bytes: Uint8Array) => Buffer.from(bytes.subarray(4, 8)).readUInt32LE(0) === bytes.length - 8;

  it('becomes extended where it was simple, its XMP flag set and its canvas size stated', () => {
    for (const [name, base64] of [['lossy', WEBP_LOSSY], ['lossless', WEBP_LOSSLESS]] as const) {
      const { bytes } = write('image/webp', base64);
      expect(Buffer.from(bytes.subarray(12, 16)).toString('latin1'), name).toBe('VP8X');
      expect(bytes[20] & 0x04, name).toBe(0x04);
      expect(riffHolds(bytes), name).toBe(true);
      expect(recordIn(readXmp(bytes, 'image/webp')!), name).toEqual(JSON.parse(JSON.stringify(provenance)));
      // The canvas it states, less one, in 24 bits each: 1 × 1 here.
      expect([...bytes.subarray(24, 30)], name).toEqual([0, 0, 0, 0, 0, 0]);
    }
    // A lossless file that uses alpha says so in its new header; the lossy one has none.
    expect(write('image/webp', WEBP_LOSSLESS).bytes[20] & 0x10).toBe(0x10);
    expect(write('image/webp', WEBP_LOSSY).bytes[20] & 0x10).toBe(0);
  });

  it('pads a chunk of odd length, so every chunk lands where the next begins', () => {
    for (const alt of [ALT, `${ALT} `]) {
      const { bytes } = write('image/webp', WEBP_LOSSY, { alt });
      let at = 12;
      while (at < bytes.length) {
        const length = Buffer.from(bytes.subarray(at + 4, at + 8)).readUInt32LE(0);
        at += 8 + length + (length % 2);
      }
      expect(at, JSON.stringify(alt.length)).toBe(bytes.length);
    }
  });

  it('keeps an extended file\'s own header, alpha and all, and sets its XMP flag', () => {
    const { bytes } = write('image/webp', WEBP_ALPHA);
    expect(Buffer.from(bytes.subarray(12, 16)).toString('latin1')).toBe('VP8X');
    expect(bytes[20] & 0x10).toBe(0x10);
    expect(bytes[20] & 0x04).toBe(0x04);
    expect(riffHolds(bytes)).toBe(true);
    expect(altIn(readXmp(bytes, 'image/webp')!)).toBe(ALT);
  });
});

describe('the packet, as each file holds it', () => {
  it('begins exactly at its xpacket header in every format: no header byte too few or too many', () => {
    for (const [mime, base64] of [['image/png', PNG], ['image/jpeg', JPEG], ['image/webp', WEBP_LOSSY]] as const) {
      const xmp = readXmp(write(mime, base64).bytes, mime)!;
      expect(xmp.startsWith('<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>'), mime).toBe(true);
      expect(xmp.endsWith('<?xpacket end="r"?>'), mime).toBe(true);
    }
  });
});

describe('any other file', () => {
  it('is left as it was', () => {
    const before = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    expect(withCardRecord(before, card('image/gif'))).toEqual({ dataUrl: before, omitted: [] });
  });
});
