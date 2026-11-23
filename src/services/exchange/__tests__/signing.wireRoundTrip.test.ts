/**
 * The manifest digest must agree on both sides of the trip every package makes.
 *
 * ─── A GENUINE PACKAGE WAS REFUSED, AND AN OPTIONAL FIELD CAUSED IT ────────
 *
 * stableStringify built the canonical form with Object.entries, which INCLUDES
 * a key whose value is `undefined` — and JSON.stringify(undefined) returns the
 * JS value undefined, which interpolates as the text "undefined". So a manifest
 * carrying `visibility: undefined` hashed as
 *
 *   {"id":"p",...,"visibility":undefined}
 *
 * while the same manifest received over the wire had lost that key (JSON drops
 * undefined-valued properties) and hashed without it. Different digest, failed
 * signature, genuine package refused.
 *
 * Nothing hit this while every manifest field was required. Making ONE field
 * optional was enough — and it presented as four verifier tests failing on
 * "accepts a genuine round trip", pointing nowhere near the digest.
 *
 * These are the tests that would have caught it directly.
 */
import { describe, it, expect } from 'vitest';
import { createEd25519Signer, verifyManifestSignature } from '../signing';
import type { PackageManifest } from '../types';

const base = (over: Partial<PackageManifest> = {}): PackageManifest => ({
  id: 'pkg-1',
  name: 'Package',
  version: '1.0.0',
  description: 'd',
  createdAt: new Date(0).toISOString(),
  author: 'author',
  license: 'OPEN',
  reports: [],
  intel: [],
  assets: [],
  metadata: {},
  ...over,
});

/** What actually happens to a manifest between publish and receipt. */
const overTheWire = (m: PackageManifest): PackageManifest =>
  JSON.parse(JSON.stringify(m)) as PackageManifest;

const sign = createEd25519Signer('11'.repeat(32));

describe('a signed manifest survives the wire', () => {
  it('verifies when an optional field is explicitly undefined', async () => {
    // The exact shape that broke it: the key is PRESENT with value undefined.
    const signed = await sign(base({ visibility: undefined }));
    expect(await verifyManifestSignature(overTheWire(signed))).toBe(true);
  });

  it('verifies when the optional field is absent entirely', async () => {
    const signed = await sign(base());
    expect(await verifyManifestSignature(overTheWire(signed))).toBe(true);
  });

  it('verifies when the optional field carries a real value', async () => {
    const signed = await sign(base({ visibility: 'limited' }));
    expect(await verifyManifestSignature(overTheWire(signed))).toBe(true);
  });

  /**
   * Read-tolerance, asserted rather than assumed. A package produced before
   * the wire field was renamed carries `classification` and no `visibility`;
   * the digest walks the keys it finds, so it still verifies. This is what
   * makes the interchange change safe to land ahead of Navcom's side.
   */
  it('verifies a manifest produced by an older build, carrying a legacy key', async () => {
    const legacy = { ...base(), classification: 'SECRET' } as unknown as PackageManifest;
    const signed = await sign(legacy);
    expect(await verifyManifestSignature(overTheWire(signed))).toBe(true);
  });

  /** The property must not have been bought by weakening tamper detection. */
  it('still refuses a manifest altered after signing', async () => {
    const signed = await sign(base({ visibility: 'private' }));
    const tampered = { ...overTheWire(signed), visibility: 'public' as const };
    expect(await verifyManifestSignature(tampered)).toBe(false);
  });

  it('still refuses a manifest whose optional field was REMOVED after signing', async () => {
    const signed = await sign(base({ visibility: 'private' }));
    const stripped = overTheWire(signed) as Record<string, unknown>;
    delete stripped.visibility;
    expect(await verifyManifestSignature(stripped as unknown as PackageManifest)).toBe(false);
  });
});
