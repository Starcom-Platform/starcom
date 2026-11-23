/**
 * Every time Starcom shows goes through one formatter, src/utils/utcTime.ts
 * (decision D-E, step 9, docs/missions/01-architecture-decisions/time-model.md).
 *
 * This runs the record's own search, toLocale(Date|Time)?String(, over the source
 * files in src outside tests, and fails when any file but the formatter formats a
 * time that way. A file that needs a time shown uses UtcTime or the formatter, and
 * a log that needs a time writes it as ISO.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.cwd(), 'src');
const SEARCH = /toLocale(Date|Time)?String\(/;
const FORMATTER = 'utils/utcTime.ts';

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST = /\.(test|spec)\.[^.]+$/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return SOURCE.test(entry.name) && !TEST.test(entry.name) ? [full] : [];
  });
}

describe('time formatting', () => {
  it('goes through the shared formatter everywhere', () => {
    const found = sourceFiles(SRC)
      .filter((file) => SEARCH.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .sort();
    expect(found).toEqual([FORMATTER]);
  });
});
