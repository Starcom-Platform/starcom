import { describe, it, expect } from 'vitest';
import { recordCustody, FORBIDDEN_CUSTODY_FIELDS } from '../chainOfCustody';
import { stripImageMetadata } from '../stripImageMetadata';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const app1 = (payload: number[]) => {
  const len = payload.length + 2;
  return [0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...payload];
};
const withExif = new Uint8Array([
  0xff, 0xd8,
  ...app1([...ascii('Exif'), 0, 0, ...ascii('GPSLatitude 51.5074')]),
  0xff, 0xda, 0x00, 0x04, 0x01, 0x00, 1, 2, 3, 0xff, 0xd9,
]);

const accepted = () => {
  const r = stripImageMetadata(withExif);
  if (!r.ok) throw new Error('fixture failed to strip');
  return r;
};

describe('chain of custody', () => {
  it('records both digests, so the transformation is checkable', () => {
    const rec = recordCustody(withExif, accepted());
    expect(rec.originalDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.strippedDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.originalDigest).not.toBe(rec.strippedDigest);
  });

  it('names what was removed', () => {
    expect(recordCustody(withExif, accepted()).removed).toContain('APP1');
  });

  it('carries NO field that could identify the submitter', () => {
    // Asserted against a named list rather than a snapshot: a snapshot passes
    // forever and says nothing about the field someone adds next year.
    const rec = recordCustody(withExif, accepted()) as unknown as Record<string, unknown>;
    for (const forbidden of FORBIDDEN_CUSTODY_FIELDS) {
      expect(Object.keys(rec)).not.toContain(forbidden);
    }
  });

  it('contains no substring of the stripped metadata anywhere in it', () => {
    // The record must not become the leak it exists to prevent.
    const serialized = JSON.stringify(recordCustody(withExif, accepted()));
    expect(serialized).not.toContain('GPSLatitude');
    expect(serialized).not.toContain('51.5074');
  });

  it('rounds the accepted time to the hour, never the millisecond', () => {
    // A precise arrival time is a correlation handle — it can be matched
    // against relay logs or CCTV to place one person at one keyboard.
    const rec = recordCustody(withExif, accepted(), new Date('2026-08-21T14:37:52.481Z'));
    expect(rec.acceptedAtHour).toBe('2026-08-21T14:00:00.000Z');
  });

  it('gives two submissions in the same hour indistinguishable timestamps', () => {
    const a = recordCustody(withExif, accepted(), new Date('2026-08-21T14:01:00Z'));
    const b = recordCustody(withExif, accepted(), new Date('2026-08-21T14:58:00Z'));
    expect(a.acceptedAtHour).toBe(b.acceptedAtHour);
  });

  it('is reproducible: the same bytes always give the same digests', () => {
    const a = recordCustody(withExif, accepted(), new Date('2026-08-21T14:00:00Z'));
    const b = recordCustody(withExif, accepted(), new Date('2026-08-21T14:00:00Z'));
    expect(a).toEqual(b);
  });

  it('has no path to a custody record for a file that was not cleaned', () => {
    // recordCustody takes an already-successful strip result. A refused file
    // has no value to pass, so there is no way to record one by mistake.
    const refused = stripImageMetadata(new Uint8Array([1, 2, 3, 4]));
    expect(refused.ok).toBe(false);
    // @ts-expect-error — proving the type makes this unrepresentable.
    expect(() => recordCustody(withExif, refused)).toBeDefined();
  });
});
describe('what a custody record leaks about a repeat source', () => {
  /**
   * Linkability is what unmasks a source who submits more than once: each
   * submission narrows the candidate set, and identifying any one of them
   * identifies the rest. So these test correlation handles, not identifiers.
   */

  /** Two submissions from one device: same metadata profile, different photo. */
  const fromSameDevice = (photoByte: number, exifPad: string) => new Uint8Array([
    0xff, 0xd8,
    ...app1([...ascii('Exif'), 0, 0, ...ascii(`GPSLatitude 51.5074${exifPad}`)]),
    0xff, 0xda, 0x00, 0x04, 0x01, 0x00, photoByte, 2, 3, 0xff, 0xd9,
  ]);

  it('does not publish an exact removed-byte count', () => {
    // It used to. Measured on simulated phone profiles, three different photos
    // from one device all reported bytesRemoved: 3268 — identical, because a
    // camera app writes a metadata block of characteristic size. Published,
    // that clusters a person's submissions.
    const r = stripImageMetadata(withExif);
    if (!r.ok) throw new Error('fixture failed to strip');
    const rec = recordCustody(withExif, r) as unknown as Record<string, unknown>;

    expect(rec).not.toHaveProperty('bytesRemoved');
    expect(Object.values(rec)).not.toContain(r.bytesRemoved);
  });

  it('reports the removal size only to a COARSE band', () => {
    // Sizes chosen so the band has to be coarse to collapse them: these remove
    // 35 and 49 bytes, the same power-of-two band but different 16-byte
    // buckets. An earlier version of this test used fixtures two bytes apart,
    // which any band collapses — so it passed a mutation that made the band
    // fine enough to keep the fingerprint.
    const one = fromSameDevice(1, 'X'.repeat(6));
    const two = fromSameDevice(9, 'X'.repeat(20));

    const a = stripImageMetadata(one), b = stripImageMetadata(two);
    if (!a.ok || !b.ok) throw new Error('fixture failed to strip');

    // The underlying counts genuinely differ...
    expect(a.bytesRemoved).not.toBe(b.bytesRemoved);
    // ...and the published record does not carry that difference.
    expect(recordCustody(one, a).bytesRemovedBand)
      .toBe(recordCustody(two, b).bytesRemovedBand);
  });

  it('bands are powers of two, and zero stays zero', () => {
    const clean = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x04, 0x01, 0x00, 1, 2, 3, 0xff, 0xd9]);
    const r = stripImageMetadata(clean);
    if (!r.ok) throw new Error('fixture failed to strip');

    const band = recordCustody(clean, r).bytesRemovedBand;
    expect(band).toBe(0);

    const rec = recordCustody(withExif, accepted());
    expect(Number.isInteger(Math.log2(rec.bytesRemovedBand))).toBe(true);
    expect(rec.bytesRemovedBand).toBeLessThanOrEqual(accepted().bytesRemoved);
  });

  it('carries no field whose name is on the forbidden list', () => {
    // Including the correlation handles added after the fingerprint was found.
    const rec = recordCustody(withExif, accepted()) as unknown as Record<string, unknown>;
    for (const f of FORBIDDEN_CUSTODY_FIELDS) expect(rec).not.toHaveProperty(f);
    expect(FORBIDDEN_CUSTODY_FIELDS).toContain('bytesRemoved');
  });

  it('still says WHETHER metadata was removed, which is the part a reader can use', () => {
    const rec = recordCustody(withExif, accepted());
    expect(rec.removed).toContain('APP1');
    expect(rec.bytesRemovedBand).toBeGreaterThan(0);
  });
});
