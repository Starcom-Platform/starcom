/**
 * Colour literals written straight into the source (plan item 8.1): hex values
 * and rgb()/rgba() calls in src/**\/*.{css,ts,tsx}, outside tests and the token
 * file. Shared by guard-hardcoded-colors.mjs and its self-test, so the test
 * counts with the code that ships.
 *
 * Counted as written, comments included: a colour quoted in a comment is still
 * a colour someone will copy. Three.js `0x` numbers are not counted here; the
 * globe's palette is its own module (src/geopolitical/theme).
 */
import fs from 'node:fs';
import path from 'node:path';

export const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
export const RGB = /\brgba?\(/g;
const SCAN = new Set(['.css', '.ts', '.tsx']);

/** Where colours are defined, not used: the one token file. */
export const TOKEN_FILE = 'src/styles/tokens.ts';

const skipped = (rel) =>
  rel === TOKEN_FILE ||
  /(^|\/)(__tests__|__mocks__)\//.test(rel) ||
  /\.(test|spec)\.[jt]sx?$/.test(rel);

/** The literals under `root`/src, per file. `files` counts the files read. */
export function countColourLiterals(root) {
  const src = path.join(root, 'src');
  const byFile = new Map();
  let files = 0;
  if (!fs.existsSync(src)) return { files, total: 0, byFile };
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!SCAN.has(path.extname(e.name))) continue;
      const rel = path.relative(root, p).split(path.sep).join('/');
      if (skipped(rel)) continue;
      files += 1;
      const text = fs.readFileSync(p, 'utf8');
      const n = (text.match(HEX)?.length ?? 0) + (text.match(RGB)?.length ?? 0);
      if (n) byFile.set(rel, n);
    }
  };
  walk(src);
  let total = 0;
  for (const n of byFile.values()) total += n;
  return { files, total, byFile };
}
