/**
 * What Starcom Uplink does with a message from the app (decision D-EX, E0): it answers starcom.app
 * alone, asks the person before reaching any site, never reaches their own network, and writes every
 * request to the activity log with its purpose and outcome.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import type { ActivityEntry, Capture } from '../protocol';
import type { SiteFetchRequest } from '../uplink/siteFetch';
import { ACTIVITY_KEPT, ALL_SITES, handleToUplink, isStarcomPage, isStarcomPattern, originProblem, starcomSenderUrl, withEntry, type UplinkHost } from '../uplink/handlers';
import { uplinkEn } from '../../i18n/uplink/en';
import uplinkUk from '../../i18n/uplink/locales/uk';

function host(over: Partial<UplinkHost> = {}, granted: string[] = [], waiting: Capture[] = []) {
  const log: ActivityEntry[] = [];
  const inbox = { count: -1 };
  const asked: Array<{ origins: string[]; purpose: string; purposeInEnglish?: string }> = [];
  const fetched: SiteFetchRequest[] = [];
  const told: { language?: string } = {};
  const h: UplinkHost = {
    readCaptures: async () => waiting,
    setInboxCount: async (count) => { inbox.count = count; },
    readInboxCount: async () => Math.max(inbox.count, 0),
    rememberLanguage: async (language) => { told.language = language; },
    words: async () => uplinkEn,
    readCaptureFile: async (id, name) => (id === 'ev1' && name === 'text.txt' ? 'VGhlIHJpdmVyIHJvc2Uu' : null),
    releaseCaptures: async (ids) => {
      const before = waiting.length;
      waiting.splice(0, waiting.length, ...waiting.filter((c) => !ids.includes(c.id)));
      return before - waiting.length;
    },
    version: '0.1.0',
    now: () => 1_000,
    readActivity: async () => log,
    appendActivity: async (e) => { log.push(e); },
    grantedOrigins: async () => granted,
    askToGrant: async (origins, purpose, purposeInEnglish) => { asked.push({ origins, purpose, ...(purposeInEnglish ? { purposeInEnglish } : {}) }); granted.push(...origins); return 'granted'; },
    fetchSite: async (request) => { fetched.push(request); return { fetched: { ...ANSWER, finalUrl: request.url } }; },
    ...over,
  };
  return { h, log, asked, granted, waiting, inbox, fetched, told };
}
const ANSWER = { status: 200, statusText: 'OK', headers: { server: 'nginx' }, body: '<html></html>', finalUrl: '', redirected: false, elapsedMs: 40, bytes: 13, truncated: false, sha256: 'a'.repeat(64) };
const STARCOM = 'https://starcom.app/app/netrunner';
const req = (capability: string, args: object, purpose = 'Scan the page this case cites') =>
  ({ kind: 'request', id: 'r1', capability, purpose, args });

describe('who Uplink answers', () => {
  it('starcom.app, and localhost while developing; no other site', () => {
    expect(isStarcomPage('https://starcom.app/')).toBe(true);
    expect(isStarcomPage('https://www.starcom.app/app/cases')).toBe(true);
    expect(isStarcomPage('http://localhost:5210/')).toBe(true);
    expect(isStarcomPage('https://starcom.app.evil.example/')).toBe(false);
    expect(isStarcomPage('http://starcom.app/')).toBe(false);
    expect(isStarcomPage(undefined)).toBe(false);
  });

  it('takes a Starcom page as asking: in its own tab, in the side panel, or framed by Uplink\'s own page; never framed by another site', () => {
    const UPLINK = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/';
    expect(starcomSenderUrl({ url: 'https://starcom.app/app/cases', tabUrl: 'https://starcom.app/app/cases' }, UPLINK)).toBe('https://starcom.app/app/cases');
    expect(starcomSenderUrl({ url: 'https://starcom.app/panel' }, UPLINK)).toBe('https://starcom.app/panel');
    expect(starcomSenderUrl({ url: 'https://starcom.app/panel', tabUrl: `${UPLINK}sidepanel.html` }, UPLINK)).toBe('https://starcom.app/panel');
    expect(starcomSenderUrl({ url: 'https://starcom.app/panel', tabUrl: 'https://evil.example/' }, UPLINK)).toBeUndefined();
    expect(starcomSenderUrl({ url: 'https://evil.example/', tabUrl: 'https://starcom.app/' }, UPLINK)).toBeUndefined();
    expect(starcomSenderUrl({ url: 'https://starcom.app/panel', tabUrl: 'chrome-extension://someoneelse/page.html' }, UPLINK)).toBeUndefined();
  });

  it('refuses a message from any other page, and says why', async () => {
    const { h } = host();
    const said = await handleToUplink({ kind: 'hello', id: 'h1', protocol: 1 }, 'https://example.com/', h);
    expect(said).toMatchObject({ ok: false, refusal: 'refused', reason: 'Uplink answers only starcom.app' });
  });

  it('says hello with its version, what it can do, and how many captures wait', async () => {
    const { h } = host({}, [], [{ id: 'c1', kind: 'page', at: '2026-10-11T21:05:00.000Z', page: { url: 'https://news.example.org/' } }]);
    const said = await handleToUplink({ kind: 'hello', id: 'h1', protocol: 1 }, STARCOM, h);
    expect(said).toMatchObject({ kind: 'hello', id: 'h1', extensionVersion: '0.1.0', protocol: 1, waiting: 1 });
    expect((said as { capabilities: unknown[] }).capabilities.length).toBeGreaterThan(0);
  });

  it('keeps the language a Starcom page shows, for its own pages, and only a language Starcom has (D-ML, ML8)', async () => {
    const { h, told } = host();
    await handleToUplink({ kind: 'hello', id: 'h1', protocol: 1, language: 'uk' }, STARCOM, h);
    expect(told.language).toBe('uk');
    await handleToUplink({ kind: 'hello', id: 'h2', protocol: 1, language: 'xx' }, STARCOM, h);
    expect(told.language).toBe('uk');
    await handleToUplink({ kind: 'hello', id: 'h3', protocol: 1, language: 'de' }, 'https://example.com/', h);
    expect(told.language).toBe('uk');
    // A language longer than any tag is not a hello at all.
    await expect(handleToUplink({ kind: 'hello', id: 'h4', protocol: 1, language: 'x'.repeat(40) }, STARCOM, h)).resolves.toBeNull();
  });

  it('hands its window the purpose and, said in another language, its English to show beneath (D-ML, ML9)', async () => {
    const { h, asked } = host();
    await handleToUplink({ ...req('permissions.request', { origins: ['https://example.org/*'] }, 'Lesen Sie den Registereintrag'), purposeInEnglish: 'Read the registry record' }, STARCOM, h);
    expect(asked).toEqual([{ origins: ['https://example.org/*'], purpose: 'Lesen Sie den Registereintrag', purposeInEnglish: 'Read the registry record' }]);
    // An English purpose that is not plain words is not a request at all.
    await expect(handleToUplink({ ...req('permissions.request', { origins: ['https://example.org/*'] }, 'Lesen Sie den Registereintrag'), purposeInEnglish: '<b>x</b> and more' }, STARCOM, h)).resolves.toBeNull();
  });

  it('gives the person its reasons in its own language (D-ML, L5)', async () => {
    const { h } = host({ askToGrant: async () => 'declined', words: async () => uplinkUk });
    const said = await handleToUplink(req('permissions.request', { origins: ['https://example.org/*'] }), STARCOM, h);
    expect(said).toMatchObject({ ok: false, refusal: 'declined', reason: 'ви не дозволили' });
  });

  it('ignores what is not ours', async () => {
    const { h } = host();
    await expect(handleToUplink({ kind: 'request', id: 'r', capability: 'cookies.read', purpose: 'Read the cookies here', args: {} }, STARCOM, h)).resolves.toBeNull();
  });
});

describe('reaching a site', () => {
  it('asks the person, with the purpose, and logs that they allowed it', async () => {
    const { h, asked, log } = host();
    const said = await handleToUplink(req('permissions.request', { origins: ['https://example.com/*'] }), STARCOM, h);
    expect(asked).toEqual([{ origins: ['https://example.com/*'], purpose: 'Scan the page this case cites' }]);
    expect(said).toMatchObject({ ok: true, result: { granted: ['https://example.com/*'] } });
    expect(log).toEqual([{ at: 1_000, capability: 'permissions.request', purpose: 'Scan the page this case cites', target: 'https://example.com/*', outcome: 'ok' }]);
  });

  it('records a "no" as declined, not as a failure', async () => {
    const { h, log } = host({ askToGrant: async () => 'declined' });
    const said = await handleToUplink(req('permissions.request', { origins: ['https://example.com/*'] }), STARCOM, h);
    expect(said).toMatchObject({ ok: false, refusal: 'declined' });
    expect(log[0].outcome).toBe('declined');
  });

  it('never asks for the person\'s own network, or for a pattern that is not one site', async () => {
    for (const [pattern, why] of [
      ['http://192.168.1.1/*', 'private network'], ['https://localhost/*', 'private network'], ['http://10.0.0.5/*', 'private network'],
      ['https://intranet/*', 'not a site on the internet'], ['<all_urls>', 'not one site'], ['https://*/*', 'not one site'],
    ]) {
      expect(originProblem(pattern), pattern).toContain(why);
    }
    expect(originProblem('https://*.example.com/*')).toBeNull();
    const { h, asked } = host();
    const said = await handleToUplink(req('permissions.request', { origins: ['https://example.com/*', 'http://192.168.0.1/*'] }), STARCOM, h);
    expect(said).toMatchObject({ ok: false, refusal: 'refused' });
    expect(asked).toEqual([]);
  });

  it('asks for every site only as power mode, whole', async () => {
    const { h, asked } = host();
    await handleToUplink(req('permissions.request', { origins: [...ALL_SITES] }), STARCOM, h);
    expect(asked[0].origins).toEqual([...ALL_SITES]);
    const status = await handleToUplink(req('permissions.status', {}), STARCOM, h);
    expect(status).toMatchObject({ ok: true, result: { allSites: true } });
  });
});

describe('what it says it may reach', () => {
  it('leaves out Starcom\'s own pages, which the bridge runs on: a site counts once the person allows it', async () => {
    const { h } = host({}, ['https://starcom.app/*', 'https://www.starcom.app/*', 'http://localhost/*', 'http://127.0.0.1/*', 'https://example.com/*']);
    const said = await handleToUplink(req('permissions.status', {}), STARCOM, h);
    expect(said).toMatchObject({ ok: true, result: { granted: ['https://example.com/*'], allSites: false } });
    expect(isStarcomPattern('https://starcom.app/*')).toBe(true);
    expect(isStarcomPattern('https://example.com/*')).toBe(false);
  });
});

describe('the activity log', () => {
  it('reads back what was asked, and keeps the newest when it is full', async () => {
    const { h } = host({}, ['https://example.com/*']);
    await handleToUplink(req('permissions.status', {}), STARCOM, h);
    const said = await handleToUplink(req('activity.read', { limit: 10 }, 'Show the activity log'), STARCOM, h);
    expect(said).toMatchObject({ ok: true });
    expect((said as { result: { entries: ActivityEntry[] } }).result.entries.map((e) => e.capability)).toEqual(['permissions.status']);
    let full: ActivityEntry[] = [];
    // Each a different line: the same use again within a minute would share one (see signer.test.ts).
    for (let i = 0; i < ACTIVITY_KEPT + 5; i++) full = withEntry(full, { at: i, capability: 'activity.read', purpose: 'Show the activity log', target: `entry ${i}`, outcome: 'ok' });
    expect(full).toHaveLength(ACTIVITY_KEPT);
    expect(full[0].at).toBe(5);
  });
});

describe('captures waiting for Starcom (E2)', () => {
  const capture = (id: string): Capture => ({ id, kind: 'selection', at: '2026-10-11T21:05:00.000Z', page: { url: 'https://news.example.org/' }, text: 'The river rose.' });

  it('hands Starcom what waits, and keeps it until Starcom says it is kept', async () => {
    const { h, waiting, log } = host({}, [], [capture('a'), capture('b')]);
    const said = await handleToUplink(req('captures.read', {}, 'Keep what you captured in your cases'), STARCOM, h);
    expect(said).toMatchObject({ ok: true, result: { captures: [{ id: 'a' }, { id: 'b' }] } });
    expect(waiting).toHaveLength(2);
    expect(log.at(-1)).toMatchObject({ capability: 'captures.read', outcome: 'ok', detail: '2 captures' });
  });

  it('lets go of only what Starcom kept, and refuses anything but a list of ids', async () => {
    const { h, waiting } = host({}, [], [capture('a'), capture('b')]);
    const said = await handleToUplink(req('captures.kept', { ids: ['a'] }, 'Keep what you captured in your cases'), STARCOM, h);
    expect(said).toMatchObject({ ok: true, result: { released: 1 } });
    expect(waiting.map((c) => c.id)).toEqual(['b']);
    for (const ids of [undefined, 'a', [1], Array.from({ length: 501 }, (_, i) => `x${i}`)]) {
      expect(await handleToUplink(req('captures.kept', { ids }, 'Keep what you captured in your cases'), STARCOM, h))
        .toMatchObject({ ok: false, refusal: 'refused' });
    }
    expect(waiting.map((c) => c.id)).toEqual(['b']);
  });
});

describe('the count of captures to file, on Uplink\'s icon (W7)', () => {
  it('keeps the count Starcom says, and refuses one that is not a count', async () => {
    const { h, inbox, log } = host();
    expect(await handleToUplink(req('inbox.count', { count: 3 }, 'Show on the icon how many captures wait to be filed'), STARCOM, h))
      .toMatchObject({ ok: true });
    expect(inbox.count).toBe(3);
    expect(log.at(-1)).toMatchObject({ capability: 'inbox.count', outcome: 'ok', detail: '3 to file' });
    for (const count of [-1, 1.5, '3', undefined, 1_000_001]) {
      expect(await handleToUplink(req('inbox.count', { count }, 'Show on the icon how many captures wait to be filed'), STARCOM, h))
        .toMatchObject({ ok: false, refusal: 'refused' });
    }
    expect(inbox.count).toBe(3);
  });
});

describe('an evidence capture\'s files (W8)', () => {
  it('hands Starcom one file at a time, says "found nothing" for one it does not hold, and refuses a name it never makes', async () => {
    const { h, log } = host();
    expect(await handleToUplink(req('captures.file', { id: 'ev1', name: 'text.txt' }, 'Keep what you sent from your browser in your cases'), STARCOM, h))
      .toMatchObject({ ok: true, result: { base64: 'VGhlIHJpdmVyIHJvc2Uu' } });
    expect(log.at(-1)).toMatchObject({ capability: 'captures.file', outcome: 'ok', target: 'ev1 text.txt' });
    expect(await handleToUplink(req('captures.file', { id: 'ev9', name: 'text.txt' }, 'Keep what you sent from your browser in your cases'), STARCOM, h))
      .toMatchObject({ ok: false, refusal: 'not-found' });
    expect(await handleToUplink(req('captures.file', { id: 'ev1', name: '../secrets' }, 'Keep what you sent from your browser in your cases'), STARCOM, h))
      .toMatchObject({ ok: false, refusal: 'refused' });
  });
});

describe('reading a site for NetRunner (W10a, EX32)', () => {
  const PURPOSE = 'NetRunner page scan you started, of example.com';

  it('reads a site the person allowed, plainly, and logs what came back', async () => {
    const { h, log, fetched } = host({}, ['https://example.com/*']);
    expect(await handleToUplink(req('site.fetch', { url: 'https://example.com/about' }, PURPOSE), STARCOM, h))
      .toMatchObject({ ok: true, result: { status: 200, headers: { server: 'nginx' }, finalUrl: 'https://example.com/about' } });
    expect(fetched).toEqual([{ url: 'https://example.com/about', method: 'GET', timeoutMs: 15_000, maxBytes: 2 * 1024 * 1024 }]);
    expect(log.at(-1)).toMatchObject({ capability: 'site.fetch', purpose: PURPOSE, target: 'https://example.com/about', outcome: 'ok', detail: '200, 13 B' });
  });

  it('says "not allowed" for a site the person has not allowed, and does not touch it', async () => {
    const { h, log, fetched, asked } = host({}, ['https://other.example/*']);
    expect(await handleToUplink(req('site.fetch', { url: 'https://example.com/' }, PURPOSE), STARCOM, h))
      .toMatchObject({ ok: false, refusal: 'not-granted' });
    expect(fetched).toEqual([]);
    expect(asked).toEqual([]);
    expect(log.at(-1)).toMatchObject({ capability: 'site.fetch', outcome: 'not-granted', target: 'https://example.com/' });
  });

  it('never reads the person\'s own network, even in power mode', async () => {
    const { h, fetched } = host({}, [...ALL_SITES]);
    for (const url of ['http://192.168.1.1/', 'http://localhost:8080/', 'http://[::1]/', 'https://starcom.app/'])
      expect(await handleToUplink(req('site.fetch', { url }, PURPOSE), STARCOM, h)).toMatchObject({ ok: false, refusal: 'refused' });
    expect(fetched).toEqual([]);
    expect(await handleToUplink(req('site.fetch', { url: 'https://example.com/' }, PURPOSE), STARCOM, h)).toMatchObject({ ok: true });
  });

  it('says "could not reach" when the site did not answer, never "found nothing"', async () => {
    const { h, log } = host({ fetchSite: async () => ({ failed: 'no answer within 15 s' }) }, ['https://example.com/*']);
    expect(await handleToUplink(req('site.fetch', { url: 'https://example.com/' }, PURPOSE), STARCOM, h))
      .toMatchObject({ ok: false, refusal: 'unreachable', reason: 'no answer within 15 s' });
    expect(log.at(-1)).toMatchObject({ outcome: 'unreachable', detail: 'no answer within 15 s' });
  });
});

