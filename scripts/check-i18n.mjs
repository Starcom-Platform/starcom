#!/usr/bin/env node
/**
 * Translation coverage, reported honestly.
 *
 * Half-translated interfaces ship and stay half-translated for years, because
 * nothing ever reports the gap: a missing key falls back to English, the page
 * renders, and everyone assumes it is done. This measures instead.
 *
 * TypeScript already refuses to compile a locale that OMITS a key. What it
 * cannot see is a key that was copied across untranslated, or a translation
 * that dropped a placeholder — both of which compile perfectly and are wrong.
 *
 * Exit: 0 all locales complete and structurally sound · 1 problems · 2 cannot read
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'src/i18n/locales';
const SOURCE = 'en';
/** Locales confirmed by someone who reads the language. Empty until they are. */
const REVIEWED = new Set();

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]);

let source;
try {
  source = Object.fromEntries(flatten(JSON.parse(fs.readFileSync(path.join(DIR, `${SOURCE}.json`), 'utf8'))));
} catch (e) {
  console.error(`Cannot read the source locale: ${e.message}`);
  process.exit(2);
}

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const locales = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));

let problems = 0;
console.log(`\n  Source locale ${SOURCE}: ${Object.keys(source).length} strings\n`);

for (const loc of locales) {
  if (loc === SOURCE) continue;
  const target = Object.fromEntries(flatten(JSON.parse(fs.readFileSync(path.join(DIR, `${loc}.json`), 'utf8'))));

  const missing = Object.keys(source).filter((k) => !(k in target));
  const extra = Object.keys(target).filter((k) => !(k in source));
  // Identical to the source is usually an untranslated copy. Not always — a
  // proper noun or a symbol legitimately matches — so it is reported as
  // "needs a look", not as an error on its own.
  const identical = Object.keys(source).filter((k) => k in target && target[k] === source[k]);
  // A dropped or renamed placeholder is unambiguously broken: the sentence
  // renders with a hole in it, or with a literal {count} in front of a reader.
  const broken = Object.keys(source)
    .filter((k) => k in target)
    .filter((k) => placeholders(source[k]).join() !== placeholders(target[k]).join())
    .map((k) => `${k}: expected {${placeholders(source[k]).join('}, {')}}, found {${placeholders(target[k]).join('}, {')}}`);

  const translated = Object.keys(source).length - missing.length - identical.length;
  const pct = ((translated / Object.keys(source).length) * 100).toFixed(0);
  const status = REVIEWED.has(loc) ? 'reviewed' : 'NOT REVIEWED by a speaker of the language';

  console.log(`  ${loc}: ${pct}% translated (${translated}/${Object.keys(source).length}) — ${status}`);
  if (missing.length) { problems++; console.log(`    MISSING ${missing.length}: ${missing.slice(0, 5).join(', ')}`); }
  if (extra.length) { problems++; console.log(`    UNKNOWN KEYS ${extra.length}: ${extra.slice(0, 5).join(', ')} — the source no longer has these`); }
  if (broken.length) {
    problems++;
    console.log(`    BROKEN PLACEHOLDERS ${broken.length}:`);
    for (const b of broken.slice(0, 5)) console.log(`      ${b}`);
  }
  if (identical.length) console.log(`    identical to ${SOURCE} (${identical.length}) — check these are intentional: ${identical.slice(0, 4).join(', ')}`);
  if (!REVIEWED.has(loc)) {
    console.log(`    Machine-drafted text that tells people whether to trust a claim is a working draft, not a translation.`);
  }
  console.log('');
}

if (problems) {
  console.log(`  ${problems} structural problem(s) across locales.\n`);
  process.exit(1);
}
console.log('  All locales structurally complete.\n');
