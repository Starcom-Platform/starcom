/**
 * The page scan reads through the app's one fetch slot (D-EX, EX32): with Starcom Uplink, in a plain
 * browser, it gets the target's own headers and says which route it came through, with a purpose that
 * names the site, as Uplink's window and activity log show it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ calls: [] as Array<{ url: string; purpose: string }> }));
vi.mock('../../../../extension/siteFetcher', () => ({
  siteFetcher: async () => ({
    via: 'uplink',
    fetch: async (url: string, purpose: string) => {
      route.calls.push({ url, purpose });
      return {
        ok: true, status: 200, statusText: 'OK', body: '<html><head><title>Flood board</title></head><body></body></html>',
        headers: { 'content-type': 'text/html', 'strict-transport-security': 'max-age=63072000' },
        finalUrl: url, redirects: [], elapsedMs: 30, bytes: 64, truncated: false,
      };
    },
  }),
}));

import { WebsiteScannerService } from '../WebsiteScanner';

afterEach(() => { route.calls.length = 0; });

describe('WebsiteScannerService, its route to the page', () => {
  it('reads through Uplink in a browser: the target\'s own headers, the route named, the site in the purpose', async () => {
    const result = await new WebsiteScannerService().scanWebsite('https://flood.example.org/board', undefined, { storeIntel: false });
    expect(route.calls).toEqual([{ url: 'https://flood.example.org/board', purpose: 'NetRunner page scan you started, of flood.example.org' }]);
    expect(result.metadata).toMatchObject({ statusCode: 200, fetchedVia: 'uplink', headers: { 'strict-transport-security': 'max-age=63072000' } });
    // Read from the real headers: the one sent is not reported missing, one not sent is.
    const titles = result.vulnerabilities.map((v) => v.title);
    expect(titles).not.toContain('Missing strict-transport-security');
    expect(titles).toContain('Missing content-security-policy');
  });
});
