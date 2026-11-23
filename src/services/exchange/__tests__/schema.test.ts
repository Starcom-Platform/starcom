import { describe, it, expect } from 'vitest';
import { PackageComposer } from '../PackageComposer';
import { validateManifest } from '../schema';

describe('schema contract', () => {
  it('accepts valid manifest', () => {
    const { manifest } = PackageComposer.compose({
      name: 'Valid',
      description: 'ok',
      license: 'OPEN',
      author: 'test',
      reports: [{ id: 'r', title: 't', content: 'c' }],
      intel: [],
    });
    const res = validateManifest(manifest);
    expect(res.valid).toBe(true);
  });

  it('rejects invalid manifest', () => {
    const bad: any = {
      id: '',
      name: '',
      version: '',
      description: '',
      author: '',
      license: 'UNKNOWN',
      reports: [],
      intel: [],
      assets: [],
      createdAt: 'not-a-date',
      metadata: {},
    };
    const res = validateManifest(bad);
    expect(res.valid).toBe(false);
    if (res.valid === false) {
      expect(res.errors.length).toBeGreaterThan(0);
    }
  });
});

/*
 * `createdAt` as the spec says it is: "ISO 8601 date-time, with Z or an offset".
 *
 * The schema used zod's bare `.datetime()`, which refuses every offset but Z.
 * Mecha Jono's first three signed packages (2026-09-25 23:17 UTC) carried
 * Python's default isoformat, `2026-09-22T01:52:33.840987+00:00`, and every one
 * was refused as a malformed manifest — by a receiver whose published spec says
 * that value is correct.
 */
describe('createdAt, as the published spec allows it', () => {
  const withCreatedAt = (createdAt: string) => {
    // The same valid compose the contract test above starts from.
    const { manifest } = PackageComposer.compose({
      name: 'Newark, DE', description: 'ok', license: 'OPEN', author: 'test',
      reports: [{ id: 'r', title: 't', content: 'c' }], intel: [],
    });
    return validateManifest({ ...manifest, createdAt });
  };

  it('accepts an offset, with microseconds, exactly as the first real packages sent it', () => {
    expect(withCreatedAt('2026-09-22T01:52:33.840987+00:00')).toEqual({ valid: true });
    expect(withCreatedAt('2026-09-22T03:52:33-05:00')).toEqual({ valid: true });
  });

  it('still accepts Z', () => {
    expect(withCreatedAt('2026-09-22T01:52:33.840Z')).toEqual({ valid: true });
  });

  it('still refuses what is not a date-time', () => {
    expect(withCreatedAt('2026-09-22').valid).toBe(false);
    expect(withCreatedAt('yesterday').valid).toBe(false);
    expect(withCreatedAt('2026-09-22T01:52:33').valid).toBe(false);
  });
});
