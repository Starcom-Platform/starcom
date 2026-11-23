import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { StripResult } from './stripImageMetadata';

/**
 * What happened to a piece of submitted evidence, and nothing about who sent it.
 *
 * Phase III.5's gate: "Chain of custody records evidence, never submitter
 * identity." The two halves of that sentence pull against each other, and the
 * resolution is that a custody record answers "is this the same file, and what
 * was done to it" — not "where did it come from".
 *
 * What is deliberately ABSENT, and why each one was considered:
 *
 *  - No filename. `IMG_20260114_backgarden.jpg` names a place; people also
 *    name files after themselves, their case, or the person they are reporting.
 *    It is free text written by the submitter under no warning, which makes it
 *    the single most likely place for an accidental disclosure.
 *  - No file timestamps. Filesystem mtime is when the submitter last touched
 *    it, which correlates with their timezone and their working hours.
 *  - No IP, user agent, screen size, locale or device data. Individually
 *    weak, jointly a fingerprint.
 *  - No submitter key, handle, or session id. An intake that can link two
 *    submissions to one person can be compelled to.
 *
 * What IS recorded is what a later reader needs in order to trust the file:
 * its hash before and after stripping, what was removed, and when it was
 * accepted — to a deliberately coarse resolution.
 */

export interface CustodyRecord {
  /** SHA-256 of the bytes as submitted, BEFORE stripping. */
  originalDigest: string;
  /** SHA-256 of what was actually kept. This is the file that exists from here on. */
  strippedDigest: string;
  format: 'jpeg' | 'png';
  /** Metadata containers removed, by name. Evidence of the process, not of the person. */
  removed: string[];
  /**
   * How much metadata was removed, COARSENED to a power-of-two band.
   *
   * This was the exact byte count, and that made the record a device
   * fingerprint. Measured: three photos from one simulated phone profile all
   * produced `removed: [APP0, APP1, APP13]` with `bytesRemoved: 3268` —
   * identical, because a given camera app writes a metadata block of
   * characteristic size. A different device gave 144.
   *
   * Published, that clusters a person's submissions together, and linkability
   * is what unmasks a repeat source: each submission narrows the candidate
   * set, and identifying any one of them identifies the rest. The exact figure
   * also cannot be checked by any reader — verifying it needs the original
   * bytes, which are never published — so it was a fingerprint carrying no
   * evidential weight at all.
   *
   * The band keeps what a reader can actually use ("a few kilobytes of
   * metadata was removed, not nothing") and drops the precision that
   * correlates. It does not make submissions unlinkable — a large removal
   * still differs from a tiny one — it stops them matching exactly.
   */
  bytesRemovedBand: number;
  /**
   * When it was accepted, rounded to the hour.
   *
   * Not to the millisecond. A precise arrival time is a correlation handle: it
   * can be matched against relay logs, network captures, or CCTV to place one
   * person at one keyboard. An hour is enough for an evidential timeline and
   * far too coarse to single anyone out.
   */
  acceptedAtHour: string;
  /** Schema version, so a later reader knows what these fields meant. */
  version: 1;
}

/**
 * Largest power of two not exceeding n, or 0.
 *
 * Deliberately coarse and deliberately not configurable: a caller able to ask
 * for finer resolution would reintroduce the fingerprint on request.
 */
function toBand(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return 2 ** Math.floor(Math.log2(n));
}

/** Round to the containing hour, in UTC. */
function toHour(d: Date): string {
  return new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(),
  )).toISOString();
}

/**
 * Build a custody record for an accepted submission.
 *
 * Takes the ALREADY-STRIPPED result rather than doing the stripping itself, so
 * that a refused file cannot get a custody record: there is no code path that
 * produces one for bytes that were not successfully cleaned.
 */
export function recordCustody(
  original: Uint8Array,
  stripped: Extract<StripResult, { ok: true }>,
  now: Date = new Date(),
): CustodyRecord {
  return {
    originalDigest: bytesToHex(sha256(original)),
    strippedDigest: bytesToHex(sha256(stripped.bytes)),
    format: stripped.format,
    removed: [...stripped.removed],
    bytesRemovedBand: toBand(stripped.bytesRemoved),
    acceptedAtHour: toHour(now),
    version: 1,
  };
}

/**
 * Fields a custody record must never contain.
 *
 * Exported so the guard test can assert against the list rather than against a
 * snapshot of today's shape — a snapshot test passes forever and says nothing
 * about the field someone adds next year.
 */
export const FORBIDDEN_CUSTODY_FIELDS = [
  'filename', 'fileName', 'name', 'path',
  'ip', 'ipAddress', 'userAgent', 'ua',
  'submitter', 'submitterId', 'sessionId', 'pubkey', 'author',
  'locale', 'timezone', 'screen', 'device', 'deviceId',
  'lastModified', 'mtime', 'exif', 'gps',
  // Exact sizes and times are correlation handles, not identifiers, but they
  // deanonymise a repeat source just as effectively. See bytesRemovedBand.
  'bytesRemoved', 'acceptedAt', 'submittedAt',
] as const;
