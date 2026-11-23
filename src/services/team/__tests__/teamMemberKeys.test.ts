/**
 * The real half of what CyberTeamManager called a "secure team".
 *
 * That component generated genuine ML-KEM and ML-DSA keypairs and then wrapped
 * them in metadata asserting DID verification, threshold cryptography and a
 * clearance level — none of which ran. verifyTeamCreatorDID was
 * `return true; // Mock verification`.
 *
 * These tests pin what was extracted and, as importantly, what was not.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { generateTeamMemberKeys } from '../teamMemberKeys';

describe('generateTeamMemberKeys', () => {
  it('produces both a KEM and a signature public key', async () => {
    const keys = await generateTeamMemberKeys();
    expect(keys.kemPublicKey.length).toBeGreaterThan(0);
    expect(keys.sigPublicKey.length).toBeGreaterThan(0);
    expect(keys.kemPublicKey).not.toBe(keys.sigPublicKey);
  });

  it('produces different keys every time', async () => {
    // A fixed key across members would make every member's identity the same
    // identity, which is the failure a mocked keygen would produce silently.
    const a = await generateTeamMemberKeys();
    const b = await generateTeamMemberKeys();
    expect(a.kemPublicKey).not.toBe(b.kemPublicKey);
    expect(a.sigPublicKey).not.toBe(b.sigPublicKey);
  });

  it('records when they were generated, so age can be judged by the reader', async () => {
    const keys = await generateTeamMemberKeys();
    expect(Number.isNaN(Date.parse(keys.keyGeneratedAt))).toBe(false);
  });

  it('claims NOTHING it did not establish', async () => {
    /**
     * The point of the extraction. The original returned
     * securityClearanceVerified: true, didVerified from a function that always
     * returned true, a hardcoded tssSignature, and securityLevel:
     * 'QUANTUM_SAFE' — four assertions about security properties nothing
     * checked. Weight is derived from method and age; these keys disclose the
     * method and the age and stop there.
     */
    const keys = await generateTeamMemberKeys();
    for (const forbidden of [
      'verified', 'securityClearanceVerified', 'didVerified',
      'securityLevel', 'tssSignature', 'clearance',
    ]) {
      expect(keys).not.toHaveProperty(forbidden);
    }
    expect(Object.keys(keys).sort()).toEqual(['kemPublicKey', 'keyGeneratedAt', 'sigPublicKey']);
  });
});
