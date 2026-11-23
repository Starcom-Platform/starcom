/**
 * Remove every metadata container from an image, keeping the pixels.
 *
 * This is the Phase III.5 gate: "EXIF stripping exists and is tested. Intake
 * does not open before this." Nothing in this codebase handled image metadata
 * before it, and there is already a file-upload path — so any photo a person
 * submitted carried whatever their camera wrote into it, which for a phone is
 * routinely GPS coordinates to a few metres, a device serial, and a timestamp.
 * For someone submitting evidence about people who would rather they did not,
 * that is not a privacy detail; it is their home address.
 *
 * Two design decisions worth stating, because both cost something:
 *
 * 1. SEGMENT REMOVAL, NOT RE-ENCODING. Decoding to a canvas and re-encoding
 *    would guarantee metadata is gone, because the browser only ever sees
 *    pixels. It would also destroy the original compression structure, which
 *    is the part of a photograph that carries its forensic value — whether it
 *    has been edited, resaved, or spliced. An evidence pipeline that silently
 *    launders every submission into a re-encoded copy is protecting the source
 *    by destroying the evidence. So this parses the container and removes the
 *    metadata segments, leaving the entropy-coded image data byte-identical.
 *
 * 2. FAIL CLOSED. A format this cannot parse is REJECTED, not passed through
 *    and not best-effort stripped. "We could not read it, so we left it alone"
 *    is the one outcome that must never happen here: it produces a file that
 *    looks processed and is not. Rejecting is visible; passing through is not.
 *
 * Pure functions over bytes, with no DOM and no browser API, so the guarantee
 * is testable directly rather than through a rendering surface.
 */

export type StripFailure =
  /** Not a format we can parse well enough to promise anything about. */
  | 'unsupported-format'
  /** Structurally invalid — truncated, or a segment length that runs off the end. */
  | 'malformed'
  /** Parsed, but metadata survived verification. Should be impossible; treated as fatal. */
  | 'verification-failed';

export type StripResult =
  | {
      ok: true;
      bytes: Uint8Array;
      format: 'jpeg' | 'png';
      /** Names of the containers removed, for the chain of custody. */
      removed: string[];
      bytesRemoved: number;
    }
  | { ok: false; reason: StripFailure; detail: string };

const JPEG_SOI = [0xff, 0xd8];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (b: Uint8Array, sig: number[]) =>
  b.length >= sig.length && sig.every((v, i) => b[i] === v);

/**
 * JPEG marker segments that carry metadata.
 *
 * ALL of APP0..APP15, not a list of known-bad ones. EXIF is APP1, but GPS also
 * reaches APP1 via XMP, Photoshop IRB rides in APP13, and manufacturers put
 * arbitrary data in the rest. An allowlist of segments to strip would be a
 * promise to have thought of every vendor extension; a denylist of what to
 * KEEP is the only defensible direction.
 *
 * APP14 (Adobe) is stripped too, and that has one real consequence: it carries
 * the colour transform flag for CMYK/YCCK JPEGs, which are rare outside print
 * workflows and essentially absent from camera and phone output. Losing colour
 * fidelity on a print-workflow file is a smaller harm than leaking a location.
 */
const APP_MARKER_NAME = (marker: number): string | null => {
  if (marker >= 0xe0 && marker <= 0xef) return `APP${marker - 0xe0}`;
  if (marker === 0xfe) return 'COM';
  return null;
};

function stripJpeg(bytes: Uint8Array): StripResult {
  const out: number[] = [0xff, 0xd8];
  const removed: string[] = [];
  let i = 2;

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      return { ok: false, reason: 'malformed', detail: `expected a marker at byte ${i}` };
    }
    // Fill bytes: a run of 0xFF before a marker is legal padding.
    let j = i;
    while (j < bytes.length && bytes[j] === 0xff) j++;
    if (j >= bytes.length) return { ok: false, reason: 'malformed', detail: 'truncated at a marker' };

    const marker = bytes[j];

    /**
     * Start of scan: the entropy-coded image data follows.
     *
     * This used to copy the whole remainder of the file verbatim and stop,
     * on the assumption that a scan is followed only by its end marker. It is
     * not, and that assumption let two things through while reporting success:
     *
     *   - ANY METADATA SEGMENT AFTER THE FIRST SCAN. An APP1 spliced in before
     *     EOI survived completely — `removed: []`, zero bytes removed, output
     *     byte-identical to input, GPS and a device serial passing straight
     *     through. Progressive JPEGs legitimately carry several scans with
     *     segments between them, so this is not only an attacker's trick.
     *   - ANYTHING APPENDED AFTER EOI. Phones and editors do this routinely,
     *     and so does anyone who wants to.
     *
     * So the scan is walked to its end and the marker loop continues. Walking
     * means respecting byte stuffing (FF 00), restart markers (FF D0..D7) and
     * fill bytes, because inside entropy-coded data those are not markers.
     */
    if (marker === 0xda) {
      if (j + 2 >= bytes.length) return { ok: false, reason: 'malformed', detail: 'truncated scan header' };
      const headerLength = (bytes[j + 1] << 8) | bytes[j + 2];
      if (headerLength < 2) return { ok: false, reason: 'malformed', detail: 'scan header length' };
      const headerEnd = j + 1 + headerLength;
      if (headerEnd > bytes.length) {
        return { ok: false, reason: 'malformed', detail: 'scan header runs past the end of the file' };
      }
      out.push(0xff, marker);
      for (let k = j + 1; k < headerEnd; k++) out.push(bytes[k]);

      let k = headerEnd;
      while (k < bytes.length) {
        if (bytes[k] !== 0xff) { out.push(bytes[k]); k++; continue; }
        const next = bytes[k + 1];
        if (next === undefined) { out.push(bytes[k]); k++; break; }
        // Stuffed 0xFF, restart marker, or fill: all part of the scan.
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { out.push(0xff, next); k += 2; continue; }
        if (next === 0xff) { out.push(0xff); k++; continue; }
        break; // a real marker — hand back to the segment loop
      }
      i = k;
      continue;
    }

    /**
     * End of image. Nothing after it belongs to the image, so anything there
     * is removed and COUNTED — silently dropping it would be the same
     * dishonesty as silently keeping it.
     */
    if (marker === 0xd9) {
      out.push(0xff, marker);
      const trailing = bytes.length - (j + 1);
      // Counted by bytesRemoved, which is out.length against the input.
      if (trailing > 0) removed.push('trailing-data');
      break;
    }
    // Standalone markers carry no length.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(0xff, marker);
      i = j + 1;
      continue;
    }

    if (j + 2 >= bytes.length) return { ok: false, reason: 'malformed', detail: 'truncated segment length' };
    const length = (bytes[j + 1] << 8) | bytes[j + 2];
    if (length < 2) return { ok: false, reason: 'malformed', detail: `segment length ${length} at byte ${j}` };
    const segmentEnd = j + 1 + length;
    if (segmentEnd > bytes.length) {
      return { ok: false, reason: 'malformed', detail: 'segment runs past the end of the file' };
    }

    const name = APP_MARKER_NAME(marker);
    if (name) {
      removed.push(name);
    } else {
      out.push(0xff, marker);
      for (let k = j + 1; k < segmentEnd; k++) out.push(bytes[k]);
    }
    i = segmentEnd;
  }

  return {
    ok: true,
    bytes: new Uint8Array(out),
    format: 'jpeg',
    removed: [...new Set(removed)],
    bytesRemoved: bytes.length - out.length,
  };
}

/**
 * PNG chunks kept.
 *
 * A KEEP list, for the same reason as above. Critical chunks are required to
 * decode; the ancillary ones here affect rendering (colour, transparency,
 * physical size, animation) and carry no identity. Everything else goes —
 * including eXIf, tEXt/zTXt/iTXt (arbitrary key/value, where phone software
 * writes location), tIME (last-modified), and any private chunk.
 */
const PNG_KEEP = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND',
  'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'hIST', 'pHYs', 'sPLT',
  'acTL', 'fcTL', 'fdAT',
]);

function stripPng(bytes: Uint8Array): StripResult {
  const out: number[] = [...PNG_SIG];
  const removed: string[] = [];
  let i = PNG_SIG.length;

  while (i < bytes.length) {
    if (i + 8 > bytes.length) return { ok: false, reason: 'malformed', detail: 'truncated chunk header' };
    const length = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const chunkEnd = i + 12 + length; // length + type + data + crc
    if (chunkEnd > bytes.length) return { ok: false, reason: 'malformed', detail: `chunk ${type} runs past the end` };

    if (PNG_KEEP.has(type)) {
      for (let k = i; k < chunkEnd; k++) out.push(bytes[k]);
    } else {
      removed.push(type);
    }

    i = chunkEnd;
    if (type === 'IEND') break;
  }

  return {
    ok: true,
    bytes: new Uint8Array(out),
    format: 'png',
    removed: [...new Set(removed)],
    bytesRemoved: bytes.length - out.length,
  };
}

/**
 * Verify, rather than trust the stripper.
 *
 * Re-scans the OUTPUT for anything that should have been removed. The stripper
 * and the verifier are separate on purpose: a bug in the parser that skipped a
 * segment would otherwise produce a confident "stripped" result, and the whole
 * point of this module is that its promise can be relied on.
 */
function verifyClean(bytes: Uint8Array, format: 'jpeg' | 'png'): string | null {
  if (format === 'jpeg') {
    let i = 2;
    while (i < bytes.length - 1) {
      if (bytes[i] !== 0xff) break;
      let j = i;
      while (j < bytes.length && bytes[j] === 0xff) j++;
      const marker = bytes[j];
      /**
       * Walk THROUGH the scan, do not stop at it.
       *
       * This returned as soon as it saw a scan, so it shared the stripper's
       * blind spot exactly — which is how an APP1 segment spliced in after the
       * scan passed verification. A verifier that inherits the parser's
       * assumption verifies nothing about that assumption.
       */
      if (marker === 0xda) {
        if (j + 2 >= bytes.length) return null;
        let k = j + 1 + ((bytes[j + 1] << 8) | bytes[j + 2]);
        while (k < bytes.length) {
          if (bytes[k] !== 0xff) { k++; continue; }
          const next = bytes[k + 1];
          if (next === undefined) return null;
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { k += 2; continue; }
          if (next === 0xff) { k++; continue; }
          break;
        }
        i = k;
        continue;
      }
      if (marker === 0xd9) {
        // Nothing may follow the end of image.
        return j + 1 < bytes.length ? `${bytes.length - (j + 1)} bytes survived after EOI` : null;
      }
      if (APP_MARKER_NAME(marker)) return `${APP_MARKER_NAME(marker)} survived`;
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i = j + 1; continue; }
      if (j + 2 >= bytes.length) break;
      i = j + 1 + ((bytes[j + 1] << 8) | bytes[j + 2]);
    }
    return null;
  }

  let i = PNG_SIG.length;
  while (i + 8 <= bytes.length) {
    const length = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    if (!PNG_KEEP.has(type)) return `${type} survived`;
    i += 12 + length;
    if (type === 'IEND') break;
  }
  return null;
}

/**
 * Strip metadata from an image, or refuse it.
 *
 * There is no third outcome. A caller may treat `ok: false` however it likes,
 * but it must never fall back to submitting the original bytes.
 */
export function stripImageMetadata(input: Uint8Array): StripResult {
  if (startsWith(input, JPEG_SOI)) {
    const result = stripJpeg(input);
    if (!result.ok) return result;
    const survived = verifyClean(result.bytes, 'jpeg');
    return survived ? { ok: false, reason: 'verification-failed', detail: survived } : result;
  }

  if (startsWith(input, PNG_SIG)) {
    const result = stripPng(input);
    if (!result.ok) return result;
    const survived = verifyClean(result.bytes, 'png');
    return survived ? { ok: false, reason: 'verification-failed', detail: survived } : result;
  }

  return {
    ok: false,
    reason: 'unsupported-format',
    detail:
      'Only JPEG and PNG can be accepted. Other formats are refused rather than passed through: '
      + 'a file this cannot parse would look processed while still carrying whatever the camera wrote into it. '
      + 'HEIC and TIFF in particular carry EXIF and are common phone output — convert before submitting.',
  };
}
