/**
 * The Exchange publishes only a Public package (plan item 0.4).
 *
 * Every package goes to IPFS, where anyone holding the address can read it,
 * and to the intel relays. The review showed a package's distribution and then
 * published it there whatever it said. A package that is not Public is now
 * refused before anything is shown or sent, with the reason.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const publish = vi.fn(async () => ({ id: 'pub-1', url: 'https://example.test/p/pub-1' }));
vi.mock('../../exchange/PublishAdapter', () => ({ publishAdapter: { publish: (...a: unknown[]) => publish(...(a as [])) } }));

import { reviewExchangePackage } from '../exchange';
import { currentReview, decideReview } from '../publishReview';
import type { PackageManifest } from '../../exchange/types';

const manifest = (visibility?: PackageManifest['visibility']) =>
  ({ id: 'pkg-1', name: 'Newark food banks', assets: [], reports: [], ...(visibility ? { visibility } : {}) }) as unknown as PackageManifest;

afterEach(async () => {
  publish.mockClear();
  for (let i = 0; i < 50 && currentReview(); i++) {
    decideReview(currentReview()!.id, false);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

describe('the Exchange', () => {
  it('refuses a Limited package, says why, and shows and sends nothing', async () => {
    await expect(reviewExchangePackage(manifest('limited'))).rejects.toThrow(/only a Public package/);
    expect(currentReview()).toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });

  it('refuses a Private package the same way', async () => {
    await expect(reviewExchangePackage(manifest('private'))).rejects.toThrow(/only a Public package/);
  });

  it('refuses a package nobody has decided on', async () => {
    await expect(reviewExchangePackage(manifest())).rejects.toThrow(/Nobody has decided who may receive this package/);
  });

  it('reviews a Public package, to IPFS and the public relays', async () => {
    const outcome = reviewExchangePackage(manifest('public'));
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
    expect(currentReview()!.destinations[0]).toEqual({ address: 'IPFS', kind: 'ipfs' });
    decideReview(currentReview()!.id, false);
    expect(await outcome).toBeNull();
  });
});
