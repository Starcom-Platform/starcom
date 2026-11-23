import type { PublishResponse } from '../../services/exchange/PublishAdapter';

/**
 * What the Exchange says once a package is sent (plan item 9.3).
 *
 * It showed a green "Package published" when no relay took the announcement,
 * with the failure as an afterthought. A package whose announcement reached no
 * relay is not published, and says so, though it is readable on IPFS by anyone
 * holding its address, which it says too.
 */
export function exchangeOutcome(res: PublishResponse): { severity: 'success' | 'warning' | 'info'; text: string } {
  const where = res.url ? ` at ${res.url}` : '';
  if (res.nostrPublished === true) {
    const n = res.relaysOk ?? 0;
    return { severity: 'success', text: `Published: announced on ${n} relay${n === 1 ? '' : 's'}. The package is on IPFS${where}.` };
  }
  if (res.nostrPublished === false) {
    return {
      severity: 'warning',
      text: `Not published: no relay took the announcement${res.nostrError ? ` (${res.nostrError})` : ''}. `
        + `The package was stored on IPFS${where}, where anyone holding that address can read it.`,
    };
  }
  return { severity: 'info', text: `Stored on IPFS${where}. Whether it was announced was not reported.` };
}
