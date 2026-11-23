/**
 * Starcom's own implementation, run against the PUBLISHED vectors.
 *
 * scripts/conformance-mission.mjs proves the vectors match the spec, by
 * reimplementing the rules from the prose with no Starcom code imported. That
 * says nothing about whether Starcom itself still agrees with either.
 *
 * This closes the triangle: spec ↔ vectors ↔ implementation. A second node
 * (Mecha Jono) implementing from the spec and testing against the vectors is
 * only interoperable with Starcom if Starcom passes them too.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Event as NostrEvent } from 'nostr-tools';
import { verifyGrantChain } from '../missionCapability';
import { verifyManifestSignature } from '../../../exchange/signing';
import { validateManifest } from '../../../exchange/schema';
import type { PackageManifest } from '../../../exchange/types';
import type { MissionUI } from '../../../../types/intel/MissionUI';
import { buildMissionPackageManifest } from '../../MissionPackageBuilder';
import { profileTags } from '../../packageProfile';

const DIR = 'docs/spec/mission-vectors';

interface CapabilityVector {
  name: string;
  description: string;
  rootIssuer: string;
  resource: string;
  action: 'dispatch';
  chain: NostrEvent[];
  expect: { valid: boolean; reason?: string; holder: string };
}

interface ManifestVector {
  name: string;
  description: string;
  /** The whole mission it was built from, and the author it was built for. */
  mission: MissionUI;
  author: string;
  expect: {
    manifest: Record<string, unknown>; canonical: string; digest: string;
    /** The profile's tags, as the event carries them; absent on a refused vector. */
    tags?: string[][];
    /** The cause a refused vector is refused for: a profile a conforming builder never emits. */
    refused?: string;
  };
}

/**
 * The signature half, added with spec rev 9.
 *
 * A third shape rather than a variant of ManifestVector: these carry the
 * manifest at the top level WITH its signature block, because the thing under
 * test is the block's encoding rather than the redaction rules.
 */
interface SignatureVector {
  name: string;
  description: string;
  manifest: PackageManifest;
  canonicalJson: string;
  digestHex: string;
  expect: { valid: boolean; reason?: string };
}

const all = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Record<string, unknown>);

// The directory holds both halves of the contract: who may dispatch, and what
// gets dispatched. Partition on shape rather than filename so a new vector is
// picked up without touching this file.
const vectors = all.filter((v) => Array.isArray(v.chain)) as unknown as CapabilityVector[];
const manifests = all.filter((v) => (v.expect as { manifest?: unknown })?.manifest) as unknown as ManifestVector[];
const signatures = all.filter((v) => v.manifest) as unknown as SignatureVector[];

describe('published mission vectors, against Starcom\'s own verifier', () => {
  it('finds vectors of both kinds — an empty directory must not read as a pass', () => {
    expect(vectors.length).toBeGreaterThan(8);
    expect(manifests.length).toBeGreaterThan(4);
    expect(signatures.length).toBeGreaterThanOrEqual(4);
    // Every file must be classified; an unrecognised shape would silently skip.
    // This assertion caught the signature vectors being added as a third shape,
    // which is exactly what it is for.
    expect(vectors.length + manifests.length + signatures.length).toBe(all.length);
  });

  /**
   * The encoding half: hex and base64 are both conforming and Starcom must
   * accept both, permanently.
   *
   * The two `-holds` vectors are the SAME signature in two spellings. A
   * verifier that reads only the encoding it emits passes one and fails the
   * other — the defect that refused a genuine package in silence for three
   * spec revisions. Passing one of them is not conformance.
   */
  for (const s of signatures) {
    it(`${s.expect.valid ? 'accepts' : 'refuses'} ${s.name}`, async () => {
      const ok = await verifyManifestSignature(s.manifest);
      expect(ok, s.description).toBe(s.expect.valid);
    });
  }

  it('publishes both encodings of one signature, not two different ones', () => {
    const hex = signatures.find((s) => s.name === 'manifest-signature-hex-holds');
    const b64 = signatures.find((s) => s.name === 'manifest-signature-base64-holds');
    expect(hex).toBeDefined();
    expect(b64).toBeDefined();
    // If a regeneration made these different signatures, a hex-only verifier
    // could pass both and the pair would stop testing anything.
    expect(hex?.digestHex).toBe(b64?.digestHex);
    expect(hex?.canonicalJson).toBe(b64?.canonicalJson);
  });

  for (const v of vectors) {
    it(`${v.expect.valid ? 'accepts' : 'refuses'} ${v.name}`, () => {
      const result = verifyGrantChain(v.chain, {
        resource: v.resource,
        action: v.action,
        holder: v.expect.holder,
        rootIssuer: v.rootIssuer,
      });
      expect(result.ok, `${v.description}\n  verifier said: ${result.reason ?? 'ok'}`)
        .toBe(v.expect.valid);
    });
  }

  /**
   * The manifest half: Starcom must still produce exactly the bytes it
   * published as the contract. A redaction rule quietly relaxing, or key
   * ordering drifting, shows up here as a digest mismatch.
   */
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  };

  /*
   * Until rev 11 this compared each vector only with itself, so the builder
   * drifted for five weeks unseen: the vectors still showed `classification`,
   * no asks, and "Starcom" as author. Now each is built again from its mission.
   */
  for (const m of manifests.filter((v) => !v.expect.refused)) {
    it(`still emits the published manifest for ${m.name}`, () => {
      expect(canonical(m.expect.manifest), m.description).toBe(m.expect.canonical);
      // As it crosses the wire: JSON, where an absent field has no key.
      const built: PackageManifest = JSON.parse(JSON.stringify({
        ...buildMissionPackageManifest(m.mission, m.author), id: 'pkg-vector', createdAt: '2026-01-15T00:00:00.000Z',
      }));
      expect(canonical(built), m.description).toBe(m.expect.canonical);
      expect(profileTags(built.profile)).toEqual(m.expect.tags);
    });
  }

  for (const m of manifests.filter((v) => v.expect.refused)) {
    it(`refuses ${m.name}, a profile no conforming builder emits`, () => {
      const shape = validateManifest(m.expect.manifest);
      expect(shape.valid, m.description).toBe(false);
      expect(shape.valid === false && shape.errors.join('; ')).toMatch(/^profile/);
    });
  }

  /**
   * The cause, not merely the verdict.
   *
   * Two implementations that reject the same chain for different reasons have
   * not agreed on the rule — they agreed on the outcome by coincidence. The
   * reference runner already asserts causes; now Starcom is held to the same
   * bar, which is what makes the vectors a contract rather than a smoke test.
   */
  for (const v of vectors.filter((x) => !x.expect.valid && x.expect.reason)) {
    it(`refuses ${v.name} for the published cause`, () => {
      const result = verifyGrantChain(v.chain, {
        resource: v.resource, action: v.action,
        holder: v.expect.holder, rootIssuer: v.rootIssuer,
      });
      expect(result.ok).toBe(false);
      expect(result.code, `${v.description}\n  human reason: ${result.reason}`)
        .toBe(v.expect.reason);
    });
  }

  it('every refusal carries both a code and a human sentence', () => {
    // The code is for machines and stays stable; the sentence is for an
    // operator and may be reworded. Neither substitutes for the other.
    for (const v of vectors.filter((x) => !x.expect.valid)) {
      const result = verifyGrantChain(v.chain, {
        resource: v.resource, action: v.action,
        holder: v.expect.holder, rootIssuer: v.rootIssuer,
      });
      expect(result.code, v.name).toBeTruthy();
      expect(result.reason, v.name).toBeTruthy();
    }
  });
});
