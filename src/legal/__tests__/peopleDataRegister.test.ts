/**
 * The people's data register (D-CS, CS5) names every file that uses the browser's storage. A new store that no entry
 * names fails here, so what Starcom keeps about people cannot grow unrecorded.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PEOPLE_DATA_REGISTER } from '../peopleDataRegister';

/** Tests, test set-up, and the registers themselves, which describe storage rather than use it. */
const NOT_THE_APP = /__tests__|\.test\.|\.spec\.|\/tests\/|\/testing\/|setupVitest|^src\/legal\//;
const STORAGE = /\b(localStorage|sessionStorage|indexedDB)\b/;
const COMMENT = /^\s*(\*|\/\/|\/\*)/;

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return sources(path);
  return /\.(ts|tsx|js)$/.test(name) && !NOT_THE_APP.test(path) ? [path] : [];
});

/** A file whose code, not only its comments, reaches the browser's storage. */
const usesStorage = (path: string) => readFileSync(path, 'utf8').split('\n').some((line) => !COMMENT.test(line) && STORAGE.test(line));

describe("the people's data register", () => {
  it("names every file that uses the browser's storage", () => {
    const named = new Set(PEOPLE_DATA_REGISTER.flatMap((e) => e.files));
    expect(sources('src').filter(usesStorage).filter((path) => !named.has(path))).toEqual([]);
  });

  it('names every file that links to an outside form, where people type their details', () => {
    const FORMS = /https:\/\/(app\.formbricks\.com|forms\.gle|docs\.google\.com\/forms|[a-z0-9-]+\.typeform\.com|tally\.so|form\.jotform\.com|forms\.office\.com|www\.surveymonkey\.com)\//;
    const named = new Set(PEOPLE_DATA_REGISTER.flatMap((e) => e.files));
    const linking = sources('src').filter((path) => FORMS.test(readFileSync(path, 'utf8')));
    expect(linking.length).toBeGreaterThan(0);
    expect(linking.filter((path) => !named.has(path))).toEqual([]);
  });

  it('names only files that exist', () => {
    expect(PEOPLE_DATA_REGISTER.flatMap((e) => e.files).filter((path) => !existsSync(path))).toEqual([]);
  });

  it('gives every entry a unique id, and says what it holds, who sees it and how long it stays', () => {
    const ids = PEOPLE_DATA_REGISTER.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of PEOPLE_DATA_REGISTER) {
      expect(e.what.length, e.id).toBeGreaterThan(20);
      expect(e.seenBy.length, e.id).toBeGreaterThan(5);
      expect(e.kept.length, e.id).toBeGreaterThan(5);
    }
  });

  it('keeps nothing about other people on the device without saying so', () => {
    for (const e of PEOPLE_DATA_REGISTER.filter((x) => x.holder === 'device' && x.subject === 'others')) {
      expect(e.finding, e.id).toBeTruthy();
    }
  });
});
