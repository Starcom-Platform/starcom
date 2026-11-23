/**
 * The asset-freshness guard has to be able to notice an asset is gone.
 *
 * It printed "ABSENT" and continued without touching its failure counter, so
 * its entire subject could vanish while it reported success: deleting
 * public/data/gleif.json produced "ABSENT GLEIF Global LEI Index" followed by
 * "Asset freshness guard passed" and exit 0. Deleting all four did the same.
 *
 * That is not a cosmetic miscount. Recency is DERIVED from these snapshot
 * dates, so a missing asset means every claim built on it is weighted from a
 * date nothing read — an asserted weight wearing a derived one's clothes.
 *
 * The guard resolves public/data from process.cwd(), so the fixture is simply a
 * directory we built, and the script under test is the one that ships.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const FILES = ['companies-house.json', 'psc-control.json', 'brreg.json', 'gleif.json'];

/** Today, so age never trips the staleness thresholds and only presence is under test. */
const fresh = () => JSON.stringify({
  source: 'fixture',
  snapshot: new Date().toISOString().slice(0, 10),
  records: [],
});

const withAll = (): Record<string, string> =>
  Object.fromEntries(FILES.map((f) => [`public/data/${f}`, fresh()]));

describe('guard-asset-freshness', () => {
  it('passes when every asset is present and current', () => {
    const run = runGuardIn('guard-asset-freshness.mjs', withAll());
    expect(run.status).toBe(0);
  });

  it('FAILS when one asset is missing', () => {
    const files = withAll();
    delete files['public/data/gleif.json'];
    const run = runGuardIn('guard-asset-freshness.mjs', files);
    expect(run.status).toBe(1);
    expect(run.output).toContain('ABSENT');
  });

  it('FAILS when every asset is missing, rather than having nothing to complain about', () => {
    // The shape that made this worth writing: with no assets at all there were
    // no rows to fail, so the guard congratulated itself on an empty directory.
    const run = runGuardIn('guard-asset-freshness.mjs', { 'public/data/.keep': '' });
    expect(run.status).toBe(1);
  });

  it('still fails an asset that will not say when it was taken', () => {
    // The neighbouring rule, asserted so a fix to one cannot quietly drop the
    // other: a source with no snapshot date cannot be published at all.
    const files = withAll();
    files['public/data/brreg.json'] = JSON.stringify({ source: 'fixture', records: [] });
    const run = runGuardIn('guard-asset-freshness.mjs', files);
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/no usable snapshot date/i);
  });
});
