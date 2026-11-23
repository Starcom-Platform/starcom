#!/usr/bin/env node
/**
 * @asserts No stylesheet or component names a font family of its own.
 *
 * FONT FAMILY GUARD (plan item 8.2, decision D6, pairing A)
 *
 * Type is Oxanium for display, IBM Plex Sans for text and JetBrains Mono for
 * data, self-hosted once, with Aldrich for the wordmark only. They are tokens:
 * `font-family: var(--sc-font-text)`, or FONTS in src/styles/tokens.ts. The
 * source named 45 different stacks, and six of the fonts in them were never
 * loaded, so a reader got whatever their machine had. A @font-face block
 * defines a family and is allowed; `inherit` is allowed.
 *
 * A guard that reads nothing must not pass, so an empty scan fails.
 *
 * Usage: node scripts/guard-font-families.mjs
 * Exit:  0 every family comes from the tokens · 1 one does not, or nothing was read
 */
import { fontFamilyLiterals } from './lib/typeLiterals.mjs';

const found = fontFamilyLiterals(process.cwd());
if (found.files === 0) {
  console.error('\n  FONT FAMILY GUARD: nothing to read under src/. Failing rather than passing on nothing.\n');
  process.exit(1);
}
console.log(`\n  FONT FAMILY GUARD — ${found.files} files read\n`);
if (found.length === 0) {
  console.log('  Every font family comes from the tokens.\n');
  process.exit(0);
}
for (const f of found) console.log(`  ${f.file}:${f.line}  ${f.value}`);
console.log(`
  ${found.length === 1 ? 'One font family is' : `${found.length} font families are`} named directly. Use the token for what the text is:
    font-family: var(--sc-font-text);      reading text (IBM Plex Sans)
    font-family: var(--sc-font-display);   headings (Oxanium)
    font-family: var(--sc-font-data);      keys, hashes, numbers (JetBrains Mono)
`);
process.exit(1);
