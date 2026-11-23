/**
 * The contact a direct message from a stranger opens its window with (plan
 * item 9.9). It was filled with a verification nobody made: "web-of-trust",
 * verified by the local operator, trusted at 0.6. A stranger's contact now
 * claims no verification; one a person added by hand says they vouched for
 * it. Starcom scores nobody (refusal R-6).
 */
import { describe, it, expect } from 'vitest';
import { contactForKey } from '../contactForKey';

const KEY = 'd'.repeat(64);

describe('contactForKey', () => {
  it("a stranger's contact claims no verification and no score", () => {
    const contact = contactForKey(KEY, 'Dan', { vouched: false });
    expect(contact.verifiedIdentity).toMatchObject({ verificationMethod: 'none', verifiedBy: '' });
    expect(contact).not.toHaveProperty('trustScore');
    expect(contact).not.toHaveProperty('reputation');
    expect(contact.isEarthAllianceVerified).toBe(false);
  });

  it('a contact a person added by hand says that person vouched for it, and scores it no more', () => {
    const contact = contactForKey(KEY, 'Priya', { vouched: true });
    expect(contact.verifiedIdentity).toMatchObject({ verificationMethod: 'web-of-trust', verifiedBy: 'local-operator' });
    expect(contact).not.toHaveProperty('trustScore');
    expect(contact).not.toHaveProperty('reputation');
  });
});
