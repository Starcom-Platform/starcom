/**
 * Uplink's fetch broker, its rules (decision D-EX, EX32, W10a): a public site the person allowed, read
 * without their cookies, GET or HEAD, within a size cap and a pace per site; never their own network,
 * never Starcom itself, however the address is written.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { SITE_FETCH, addressProblem, describeFetched, fetchProblem, paceWait, readCapped, siteAllowed, sitePattern } from '../uplink/siteFetch';

const hostOf = (url: string) => new URL(url).hostname;

describe('addressProblem', () => {
  it('refuses the person\'s own network, however the address is written', () => {
    for (const url of [
      'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://10.0.0.8/', 'http://172.16.4.1/', 'http://172.31.255.1/',
      'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/', 'http://0.0.0.0/', 'http://224.0.0.1/',
      'http://[::1]/', 'http://[::]/', 'http://[fd00::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[64:ff9b::a00:1]/',
      'http://localhost:5210/', 'http://api.localhost/', 'http://printer.local/', 'http://router.lan/', 'http://nas.home.arpa/', 'http://intranet/',
    ]) expect(addressProblem(hostOf(url)), url).toMatch(/private|local|internet/);
  });

  it('allows public sites and addresses', () => {
    for (const url of ['https://example.com/', 'https://8.8.8.8/', 'http://172.32.0.1/', 'https://[2606:4700:4700::1111]/', 'https://sub.example.co.uk/'])
      expect(addressProblem(hostOf(url)), url).toBeNull();
  });

  it('leaves Starcom\'s own pages to Starcom', () => {
    expect(addressProblem('starcom.app')).toMatch(/Starcom/);
    expect(addressProblem('www.starcom.app')).toMatch(/Starcom/);
  });
});

describe('fetchProblem', () => {
  it('takes a public web address, GET by default, within the limits', () => {
    expect(fetchProblem({ url: 'https://example.com/a?b=1' })).toEqual({
      request: { url: 'https://example.com/a?b=1', method: 'GET', timeoutMs: SITE_FETCH.timeoutMs, maxBytes: SITE_FETCH.maxBytes },
    });
    expect(fetchProblem({ url: 'https://example.com/', method: 'HEAD', accept: 'application/json', timeoutMs: 99_000, maxBytes: 99_000_000 })).toEqual({
      request: { url: 'https://example.com/', method: 'HEAD', accept: 'application/json', timeoutMs: SITE_FETCH.maxTimeoutMs, maxBytes: SITE_FETCH.hardMaxBytes },
    });
  });

  it('refuses what is not one public page read plainly', () => {
    const problems = [
      { url: 'file:///etc/passwd' }, { url: 'data:text/plain,hi' }, { url: 'ftp://example.com/' }, { url: 'not a url' }, { url: 42 },
      { url: 'https://user:secret@example.com/' }, { url: 'http://192.168.1.1/' }, { url: 'https://starcom.app/app' },
      { url: 'https://example.com/', method: 'POST' }, { url: 'https://example.com/', accept: 'text/html\r\nCookie: a=b' },
      { url: `https://example.com/${'a'.repeat(2100)}` },
    ].map((args) => fetchProblem(args));
    for (const p of problems) expect(p).toHaveProperty('problem');
  });
});

describe('siteAllowed', () => {
  it('reads only a site the person allowed: that site, its subdomains when asked so, or every site', () => {
    expect(siteAllowed('https://example.com/a', ['https://example.com/*'])).toBe(true);
    expect(siteAllowed('https://example.com:8443/a', ['https://example.com/*'])).toBe(true);
    expect(siteAllowed('https://www.example.com/', ['https://example.com/*'])).toBe(false);
    expect(siteAllowed('https://www.example.com/', ['https://*.example.com/*'])).toBe(true);
    expect(siteAllowed('https://example.com/', ['https://*.example.com/*'])).toBe(true);
    expect(siteAllowed('https://badexample.com/', ['https://*.example.com/*'])).toBe(false);
    expect(siteAllowed('http://example.com/', ['https://example.com/*'])).toBe(false);
    expect(siteAllowed('http://example.com/', ['https://*/*', 'http://*/*'])).toBe(true);
    expect(siteAllowed('https://example.com/', ['https://starcom.app/*'])).toBe(false);
    expect(siteAllowed('https://example.com/', [])).toBe(false);
  });

  it('asks for one site by its pattern', () => {
    expect(sitePattern('https://www.example.com:8443/a?b')).toBe('https://www.example.com/*');
  });
});

describe('paceWait', () => {
  it('keeps a gap between two reads of one site', () => {
    expect(paceWait(undefined, 5_000)).toBe(0);
    expect(paceWait(4_600, 5_000)).toBe(SITE_FETCH.gapMs - 400);
    expect(paceWait(1_000, 5_000)).toBe(0);
  });
});

describe('readCapped', () => {
  const stream = (chunks: number[]) => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (next === undefined) controller.close(); else controller.enqueue(new Uint8Array(next).fill(7));
      },
      cancel() { cancelled = true; },
    });
    return { body, cancelled: () => cancelled };
  };

  it('keeps the whole body under the cap', async () => {
    const { body } = stream([3, 4]);
    const read = await readCapped(body, 10);
    expect(read).toMatchObject({ size: 7, truncated: false });
    expect(read.bytes).toHaveLength(7);
  });

  it('stops at the cap, says it was cut, and stops reading', async () => {
    const s = stream([6, 6, 6, 6]);
    const read = await readCapped(s.body, 10);
    expect(read).toMatchObject({ size: 10, truncated: true });
    expect(s.cancelled()).toBe(true);
  });

  it('reads a HEAD answer, which has no body, as empty', async () => {
    expect(await readCapped(null, 10)).toMatchObject({ size: 0, truncated: false });
  });
});

describe('describeFetched', () => {
  it('says the status, the size, and where a redirect ended', () => {
    const fetched = { status: 200, statusText: 'OK', headers: {}, body: '', finalUrl: 'https://www.example.com/', redirected: true, elapsedMs: 80, bytes: 2_048, truncated: true, sha256: 'a'.repeat(64) };
    expect(describeFetched(fetched)).toBe('200, 2.0 KB, cut at the cap, ended at www.example.com');
  });
});
