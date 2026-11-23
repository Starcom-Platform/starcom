/**
 * The build profile (D-CS, CS1, CS13): the commercial build uses only what the source register allows. The ratchet at
 * the end holds the code to it: every source a commercial build may not use is either gated where it is drawn, by a
 * sourceAllowed('<id>') call, or named below as not yet gated, and that list may only shrink.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildProfile, restrictedSources, sourceAllowed } from '../buildProfile';
import { SOURCE_REGISTER } from '../sourceRegister';

afterEach(() => { delete process.env.VITE_BUILD_PROFILE; });

describe('the build profile', () => {
  it('is non-commercial unless the commercial build is asked for by name', () => {
    expect(buildProfile()).toBe('noncommercial');
    process.env.VITE_BUILD_PROFILE = 'commercial';
    expect(buildProfile()).toBe('commercial');
    process.env.VITE_BUILD_PROFILE = 'Commercial ';
    expect(buildProfile()).toBe('noncommercial');
  });

  it('lets the non-commercial build use every source, and the commercial build only what the register allows', () => {
    for (const s of SOURCE_REGISTER) {
      expect(sourceAllowed(s.id, 'noncommercial')).toBe(true);
      const usable = ['allowed', 'person-key', 'infrastructure', 'per-item'].includes(s.commercial);
      expect(sourceAllowed(s.id, 'commercial'), s.id).toBe(usable);
    }
  });

  it('leaves the Smithsonian volcanoes out of the commercial build until their terms are confirmed for it', () => {
    expect(sourceAllowed('gvp', 'noncommercial')).toBe(true);
    expect(sourceAllowed('gvp', 'commercial')).toBe(false);
  });

  it('refuses an id the register does not know', () => {
    expect(() => sourceAllowed('noSuchSource')).toThrow(/not in the source register/);
  });

  it('lists the restricted sources with the files baked from them', () => {
    const ids = restrictedSources().map((s) => s.id);
    expect(ids).toContain('starCatalogue');
    expect(restrictedSources().find((s) => s.id === 'starCatalogue')!.files).toContain('public/data/sky/sky-mag6.json');
    expect(ids).not.toContain('noaa');
  });
});

/**
 * Restricted sources not yet gated where they are drawn (CS1's wiring, step by step). Remove an id when its gate lands;
 * the test fails if a listed id is already gated, so the list cannot go stale.
 */
const NOT_YET_GATED = new Set([
  // Cyber-Earth's dark base, the globe's default look: its replacement needs a rendered comparison first.
  'googleDataArts',
]);

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
  return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
});

describe('the commercial build is gated where each source is drawn', () => {
  const code = sources('src').filter((p) => !p.startsWith(join('src', 'legal'))).map((p) => readFileSync(p, 'utf8')).join('\n');
  const gated = (id: string) => new RegExp(`sourceAllowed\\(\\s*['"]${id}['"]`).test(code);

  it('gates every restricted source, or names it as not yet gated', () => {
    const missing = restrictedSources().map((s) => s.id).filter((id) => !gated(id) && !NOT_YET_GATED.has(id));
    expect(missing).toEqual([]);
  });

  it('names as not yet gated only sources still ungated and still restricted', () => {
    const restricted = new Set(restrictedSources().map((s) => s.id));
    expect([...NOT_YET_GATED].filter((id) => gated(id) || !restricted.has(id))).toEqual([]);
  });
});
