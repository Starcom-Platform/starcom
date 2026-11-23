/**
 * The app's one way to read another site (decision D-EX, EX32, W10b): the desktop app's fetch when it
 * is there, else Uplink's, asking for the site at first use; else none, said plainly. Uplink's answer
 * arrives in the desktop's shape, so the tools that read it need no second path.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SiteFetched, UplinkAnswer } from '../protocol';
import { asNativeResponse, fetchThroughUplink, siteFetcher } from '../siteFetcher';
import * as uplink from '../useStarcomUplink';

const FETCHED: SiteFetched = {
  status: 200, statusText: 'OK', headers: { 'content-security-policy': "default-src 'self'" }, body: '<html></html>',
  finalUrl: 'https://www.example.com/', redirected: true, elapsedMs: 50, bytes: 13, truncated: false, sha256: 'b'.repeat(64),
};
const ok = (result: unknown) => ({ kind: 'answer', id: 'x', ok: true, result }) as UplinkAnswer;
const no = (refusal: string, reason: string) => ({ kind: 'answer', id: 'x', ok: false, refusal, reason }) as UplinkAnswer;
const PURPOSE = 'NetRunner page scan you started, of example.com';

afterEach(() => {
  vi.restoreAllMocks();
  delete window.starcomNative;
});

describe('siteFetcher', () => {
  it('prefers the desktop app when it is there', async () => {
    const fetch = vi.fn(async () => ({ ...asNativeResponse(FETCHED) }));
    window.starcomNative = { isNative: true, fetch } as never;
    const fetcher = await siteFetcher();
    expect(fetcher?.via).toBe('desktop');
    await fetcher!.fetch('https://example.com/', PURPOSE, { timeoutMs: 20_000 });
    expect(fetch).toHaveBeenCalledWith({ url: 'https://example.com/', timeoutMs: 20_000 });
  });

  it('uses Uplink when it is connected and reads sites', async () => {
    vi.spyOn(uplink, 'uplinkNow').mockReturnValue({ status: 'connected', hello: { kind: 'hello', id: 'h', extensionVersion: '0.2.0', protocol: 1, capabilities: [{ id: 'site.fetch', ready: true }] } });
    expect((await siteFetcher())?.via).toBe('uplink');
  });

  it('is none when neither is there, or Uplink is too old to read sites', async () => {
    vi.spyOn(uplink, 'checkUplink').mockResolvedValue();
    const now = vi.spyOn(uplink, 'uplinkNow').mockReturnValue({ status: 'absent' });
    expect(await siteFetcher()).toBeNull();
    now.mockReturnValue({ status: 'connected', hello: { kind: 'hello', id: 'h', extensionVersion: '0.1.0', protocol: 1, capabilities: [{ id: 'captures.read', ready: true }] } });
    expect(await siteFetcher()).toBeNull();
  });
});

describe('fetchThroughUplink', () => {
  it('asks for the site at first use, then reads it', async () => {
    const asked: string[] = [];
    const answers = [no('not-granted', 'example.com is not among the sites you allowed'), ok({ granted: ['https://example.com/*'] }), ok(FETCHED)];
    const ask = vi.fn(async (capability: string, purpose: string, args: unknown) => { asked.push(`${capability} ${JSON.stringify(args)} | ${purpose}`); return answers.shift()!; });
    const response = await fetchThroughUplink('https://example.com/', PURPOSE, { timeoutMs: 20_000 }, ask as never);
    expect(asked).toEqual([
      `site.fetch {"url":"https://example.com/","timeoutMs":20000} | ${PURPOSE}`,
      `permissions.request {"origins":["https://example.com/*"]} | ${PURPOSE}`,
      `site.fetch {"url":"https://example.com/","timeoutMs":20000} | ${PURPOSE}`,
    ]);
    expect(response).toMatchObject({ ok: true, status: 200, headers: FETCHED.headers, body: '<html></html>', finalUrl: 'https://www.example.com/' });
  });

  it('says why when the person declines, or the site could not be reached, and never reads as found-nothing', async () => {
    const declined = [no('not-granted', 'not allowed'), no('declined', 'you did not allow it')];
    await expect(fetchThroughUplink('https://example.com/', PURPOSE, {}, (async () => declined.shift()!) as never))
      .rejects.toThrow('You declined: you did not allow it');
    await expect(fetchThroughUplink('https://example.com/', PURPOSE, {}, (async () => no('unreachable', 'no answer within 15 s')) as never))
      .rejects.toThrow('Could not reach it: no answer within 15 s');
  });
});

describe('asNativeResponse', () => {
  it('gives Uplink\'s answer in the desktop\'s shape; a redirect names only where it ended, all a browser says', () => {
    expect(asNativeResponse(FETCHED)).toEqual({
      ok: true, status: 200, statusText: 'OK', headers: FETCHED.headers, body: '<html></html>',
      finalUrl: 'https://www.example.com/', redirects: ['https://www.example.com/'], elapsedMs: 50, bytes: 13, truncated: false,
    });
    expect(asNativeResponse({ ...FETCHED, status: 404, redirected: false })).toMatchObject({ ok: false, redirects: [] });
  });
});
