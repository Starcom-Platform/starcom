import { describe, it, expect, vi } from 'vitest';
import { parsePscAsset, loadControlFindings, PSC_ASSET_URL } from '../pscSource';
import fs from 'node:fs';
import path from 'node:path';

const BOUNDING = 'Every corporate entity named as a PSC in the Companies House PSC snapshot of '
  + '2026-08-22 (all 32 parts), whose filed registration number normalises to a UK company number. '
  + 'EXCLUDES individual PSCs, which the register does not identify stably enough to count across '
  + 'companies, and excludes super-secure PSCs.';

const asset = (over: Record<string, unknown> = {}) => ({
  controllers: [{
    registrationNumber: '07168188',
    nameVariants: 1,
    companyCount: 188,
    companyNumbers: Array.from({ length: 188 }, (_, i) => String(20000000 + i)),
  }],
  bounding: BOUNDING,
  complete: true,
  snapshot: '2026-08-22',
  source: 'Companies House PSC register',
  ...over,
});

const respond = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 404, json: async () => body }) as unknown as typeof fetch;

describe('reading the PSC control asset', () => {
  it('accepts a complete asset that states its boundary and exclusions', () => {
    expect('provenance' in parsePscAsset(asset())).toBe(true);
  });

  it('treats a MISSING completeness flag as not complete', () => {
    const { complete: _drop, ...withoutFlag } = asset();
    expect('error' in parsePscAsset(withoutFlag)).toBe(true);
  });

  it('REJECTS a boundary that does not state the individual exclusion', () => {
    // The exclusion is load-bearing. A reader who assumed the count covered
    // every PSC would read every number wrong, and the boundary is the only
    // place that can tell them otherwise.
    const r = parsePscAsset(asset({ bounding: 'Every PSC in the snapshot of 2026-08-22, all 32 parts.' }));
    expect('error' in r && r.error).toMatch(/individual PSCs are excluded/);
  });

  it('rejects a partial asset', () => {
    expect('error' in parsePscAsset(asset({ complete: false }))).toBe(true);
  });

  it('builds a control finding weighed as a census', async () => {
    const [f] = await loadControlFindings(respond(asset()));

    expect(f.method.parameters.matchedBy).toBe('enumeration');
    expect(f.claim.attribute).toBe('companiesControlledAsCorporatePsc');
    // The SUBJECT is the registration number, not a name: names vary by filing
    // and would split one controller across several replaceable slots.
    expect(f.claim.subjectRef).toBe('07168188');
    expect(f.claim.value).toBe(188);
  });

  it('says plainly that this is what was declared, not who benefits', async () => {
    const [f] = await loadControlFindings(respond(asset()));

    expect(f.method.criteria).toContain('not evidence of wrongdoing');
    expect(f.method.criteria).toContain('not the same as who ultimately benefits');
  });

  it('returns nothing rather than publishing from an incomplete asset', async () => {
    await expect(loadControlFindings(respond(asset({ complete: false })))).resolves.toEqual([]);
  });

  it('returns nothing rather than throwing when the asset is absent', async () => {
    await expect(loadControlFindings(respond(null, false))).resolves.toEqual([]);
  });

  it('reads the committed asset path by default', async () => {
    const f = respond(asset());
    await loadControlFindings(f);
    expect(f).toHaveBeenCalledWith(PSC_ASSET_URL);
  });
});

describe('against the real committed PSC asset', () => {
  const assetPath = path.join(process.cwd(), 'public/data/psc-control.json');
  const asset = fs.existsSync(assetPath) ? JSON.parse(fs.readFileSync(assetPath, 'utf8')) : null;

  it('exists and covers the whole snapshot', () => {
    expect(asset).not.toBeNull();
    expect(asset.complete).toBe(true);
    expect(asset.partsScanned).toHaveLength(asset.totalParts);
    expect(asset.stats.records).toBeGreaterThan(15_000_000);
  });

  it('carries NO filed name anywhere in it', () => {
    // The guard that matters. The corporate PSC name field frequently holds a
    // person's name, so a committed asset containing names would publish
    // private individuals as controlling thousands of companies — regardless
    // of what the claim text chooses to render.
    const blob = JSON.stringify(asset.controllers);
    expect(blob).not.toMatch(/[A-Z]{3,}/);
    for (const c of asset.controllers.slice(0, 200)) {
      expect(c).not.toHaveProperty('namesAsFiled');
      expect(typeof c.nameVariants).toBe('number');
    }
  });

  it('excluded far more individuals than it counted corporates', () => {
    // Records the scale of the refusal, so shrinking it is visible.
    expect(asset.stats.individual).toBeGreaterThan(asset.stats.corporate * 5);
    expect(asset.stats.superSecure).toBeGreaterThan(0);
  });

  it('every controller meets the floor and lists as many companies as it counts', () => {
    for (const c of asset.controllers) {
      expect(c.companyCount).toBeGreaterThanOrEqual(asset.minCompanies);
      expect(c.companyNumbers).toHaveLength(c.companyCount);
    }
  });

  it('every registration number is a UK company number, never a sentinel', () => {
    for (const c of asset.controllers) {
      expect(c.registrationNumber).toMatch(/^([0-9]{8}|[A-Z]{2}[0-9]{6})$/);
      expect(c.registrationNumber).not.toMatch(/^0+$/);
    }
  });
});
