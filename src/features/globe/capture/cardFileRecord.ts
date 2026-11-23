/**
 * A card's record written into its own file (block I, item 5): a copy saved,
 * forwarded or downloaded carries what the card states and how it was made,
 * so it can be traced to the view that made it without the post around it.
 *
 * As XMP, the one place every image format keeps text and readers look for it:
 * a PNG's iTXt chunk "XML:com.adobe.xmp", a JPEG's APP1 segment, a WebP's
 * "XMP " chunk. The packet holds the card's alt text as its description,
 * Starcom as the tool that made it, the moment, and the provenance as JSON.
 *
 * A JPEG segment holds at most 65,502 bytes of XMP. A record too large for it
 * drops its longest lists from the copy in the file, largest first, and says
 * which (`starcom:omitted`); the record returned with the card stays whole.
 */
import type { GlobeViewProvenance } from './shareCardProvenance';

export const STARCOM_XMP_NAMESPACE = 'https://starcom.app/ns/capture/1.0/';
const XMP_PNG_KEYWORD = 'XML:com.adobe.xmp';
const XMP_JPEG_HEADER = 'http://ns.adobe.com/xap/1.0/\0';
/** The most XMP one JPEG APP1 segment holds: 65,535, less its length field and header. */
export const JPEG_XMP_MAX = 65535 - 2 - XMP_JPEG_HEADER.length;
/** What a record too large for a JPEG gives up first: lists of what was drawn, never its caveats. */
const OMITTABLE = ['raverWatchItems', 'legend', 'feeds'] as const;

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The XMP packet for a card. */
export function cardXmp(input: { provenance: GlobeViewProvenance; alt?: string; omitted?: readonly string[] }): string {
  const { provenance, alt, omitted = [] } = input;
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about=""',
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"',
    ' xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    ` xmlns:starcom="${STARCOM_XMP_NAMESPACE}">`,
    '<xmp:CreatorTool>Starcom</xmp:CreatorTool>',
    `<xmp:CreateDate>${escapeXml(provenance.capturedAt)}</xmp:CreateDate>`,
    alt ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(alt)}</rdf:li></rdf:Alt></dc:description>` : '',
    omitted.length ? `<starcom:omitted>${escapeXml(omitted.join(' '))}</starcom:omitted>` : '',
    `<starcom:provenance>${escapeXml(JSON.stringify(provenance))}</starcom:provenance>`,
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="r"?>',
  ].filter(Boolean).join('');
}

const utf8 = (text: string) => new TextEncoder().encode(text);
const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const u32be = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const u32le = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
const readU32be = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const readU32le = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

let CRC_TABLE: Uint32Array | null = null;
/** PNG's CRC-32, over a chunk's type and data. */
export function crc32(bytes: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The end of a PNG's IHDR: its signature, then the 13-byte header chunk, always first. */
const PNG_AFTER_IHDR = 8 + 12 + 13;

/**
 * A PNG with an iTXt "XML:com.adobe.xmp" chunk right after its header, before
 * the image data, where XMP readers look first: after it, exiftool warns some
 * readers ignore it.
 */
function pngWithXmp(png: Uint8Array, xmp: string): Uint8Array {
  if (ascii(png, 12, 4) !== 'IHDR' || ascii(png, png.length - 8, 4) !== 'IEND') {
    throw new Error('Not a PNG from IHDR to IEND: no record written into it.');
  }
  // keyword, null, compression flag and method (none), empty language and translated keyword, the text.
  const data = concat([utf8(XMP_PNG_KEYWORD), new Uint8Array([0, 0, 0, 0, 0]), utf8(xmp)]);
  const typeAndData = concat([utf8('iTXt'), data]);
  const chunk = concat([u32be(data.length), typeAndData, u32be(crc32(typeAndData))]);
  return concat([png.subarray(0, PNG_AFTER_IHDR), chunk, png.subarray(PNG_AFTER_IHDR)]);
}

/** A JPEG with an APP1 XMP segment after its SOI, and after its APP0 when it has one. */
function jpegWithXmp(jpeg: Uint8Array, xmp: string): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG: no record written into it.');
  const payload = concat([utf8(XMP_JPEG_HEADER), utf8(xmp)]);
  if (payload.length + 2 > 65535) throw new Error('The record is too large for one JPEG segment.');
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]);
  const length = payload.length + 2;
  const segment = concat([new Uint8Array([0xff, 0xe1, (length >> 8) & 255, length & 255]), payload]);
  return concat([jpeg.subarray(0, at), segment, jpeg.subarray(at)]);
}

/** A WebP made extended where it is simple, its XMP flag set, and an "XMP " chunk at its end. */
function webpWithXmp(webp: Uint8Array, xmp: string, size: { width: number; height: number }): Uint8Array {
  if (ascii(webp, 0, 4) !== 'RIFF' || ascii(webp, 8, 4) !== 'WEBP') throw new Error('Not a WebP: no record written into it.');
  const first = ascii(webp, 12, 4);
  let body = webp.subarray(12);
  if (first === 'VP8X') {
    body = new Uint8Array(body);
    body[8] |= 0x04;
  } else {
    // A simple file has no room for metadata: an extended header goes first, with the canvas size.
    const alpha = first === 'VP8L' && ((webp[20 + 4] >> 4) & 1) === 1 ? 0x10 : 0;
    const w = size.width - 1;
    const h = size.height - 1;
    const vp8x = concat([
      utf8('VP8X'), u32le(10),
      new Uint8Array([0x04 | alpha, 0, 0, 0, w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255]),
    ]);
    body = concat([vp8x, body]);
  }
  const text = utf8(xmp);
  const chunk = concat([utf8('XMP '), u32le(text.length), text, text.length % 2 ? new Uint8Array([0]) : new Uint8Array(0)]);
  const rest = concat([utf8('WEBP'), body, chunk]);
  return concat([utf8('RIFF'), u32le(rest.length), rest]);
}

/** The XMP written into a card's file, or null when there is none. For checking what a file carries. */
export function readXmp(bytes: Uint8Array, mimeType: string): string | null {
  const decode = (b: Uint8Array) => new TextDecoder().decode(b);
  if (mimeType === 'image/png') {
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = readU32be(bytes, at);
      const type = ascii(bytes, at + 4, 4);
      const data = bytes.subarray(at + 8, at + 8 + length);
      if (type === 'iTXt' && decode(data.subarray(0, XMP_PNG_KEYWORD.length)) === XMP_PNG_KEYWORD) {
        return decode(data.subarray(XMP_PNG_KEYWORD.length + 5));
      }
      at += 12 + length;
    }
    return null;
  }
  if (mimeType === 'image/jpeg') {
    for (let at = 2; at + 4 <= bytes.length && bytes[at] === 0xff;) {
      const marker = bytes[at + 1];
      const length = (bytes[at + 2] << 8) | bytes[at + 3];
      const payload = bytes.subarray(at + 4, at + 2 + length);
      if (marker === 0xe1 && decode(payload.subarray(0, XMP_JPEG_HEADER.length)) === XMP_JPEG_HEADER) {
        return decode(payload.subarray(XMP_JPEG_HEADER.length));
      }
      if (marker === 0xda) return null;
      at += 2 + length;
    }
    return null;
  }
  if (mimeType === 'image/webp') {
    for (let at = 12; at + 8 <= bytes.length;) {
      const type = ascii(bytes, at, 4);
      const length = readU32le(bytes, at + 4);
      if (type === 'XMP ') return decode(bytes.subarray(at + 8, at + 8 + length));
      at += 8 + length + (length % 2);
    }
    return null;
  }
  return null;
}

const fromBase64 = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
};

/**
 * The card's data URL with its record written in. A JPEG too small to hold the
 * whole record holds it without its longest lists, and says which.
 */
export function withCardRecord(
  dataUrl: string,
  card: { mimeType: string; width: number; height: number; provenance: GlobeViewProvenance; alt?: string },
): { dataUrl: string; omitted: string[] } {
  const comma = dataUrl.indexOf(',');
  const bytes = fromBase64(dataUrl.slice(comma + 1));
  let omitted: string[] = [];
  let written: Uint8Array;
  if (card.mimeType === 'image/png') {
    written = pngWithXmp(bytes, cardXmp({ provenance: card.provenance, alt: card.alt }));
  } else if (card.mimeType === 'image/webp') {
    written = webpWithXmp(bytes, cardXmp({ provenance: card.provenance, alt: card.alt }), card);
  } else if (card.mimeType === 'image/jpeg') {
    let record: GlobeViewProvenance = card.provenance;
    let xmp = cardXmp({ provenance: record, alt: card.alt });
    for (const field of OMITTABLE) {
      if (utf8(xmp).length <= JPEG_XMP_MAX) break;
      if (!(field in record)) continue;
      const { [field]: _dropped, ...rest } = record as unknown as Record<string, unknown>;
      record = rest as unknown as GlobeViewProvenance;
      omitted = [...omitted, field];
      xmp = cardXmp({ provenance: record, alt: card.alt, omitted });
    }
    written = jpegWithXmp(bytes, xmp);
  } else {
    return { dataUrl, omitted };
  }
  return { dataUrl: `${dataUrl.slice(0, comma + 1)}${toBase64(written)}`, omitted };
}
