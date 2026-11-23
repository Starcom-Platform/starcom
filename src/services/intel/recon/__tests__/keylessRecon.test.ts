/**
 * These sources are free, which makes them the tier that must work. The
 * parsing is where they go wrong quietly: a wildcard counted as a host, a TXT
 * record still wearing its quotes, or a failed lookup reported as an absent
 * record are all plausible-looking answers that are false.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  certificateTransparency,
  dnsQuery,
  dnsAcrossResolvers,
  mailPosture,
  rdapBaseFor,
  registration,
} from '../keylessRecon';

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe('certificateTransparency', () => {
  beforeEach(() => { delete (window as unknown as Record<string, unknown>).starcomNative; });
  afterEach(() => vi.restoreAllMocks());

  it('splits multi-name rows, drops wildcards, and counts certificates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([
      { name_value: 'a.example.com\nb.example.com' },
      { name_value: '*.example.com' },
      { name_value: 'a.example.com' },
    ])));

    const found = await certificateTransparency('example.com');
    // A wildcard is a fact about a certificate, not a host that exists.
    expect(found.map((f) => f.name)).toEqual(['a.example.com', 'b.example.com']);
    expect(found.find((f) => f.name === 'a.example.com')?.certificates).toBe(2);
  });
});

describe('dnsQuery', () => {
  beforeEach(() => { delete (window as unknown as Record<string, unknown>).starcomNative; });
  afterEach(() => vi.restoreAllMocks());

  it('strips quotes, which the two resolvers disagree about adding', async () => {
    // Measured against both, 2026-09-02: for the same record Cloudflare returns
    // it quoted and Google returns it bare.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ Status: 0, Answer: [{ name: 'x', type: 16, data: '"v=spf1 -all"' }] })));
    expect((await dnsQuery('example.com', 'TXT')).records).toEqual(['v=spf1 -all']);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ Status: 0, Answer: [{ name: 'x', type: 16, data: 'v=spf1 -all' }] })));
    expect((await dnsQuery('example.com', 'TXT')).records).toEqual(['v=spf1 -all']);
  });

  it('carries the resolver status rather than assuming NOERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ Status: 3 })));
    const answer = await dnsQuery('nope.invalid', 'A');
    expect(answer.status).toBe(3);
    expect(answer.records).toEqual([]);
  });
});

describe('dnsAcrossResolvers', () => {
  beforeEach(() => { delete (window as unknown as Record<string, unknown>).starcomNative; });
  afterEach(() => vi.restoreAllMocks());

  it('treats differently-ordered identical answers as agreement', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ Status: 0, Answer: [{ name: 'x', type: 1, data: '1.1.1.1' }, { name: 'x', type: 1, data: '2.2.2.2' }] }))
      .mockResolvedValueOnce(json({ Status: 0, Answer: [{ name: 'x', type: 1, data: '2.2.2.2' }, { name: 'x', type: 1, data: '1.1.1.1' }] })));

    // Resolvers rotate record order deliberately; order is not a property of
    // the zone and treating it as disagreement would cry wolf constantly.
    const result = await dnsAcrossResolvers('example.com');
    expect(result.agree).toBe(true);
  });

  it('does not mistake resolver quoting conventions for censorship', async () => {
    // The real shapes, from live measurement. Raw string comparison would call
    // this a disagreement and this module reads disagreement as evidence of
    // manipulation — a false positive on every domain with a TXT record.
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ Status: 0, Answer: [{ name: 'x', type: 16, data: 'v=spf1 -all' }] }))
      .mockResolvedValueOnce(json({ Status: 0, Answer: [{ name: 'x', type: 16, data: '"v=spf1 -all"' }] })));

    const result = await dnsAcrossResolvers('example.com', 'TXT');
    expect(result.agree).toBe(true);
  });

  it('flags genuine disagreement between independent resolvers', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ Status: 0, Answer: [{ name: 'x', type: 1, data: '1.1.1.1' }] }))
      .mockResolvedValueOnce(json({ Status: 0, Answer: [{ name: 'x', type: 1, data: '9.9.9.9' }] })));

    const result = await dnsAcrossResolvers('example.com');
    expect(result.agree).toBe(false);
    expect(result.answers).toHaveLength(2);
  });

  it('does not claim agreement when only one resolver answered', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ Status: 0, Answer: [{ name: 'x', type: 1, data: '1.1.1.1' }] }))
      .mockRejectedValueOnce(new Error('network')));

    const result = await dnsAcrossResolvers('example.com');
    // One voice is not a consensus.
    expect(result.agree).toBe(false);
    expect(result.failures).toHaveLength(1);
  });
});

describe('mailPosture', () => {
  beforeEach(() => { delete (window as unknown as Record<string, unknown>).starcomNative; });
  afterEach(() => vi.restoreAllMocks());

  it('reports an absent DMARC as absent and a failed lookup as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ Status: 0, Answer: [{ name: 'x', type: 15, data: '10 mail.example.com.' }] }))
      .mockResolvedValueOnce(json({ Status: 0, Answer: [{ name: 'x', type: 16, data: '"v=spf1 -all"' }] }))
      .mockResolvedValueOnce(json({ Status: 0, Answer: [] })));

    const posture = await mailPosture('example.com');
    expect(posture.mx).toEqual(['10 mail.example.com.']);
    expect(posture.spf).toBe('v=spf1 -all');
    expect(posture.dmarc).toBeUndefined();
    expect(posture.notes.join(' ')).toMatch(/No DMARC record/i);
  });

  it('says posture is unknown rather than absent when MX could not be looked up', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(json({ Status: 0, Answer: [] }))
      .mockResolvedValueOnce(json({ Status: 0, Answer: [] })));

    const posture = await mailPosture('example.com');
    // "We could not look" and "there is nothing there" are different claims.
    expect(posture.notes.join(' ')).toMatch(/unknown, not absent/i);
  });
});

describe('rdapBaseFor', () => {
  const file = {
    services: [
      [['com', 'net'], ['http://rdap.verisign.example/com/v1/', 'https://rdap.verisign.example/com/v1/']],
      [['uk'], ['https://rdap.nominet.example/uk/']],
      [['example.uk'], ['https://rdap.longer.example/']],
    ] as Array<[string[], string[]]>,
  };

  it('finds the registry by the longest matching suffix, over https', () => {
    expect(rdapBaseFor('Example.COM.', file)).toBe('https://rdap.verisign.example/com/v1/');
    expect(rdapBaseFor('shop.example.uk', file)).toBe('https://rdap.longer.example/');
    expect(rdapBaseFor('other.uk', file)).toBe('https://rdap.nominet.example/uk/');
  });

  it('is none for a registry IANA lists no RDAP service for', () => {
    expect(rdapBaseFor('example.zz', file)).toBeNull();
  });
});

describe('registration', () => {
  beforeEach(() => { delete (window as unknown as Record<string, unknown>).starcomNative; });
  afterEach(() => vi.restoreAllMocks());

  const BOOTSTRAP = { services: [[['com'], ['https://rdap.verisign.example/com/v1/']]] };
  const RECORD = {
    handle: 'H-1', ldhName: 'example.com', status: ['client transfer prohibited'],
    events: [
      { eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' },
      { eventAction: 'expiration', eventDate: '2026-08-13T04:00:00Z' },
    ],
    nameservers: [{ ldhName: 'a.iana-servers.net' }],
    notices: [
      { title: 'Terms of Service', description: ['Service subject to Terms of Use.'], links: [{ href: 'https://www.verisign.example/terms' }, { href: 'javascript:alert(1)' }] },
      { description: [] },
    ],
  };
  /** IANA's bootstrap file at its address, the registry's record at its own. */
  const routed = () => vi.fn(async (url: string) => {
    if (url === 'https://data.iana.org/rdap/dns.json') return json(BOOTSTRAP);
    if (url === 'https://rdap.verisign.example/com/v1/domain/example.com') return json(RECORD);
    return { ok: false, status: 404, json: async () => ({}) };
  });

  it('extracts the dates, which are the part privacy rules do not redact', async () => {
    vi.stubGlobal('fetch', routed());
    const reg = await registration('example.com');
    expect(reg.registered).toBe('1995-08-14T04:00:00Z');
    expect(reg.expires).toBe('2026-08-13T04:00:00Z');
    expect(reg.nameservers).toEqual(['a.iana-servers.net']);
  });

  it('asks the registry itself, found from IANA\'s list, and never a third party (EX33)', async () => {
    const fetch = routed();
    vi.stubGlobal('fetch', fetch);
    await registration('example.com');
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['https://data.iana.org/rdap/dns.json', 'https://rdap.verisign.example/com/v1/domain/example.com']);
    expect(fetch.mock.calls.some((c) => String(c[0]).includes('rdap.org'))).toBe(false);
  });

  it('carries the registry\'s own terms notice, with web links only, as its terms ask of anyone passing it on', async () => {
    vi.stubGlobal('fetch', routed());
    const reg = await registration('example.com');
    expect(reg.registry).toBe('rdap.verisign.example');
    expect(reg.notices).toEqual([{ title: 'Terms of Service', text: 'Service subject to Terms of Use.', links: ['https://www.verisign.example/terms'] }]);
  });

  it('says it could not look when the registry offers no RDAP, never that it found nothing', async () => {
    vi.stubGlobal('fetch', routed());
    await expect(registration('example.zz')).rejects.toThrow('The .zz registry offers no registration (RDAP) service, by IANA\'s list');
  });
});
