/**
 * A contact's identity is checked by whether anybody verified who holds its
 * key, never by a score of the person (refusal R-6; D-MX, MX20).
 */
import { describe, it, expect } from 'vitest';
import { advancedSecurityService } from '../AdvancedSecurityService';
import type { SecureContact } from '../../types/SecurityHardening';

const contact = (verified: boolean) => ({
  id: 'k', pubkey: 'a'.repeat(64), displayName: 'Priya',
  pqcPublicKey: { algorithm: 'ML-KEM-768', keyData: new Uint8Array(0), securityLevel: 'NIST-3', createdAt: new Date(), expiresAt: new Date() },
  verifiedIdentity: { earthAllianceId: 'k', displayName: 'Priya', verificationMethod: 'none', verifiedBy: '', verificationDate: new Date(), verificationSignature: '' },
  isEarthAllianceVerified: verified,
}) as unknown as SecureContact;

describe('validating a contact', () => {
  it('says nobody has verified who holds the key, when nobody has, and asks for no score', async () => {
    const result = await advancedSecurityService.validateContact(contact(false));
    expect(result.isValid).toBe(false);
    expect(result.warnings.map((w) => w.type)).toContain('unverified_identity');
    expect(result.warnings.map((w) => w.type)).not.toContain('low_trust_score');
  });

  it('passes the identity of a verified contact', async () => {
    const result = await advancedSecurityService.validateContact(contact(true));
    expect(result.warnings.map((w) => w.type)).not.toContain('unverified_identity');
    expect(result.isValid).toBe(true);
  });
});
