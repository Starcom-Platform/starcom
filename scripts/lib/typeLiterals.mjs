/**
 * Type written straight into the source (plan item 8.2): font families named
 * outside the tokens, and sizes under 11 px. Shared by guard-font-families.mjs,
 * guard-small-type.mjs and their self-test, so the test counts with the code
 * that ships.
 */
import fs from 'node:fs';
import path from 'node:path';

const SCAN = new Set(['.css', '.ts', '.tsx']);
const TOKEN_FILE = 'src/styles/tokens.ts';
export const MIN_PX = 11;
const REM_PX = 16;

const skipped = (rel) =>
  rel === TOKEN_FILE ||
  /(^|\/)(__tests__|__mocks__)\//.test(rel) ||
  /\.(test|spec)\.[jt]sx?$/.test(rel);

function eachSource(root, visit) {
  const src = path.join(root, 'src');
  let files = 0;
  if (!fs.existsSync(src)) return files;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!SCAN.has(path.extname(e.name))) continue;
      const rel = path.relative(root, p).split(path.sep).join('/');
      if (skipped(rel)) continue;
      files += 1;
      visit(rel, fs.readFileSync(p, 'utf8'));
    }
  };
  walk(src);
  return files;
}

const allowedFamily = (v) => /^(var\(--sc-font-[a-z]+\)|inherit|initial|unset)$/i.test(v.trim());
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * Font families named directly: in a declaration, in a fontFamily property
 * (whatever its quotes), or in any string shaped like a stack, family names
 * ending in a generic one ("'Aldrich', monospace", a canvas "12px Orbitron,
 * sans-serif"). A @font-face block defines a family, and is allowed.
 */
export function fontFamilyLiterals(root) {
  const found = [];
  const files = eachSource(root, (rel, text) => {
    const hits = [];
    const faces = [...text.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => [m.index, m.index + m[0].length]);
    const inFace = (i) => faces.some(([a, b]) => i >= a && i < b);
    for (const m of text.matchAll(/font-family\s*:\s*([^;}\n]+)/g)) {
      if (inFace(m.index) || allowedFamily(m[1])) continue;
      hits.push([m.index, m[1].trim()]);
    }
    const keyed = [];
    for (const m of text.matchAll(/fontFamily\s*:\s*(['"`])((?:(?!\1)[^\n])+)\1/g)) {
      keyed.push([m.index, m.index + m[0].length]);
      if (!allowedFamily(m[2])) hits.push([m.index, m[2].trim()]);
    }
    if (/\.tsx?$/.test(rel)) {
      for (const m of text.matchAll(/(['"`])((?:(?!\1)[^\n])+)\1/g)) {
        if (keyed.some(([a, b]) => m.index >= a && m.index < b)) continue;
        const v = m[2];
        // Either quote may close a family name before its comma: a canvas font
        // '14px "Courier New", monospace' was missed while only ' was allowed.
        if (/[A-Za-z][\w'" -]*,\s*(?:['"]?[\w -]+['"]?\s*,\s*)*(monospace|sans-serif|serif|cursive|fantasy|system-ui)\s*$/i.test(v) && !v.includes('var(--sc-font-')) {
          hits.push([m.index, v.trim()]);
        }
      }
    }
    for (const [index, value] of hits.sort((x, y) => x[0] - y[0])) found.push({ file: rel, line: lineOf(text, index), value });
  });
  found.files = files;
  return found;
}

/** Sizes under 11 px: px and rem in css, numbers, px and rem in components. */
export function smallSizes(root) {
  const found = [];
  const add = (rel, text, index, px) => { if (px > 0 && px < MIN_PX) found.push({ file: rel, line: lineOf(text, index), px: Math.round(px * 100) / 100 }); };
  const files = eachSource(root, (rel, text) => {
    const hits = [];
    for (const m of text.matchAll(/font-size\s*:\s*(\d*\.?\d+)(px|rem)\b/g)) hits.push([m.index, Number(m[1]) * (m[2] === 'rem' ? REM_PX : 1)]);
    for (const m of text.matchAll(/fontSize\s*[:=]\s*\{?\s*(['"]?)(\d*\.?\d+)(px|rem)?\1/g)) hits.push([m.index, Number(m[2]) * (m[3] === 'rem' ? REM_PX : 1)]);
    for (const [index, px] of hits.sort((a, b) => a[0] - b[0])) add(rel, text, index, px);
  });
  found.files = files;
  return found;
}
