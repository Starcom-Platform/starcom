import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { retentionOf } from '../assetRetention';
// The build-side twin: this is the module the freshness guard fails on and the
// health endpoint publishes from.
import { ASSETS, retention as retentionMjs } from '../../../../../scripts/lib/assetProvenance.mjs';

/**
 * The rule "can anyone still obtain the bytes this claim came from" exists in
 * two implementations, because it is needed on both sides of a build boundary.
 * Two implementations of one rule is the arrangement this project distrusts
 * everywhere else, so it gets the same treatment: run both against the real
 * committed assets and fail if they ever disagree.
 *
 * Without this, drift is silent and its symptom is the worst kind — Starcom
 * publishing a claim about its own reliability that its own gate contradicts.
 */
describe('asset retention: the app and the build agree', () => {
  const dir = path.join(process.cwd(), 'public', 'data');
  const present = (ASSETS as { file: string; label: string }[])
    .map((a) => ({ ...a, full: path.join(dir, a.file) }))
    .filter((a) => fs.existsSync(a.full));

  it('has assets to check — a vacuous pass here would hide the drift it exists to catch', () => {
    expect(present.length).toBeGreaterThan(0);
  });

  for (const a of present) {
    it(`agrees on ${a.label}`, () => {
      const asset = JSON.parse(fs.readFileSync(a.full, 'utf8'));
      expect(retentionOf(asset)).toBe((retentionMjs as (x: unknown) => { state: string })(asset).state);
    });
  }

  it('classifies a source with neither an archive nor a dated url as UNREPRODUCIBLE', () => {
    const orphan = { snapshot: '2026-08-22', sourceUrl: 'https://example.org/latest.json' };
    expect(retentionOf(orphan)).toBe('UNREPRODUCIBLE');
    expect((retentionMjs as (x: unknown) => { state: string })(orphan).state).toBe('UNREPRODUCIBLE');
  });

  it('reads a dated url as reproducible without needing our own copy', () => {
    const dated = { snapshot: '2026-08-22', sourceUrl: 'https://example.org/2026-08-22/set.json' };
    expect(retentionOf(dated)).toBe('upstream-dated');
    expect((retentionMjs as (x: unknown) => { state: string })(dated).state).toBe('upstream-dated');
  });
});
