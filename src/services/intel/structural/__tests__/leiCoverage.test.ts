import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseLeiCoverageAsset, loadLeiCoverageFindings, LEI_COVERAGE_ASSET_URL } from '../leiCoverageSource';
import { buildLeiCoverageFindings, buildForeignParentageFindings, IncompleteRegisterError, type SnapshotProvenance } from '../structuralFindings';
import { explainAttestationWeight } from '../../findings/deriveAttestationWeight';

const BOUNDING = 'Every company at each shared registered address that holds a Legal Entity Identifier, '
  + 'counted by intersecting the Companies House register snapshot of 2026-08-01 and every LEI in the '
  + 'GLEIF Global LEI Index golden copy of 2026-08-22. Dated 2026-08-01, the older of the inputs.';

const PROV: SnapshotProvenance = {
  bounding: BOUNDING, complete: true, snapshot: '2026-08-01',
  source: 'Company registers joined to GLEIF', addressTerm: 'registered address',
};

const ENTRIES = [{
  addressLine1: '71-75 SHELTON STREET', postcode: 'WC2H 9JQ',
  register: 'Companies House register', registerSnapshot: '2026-08-01',
  companyCount: 86035, leiHolderCount: 3,
  leiHolders: ['02100855', '00686734', 'SC303142'],
}];

const NOW = () => new Date('2026-08-24T00:00:00.000Z');

const asset = (over: Record<string, unknown> = {}) => ({
  entries: ENTRIES, bounding: BOUNDING, complete: true,
  snapshot: '2026-08-01', source: 'Company registers joined to GLEIF',
  addressTerm: 'registered address', ...over,
});
const respond = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 404, json: async () => body }) as unknown as typeof fetch;

describe('LEI coverage as a joined enumeration', () => {
  it('ages from the STALER of the two snapshots', () => {
    /**
     * The decision this claim turns on. A joined count is only as current as
     * its oldest input, so a fresh LEI index intersected with last quarter's
     * register describes last quarter. Ageing from the fresher one would
     * publish a claim as newer than the evidence behind it.
     */
    const [f] = buildLeiCoverageFindings(ENTRIES, PROV, { now: NOW });
    const w = explainAttestationWeight(f, { now: new Date('2026-08-24T00:00:00.000Z') });

    expect(f.method.observedTo).toBe('2026-08-01T00:00:00.000Z');
    // 23 days from the register snapshot, not 2 from the LEI index.
    expect(w.ageDays).toBeCloseTo(23, 0);
  });

  it('is weighed as a census, not as agreement between two registers', () => {
    // An LEI issuer validates against the very register being joined here, so
    // agreement between them would be echo. sourceCount stays 1.
    const [f] = buildLeiCoverageFindings(ENTRIES, PROV, { now: NOW });

    expect(f.method.parameters.matchedBy).toBe('enumeration');
    expect(f.method.sourceCount).toBe(1);
    expect(explainAttestationWeight(f, { now: NOW() }).corroboration).toBe(1);
  });

  it('commits to the matched registration numbers without publishing them', () => {
    const [f] = buildLeiCoverageFindings(ENTRIES, PROV, { now: NOW });

    expect(f.method.enumeratedSetDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(f)).not.toContain('SC303142');
  });

  it('says what holding an LEI does NOT mean', () => {
    // The count separates active financial entities from dormant ones, which
    // is exactly the inference a reader would otherwise make unaided.
    const [f] = buildLeiCoverageFindings(ENTRIES, PROV, { now: NOW });

    expect(f.method.criteria).toContain('does not mean the company trades');
    expect(f.method.criteria).toContain('not evidence of wrongdoing');
    expect(f.method.criteria).toContain('two complete enumerations');
  });

  it('refuses an incomplete population', () => {
    expect(() => buildLeiCoverageFindings(ENTRIES, { ...PROV, complete: false }))
      .toThrow(IncompleteRegisterError);
  });

  it('REFUSES a boundary that does not name both joined snapshots', () => {
    // A reader who did not know this was a join would read the count as a
    // property of the register alone.
    const r = parseLeiCoverageAsset(asset({ bounding: 'Every company at each shared registered address.' }));
    expect('error' in r && r.error).toMatch(/both joined snapshots/);
  });

  it('treats a missing completeness flag as not complete', () => {
    const { complete: _drop, ...withoutFlag } = asset();
    expect('error' in parseLeiCoverageAsset(withoutFlag)).toBe(true);
  });

  it('builds findings through the loader and reads the committed path by default', async () => {
    const f = respond(asset());
    const found = await loadLeiCoverageFindings(f);

    expect(found).toHaveLength(1);
    expect(f).toHaveBeenCalledWith(LEI_COVERAGE_ASSET_URL);
  });

  it('returns nothing rather than publishing from a refused asset', async () => {
    await expect(loadLeiCoverageFindings(respond(asset({ complete: false })))).resolves.toEqual([]);
    await expect(loadLeiCoverageFindings(respond(null, false))).resolves.toEqual([]);
  });
});

describe('foreign parentage, the thing no register can express', () => {
  const WITH_PARENTS = [{
    ...ENTRIES[0], companyCount: 130, leiHolderCount: 56,
    leiHolders: Array.from({ length: 56 }, (_, i) => String(900000 + i)),
    foreignParentedCount: 17,
    foreignParented: Array.from({ length: 17 }, (_, i) => String(900000 + i)),
    parentJurisdictions: ['MH'],
  }];

  it('counts against the LEI HOLDERS, not against every company at the address', () => {
    /**
     * The honesty the whole claim rests on. About 1% of companies at a UK
     * formation-agent address hold an LEI, so counting 17 against 130 would
     * tell a reader the other 113 have no foreign parent — when nothing is
     * known about them at all.
     */
    const [f] = buildForeignParentageFindings(WITH_PARENTS, PROV, { now: NOW });

    expect(f.method.criteria).toContain('17 of the 56 companies');
    expect(f.method.criteria).not.toContain('17 of the 130');
  });

  it('says explicitly what is NOT known about the rest', () => {
    const [f] = buildForeignParentageFindings(WITH_PARENTS, PROV, { now: NOW });

    expect(f.method.criteria).toContain('74 companies at this address hold no LEI');
    expect(f.method.criteria).toContain('not a statement that they have no foreign parent');
    expect(f.method.criteria).toContain('not evidence of wrongdoing');
  });

  it('publishes NO claim where nothing foreign was found, rather than a zero', () => {
    // "None" and "none visible" are different statements, and with most
    // companies outside the LEI system only the second one is true.
    const none = [{ ...WITH_PARENTS[0], foreignParentedCount: 0, foreignParented: [], parentJurisdictions: [] }];

    expect(buildForeignParentageFindings(none, PROV, { now: NOW })).toEqual([]);
  });

  it('names the jurisdictions, because that is the fact rather than "foreign"', () => {
    const [f] = buildForeignParentageFindings(WITH_PARENTS, PROV, { now: NOW });
    const v = f.claim.value as { count: number; jurisdictions: string[] };

    expect(v).toEqual({ count: 17, jurisdictions: ['MH'] });
    expect(f.method.criteria).toContain('(MH)');
  });

  it('commits to the matched companies without publishing them', () => {
    const [f] = buildForeignParentageFindings(WITH_PARENTS, PROV, { now: NOW });

    expect(f.method.enumeratedSetDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(f)).not.toContain('900001');
  });

  it('refuses an incomplete population', () => {
    expect(() => buildForeignParentageFindings(WITH_PARENTS, { ...PROV, complete: false }))
      .toThrow(IncompleteRegisterError);
  });
});

describe('against the real committed coverage asset', () => {
  const p = path.join(process.cwd(), 'public/data/lei-coverage.json');
  const real = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;

  it('exists, is complete, and is dated to its oldest input', () => {
    expect(real).not.toBeNull();
    expect(real.complete).toBe(true);
    // The join dates cannot be newer than any register it joined.
    for (const r of real.registers) expect(real.snapshot <= r.snapshot).toBe(true);
    expect(real.snapshot <= real.gleifSnapshot).toBe(true);
  });

  it('never claims more LEI holders than companies at an address', () => {
    for (const e of real.entries) {
      expect(e.leiHolderCount).toBeLessThanOrEqual(e.companyCount);
      expect(e.leiHolders).toHaveLength(e.leiHolderCount);
      expect(new Set(e.leiHolders).size).toBe(e.leiHolderCount);
    }
  });
});
