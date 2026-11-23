/**
 * Share handle v22, as published: a card can carry a QR code, when a shot asks
 * (`card.qr`, IM13, IM30–IM32), and says where it is (`regions.qr`) and what
 * it opens (`provenance.qr`).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v22', () => {
  it('is at version 22', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(22);
  });

  it('builds a shot\'s QR code', () => {
    expect(SHARE_HANDLE_CONTRACT.shot.built).toContain('card.qr');
    expect(SHARE_HANDLE_CONTRACT.shot.notBuilt).not.toContain('card.qr');
  });
});
