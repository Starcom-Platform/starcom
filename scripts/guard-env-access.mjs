#!/usr/bin/env node
/**
 * @asserts import.meta.env is read only as a plain static member access, so Vite inlines one literal instead of emitting the entire env object.
 *
 * Guard script: environment access shape.
 *
 * Rule: read `import.meta.env` only as a plain static member access —
 * `import.meta.env.VITE_THING`. Nothing else.
 *
 * Vite substitutes each static read with its literal value at build time. It
 * cannot do that for any other shape, so it falls back to emitting the ENTIRE
 * env object into the bundle: every VITE_ variable present on the build
 * machine, whether or not a single line of code reads it.
 *
 * That is not theoretical. The shipped bundle carried VITE_DISCORD_BOT_TOKEN,
 * VITE_TELEGRAM_BOT_TOKEN and VITE_CENSYS_SECRET, none of which any code here
 * references. src/config/env.ts already stated the rule and the reason — "an
 * allowlist by construction: a variable absent from this map cannot reach the
 * bundle" — and four other files repeated the warning. It still happened, in
 * six places, because every one of them was DISGUISED:
 *
 *   (import.meta as any).env?.PROD          — a cast; does not read as the hazard
 *   (import.meta as unknown as X).env       — a cast; same
 *   anyMeta?.env?.[key]                     — a computed key behind a cast
 *   import.meta.env?.VITE_SOLANA_RPC_URL    — optional chaining defeats it too
 *
 * The last one is the sharpest: `import.meta.env.X` is substituted and
 * `import.meta.env?.X` is not. They differ by one character, look equally safe,
 * and only one of them ships the whole environment. A rule that subtle cannot
 * be enforced by five comments and good intentions.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['src'];
const BAD = [
  {
    // Anything reaching .env through a cast of import.meta.
    re: /\(\s*import\.meta\s+as[^)]*\)\s*\??\.\s*env/g,
    why: 'reads env through a cast, which makes Vite emit the whole env object',
  },
  {
    // Optional chaining on env itself is NOT substituted.
    re: /import\.meta\.env\?\./g,
    why: 'import.meta.env?.X is not substituted — use import.meta.env.X',
  },
  {
    // Computed keys cannot be substituted per-variable.
    re: /import\.meta\.env\s*\[/g,
    why: 'computed key — Vite cannot substitute it, so it emits every variable',
  },
];

const offences = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      const src = fs.readFileSync(full, 'utf8');
      for (const { re, why } of BAD) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src)) !== null) {
          // Skip matches inside comments — these files DOCUMENT the hazard.
          const lineStart = src.lastIndexOf('\n', m.index) + 1;
          const line = src.slice(lineStart, src.indexOf('\n', m.index));
          if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
          const lineNo = src.slice(0, m.index).split('\n').length;
          offences.push({ file: full, lineNo, why, text: line.trim().slice(0, 90) });
        }
      }
    }
  }
};
for (const r of ROOTS) if (fs.existsSync(r)) walk(r);

if (offences.length) {
  console.error(`\nEnv-access guard FAILED — ${offences.length} read(s) that ship the whole environment.\n`);
  for (const o of offences) {
    console.error(`  ${o.file}:${o.lineNo}`);
    console.error(`    ${o.text}`);
    console.error(`    ${o.why}\n`);
  }
  console.error(
    'Use a plain static read: import.meta.env.VITE_THING\n'
    + 'Anything else makes Vite emit every VITE_ variable on the build machine into\n'
    + 'the bundle, credentials included, whether or not any code reads them.\n',
  );
  process.exit(1);
}

console.log('Env-access guard passed: every import.meta.env read is a plain static access.');
