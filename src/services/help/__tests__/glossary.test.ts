/**
 * The glossary (plan item 3.2): every word the plan names is there, each
 * entry is short enough to read at a glance, and every link resolves.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { GLOSSARY, findTerms, glossaryEntry } from '../glossary';

describe('the glossary', () => {
  it("has every word the plan names: Navcom, relay, package, case position, verdict, corroboration, geohash, dispatch, Public / Limited / Private, Internal", () => {
    for (const word of ['navcom', 'relay', 'package', 'position', 'verdict', 'corroboration', 'geohash', 'dispatch', 'public', 'limited', 'private', 'internal']) {
      expect(findTerms(word)[0], word).toBeTruthy();
    }
  });

  it('keeps each one-line meaning to a glance (the house style: 20 words or fewer)', () => {
    for (const entry of GLOSSARY) expect(entry.short.split(/\s+/).length, entry.id).toBeLessThanOrEqual(20);
  });

  it('has one entry per id, and every "see also" leads somewhere', () => {
    expect(new Set(GLOSSARY.map((e) => e.id)).size).toBe(GLOSSARY.length);
    for (const entry of GLOSSARY) for (const id of entry.see ?? []) expect(glossaryEntry(id), `${entry.id} → ${id}`).toBeDefined();
  });

  it('finds a word by its other names, best match first', () => {
    expect(findTerms('npub')[0].id).toBe('key');
    expect(findTerms('limited')[0].id).toBe('visibility');
    expect(findTerms('Relay')[0].id).toBe('relay');
    expect(findTerms('zzz')).toEqual([]);
  });

  it('is what every "?" in the app points at: no <WhatIs> names a term the glossary lacks', () => {
    const src = join(process.cwd(), 'src');
    const files = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : files(path);
      return /\.tsx$/.test(entry) ? [path] : [];
    });
    const used = files(src).flatMap((path) => [...readFileSync(path, 'utf8').matchAll(/<WhatIs term="([^"]+)"/g)].map((m) => ({ file: relative(src, path), id: m[1] })));
    expect(used.length).toBeGreaterThan(5);
    for (const { file, id } of used) expect(glossaryEntry(id), `${file}: ${id}`).toBeDefined();
  });
});
