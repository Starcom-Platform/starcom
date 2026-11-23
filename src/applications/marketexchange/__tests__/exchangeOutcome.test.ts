import { describe, it, expect } from 'vitest';
import { exchangeOutcome } from '../exchangeOutcome';

/*
 * What the Exchange says after a package is sent (plan item 9.3). It showed a
 * green "Package published" when no relay took the announcement, with the
 * failure as an afterthought.
 */
describe('exchangeOutcome', () => {
  it('says published, and on how many relays, when the announcement was taken', () => {
    expect(exchangeOutcome({ id: 'pkg-1', url: 'https://ipfs.io/ipfs/Qm1', nostrPublished: true, relaysOk: 3 })).toEqual({
      severity: 'success',
      text: 'Published: announced on 3 relays. The package is on IPFS at https://ipfs.io/ipfs/Qm1.',
    });
    expect(exchangeOutcome({ id: 'pkg-1', nostrPublished: true, relaysOk: 1 }).text).toBe('Published: announced on 1 relay. The package is on IPFS.');
  });

  it('says not published when no relay took it, and that the package is readable on IPFS all the same', () => {
    expect(exchangeOutcome({ id: 'pkg-2', url: 'https://ipfs.io/ipfs/Qm2', nostrPublished: false, nostrError: 'no relays reachable' })).toEqual({
      severity: 'warning',
      text: 'Not published: no relay took the announcement (no relays reachable). '
        + 'The package was stored on IPFS at https://ipfs.io/ipfs/Qm2, where anyone holding that address can read it.',
    });
  });

  it('claims nothing it was not told', () => {
    expect(exchangeOutcome({ id: 'pkg-3', url: 'ipfs://pkg-3' })).toEqual({
      severity: 'info',
      text: 'Stored on IPFS at ipfs://pkg-3. Whether it was announced was not reported.',
    });
  });
});
