import { describe, it, expect, vi } from 'vitest';
import { parseRegisterAsset, loadStructuralFindings, REGISTER_ASSET_URL, REGISTER_ASSET_URLS } from '../registerSource';

const asset = (over: Record<string, unknown> = {}) => ({
  clusters: [{
    addressLine1: '124 CITY ROAD', postcode: 'EC1V 2NX',
    companyNumbers: Array.from({ length: 60 }, (_, i) => String(i)),
    companyCount: 60, activeCount: 58,
    firstIncorporated: '2018-12-28', lastIncorporated: '2024-01-05',
  }],
  bounding: 'Every company in EC1V, complete register snapshot 2026-08-01 (all 7 parts).',
  complete: true,
  snapshot: '2026-08-01',
  source: 'Companies House',
  ...over,
});

const respond = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 404, json: async () => body }) as unknown as typeof fetch;

describe('reading the register asset', () => {
  it('accepts an asset that states its boundary and asserts completeness', () => {
    const r = parseRegisterAsset(asset());
    expect('provenance' in r).toBe(true);
  });

  it('treats a MISSING completeness flag as not complete', () => {
    // The critical case. Assets written before the flag existed were partial
    // scans (1 part of 7) that asserted completeness in prose — the exact bug
    // the flag was added to catch. Defaulting absence to `true` would restore it.
    const { complete: _drop, ...withoutFlag } = asset();
    const r = parseRegisterAsset(withoutFlag);
    expect('error' in r && r.error).toMatch(/does not assert completeness/);
  });

  it('rejects an asset that claims completeness without stating a boundary', () => {
    const r = parseRegisterAsset(asset({ bounding: '  ' }));
    expect('error' in r && r.error).toMatch(/states no boundary/);
  });

  it('rejects a partial asset even when it states a boundary', () => {
    const r = parseRegisterAsset(asset({ complete: false }));
    expect('error' in r).toBe(true);
  });

  it('builds findings from a good asset', async () => {
    // One register named explicitly: the default reads every committed one.
    const f = await loadStructuralFindings(respond(asset()), ['/data/companies-house.json']);
    expect(f).toHaveLength(1);
    expect(f[0].method.parameters.matchedBy).toBe('enumeration');
  });

  it('returns nothing rather than throwing when the asset is absent', async () => {
    await expect(loadStructuralFindings(respond(null, false), ['/data/companies-house.json'])).resolves.toEqual([]);
  });

  it('returns nothing rather than publishing from an incomplete asset', async () => {
    // The refusal must survive the whole path, not just the pure function:
    // the loader swallows errors so one bad asset cannot take the workbench
    // down, and the risk of that shape is that it also swallows the refusal.
    await expect(loadStructuralFindings(respond(asset({ complete: false })), ['/data/companies-house.json'])).resolves.toEqual([]);
  });

  it('reads every committed register, not just the first', async () => {
    const f = respond(asset());
    await loadStructuralFindings(f);
    for (const url of REGISTER_ASSET_URLS) expect(f).toHaveBeenCalledWith(url);
    expect(REGISTER_ASSET_URLS).toContain(REGISTER_ASSET_URL);
  });

  it('one register being absent does not suppress another', async () => {
    // Each carries its own boundary and completeness verdict, so a second
    // jurisdiction going missing must not take the first down with it.
    const f = vi.fn(async (url: string) => (url.includes('brreg')
      ? { ok: false, status: 404, json: async () => null }
      : { ok: true, status: 200, json: async () => asset() })) as unknown as typeof fetch;

    const found = await loadStructuralFindings(f, ['/data/companies-house.json', '/data/brreg.json']);

    expect(found).toHaveLength(1);
  });

  it('one register being REFUSED does not suppress another', async () => {
    const f = vi.fn(async (url: string) => ({
      ok: true, status: 200,
      json: async () => (url.includes('brreg') ? asset({ complete: false }) : asset()),
    })) as unknown as typeof fetch;

    const found = await loadStructuralFindings(f, ['/data/companies-house.json', '/data/brreg.json']);

    expect(found).toHaveLength(1);
  });

  it("uses each register's own term for the address it holds", async () => {
    // Companies House records a "registered office"; Enhetsregisteret records
    // a "registered business address". Borrowing one jurisdiction's term for
    // another's record describes a filing that does not exist there.
    const [f] = await loadStructuralFindings(
      respond(asset({ addressTerm: 'registered business address' })), ['/data/brreg.json']);

    expect(f.method.criteria).toContain('registered business address');
    expect(f.method.criteria).not.toContain('registered office');
  });
});
