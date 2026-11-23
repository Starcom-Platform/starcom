#!/usr/bin/env node
/**
 * @asserts The text a visitor or reviewer reads first claims no feature that Starcom does not have.
 *
 * ─── WHY ────────────────────────────────────────────────────────────────────
 *
 * On 2026-11-20, before grant applications, the README, the site's
 * description and a page served at starcom.app still described a different
 * product: a blockchain marketplace on Solana and Ethereum, chat over Gun.js,
 * "quantum-safe encryption mandatory", a public analytics dashboard (which
 * showed random numbers) and "Cyber command for the Earth Alliance". The code
 * had dropped all of it months earlier. The guards checked the source, which
 * was right, and nothing checked the text people read, which was wrong.
 *
 * guard-no-institutional-claims keeps the names of real institutions out. This
 * guard keeps out the retired product: words that, in public text, can only
 * read as a claim that Starcom does these things. Explaining that it does not
 * doesn't need the word. Write "no analytics", not a vendor's name.
 *
 * ─── WHAT IT READS ──────────────────────────────────────────────────────────
 *
 *   node scripts/guard-public-claims.mjs
 *     The front door of this checkout: README.md, index.html, docs/README.md,
 *     the extension's store listing, the text files served from public/, and
 *     package.json's description. Run by `npm run gates`.
 *
 *   node scripts/guard-public-claims.mjs --tree <dir>   (or PUBLIC_CLAIMS_TREE=<dir>)
 *     Every markdown and HTML file in a tree: the public mirror runs this on
 *     what it is about to publish. Decision records under docs/missions/ are
 *     not read. They are dated history and must be able to say what was
 *     removed, and they carry the owner's own words.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { sync: globSync } = require('glob');

export const RETIRED = [
  { re: /(?<!post-)\bquantum[- ](safe|proof)\b/i, why: 'claims protection no one has shown; name the algorithm instead (ML-KEM-768, ML-DSA-65), as "post-quantum" does' },
  { re: /\bSolana\b/i, why: 'the Solana wallet and chain code were removed in 2026' },
  { re: /\bEthereum\b/i, why: 'Starcom has no Ethereum code' },
  { re: /\bsmart contracts?\b/i, why: 'Starcom deploys no smart contract' },
  { re: /\bGun\.?js\b|\bGunDB\b/i, why: 'chat runs over Nostr; the Gun.js adapter is gone' },
  { re: /\bdApp\b/, why: 'Starcom is a web app with no chain' },
  { re: /\bWeb3 wallet/i, why: 'there is no wallet sign-in' },
  { re: /\bEarth Alliance\b/i, why: 'the old framing, retired from the public face on 2026-11-20' },
  { re: /\bLooker Studio\b|\bGoogle Analytics\b/i, why: 'Starcom ships no analytics' },
  { re: /\bmilitary[- ]grade\b|\bunhackable\b|\bbank[- ]grade\b/i, why: 'a security claim nothing has tested' },
];

function argTree() {
  const i = process.argv.indexOf('--tree');
  if (i !== -1) return process.argv[i + 1];
  return process.env.PUBLIC_CLAIMS_TREE || '';
}

const TREE = argTree();
const root = path.resolve(TREE || process.cwd());

const FRONT_DOOR = [
  'README.md',
  'index.html',
  'docs/README.md',
  'extension/store/*.md',
  'public/*.{html,md,txt,json,webmanifest,xml}',
  'public/.well-known/*',
  'public/**/*.{html,md}',
  'public/assets/**/*.txt',
];

const files = (TREE
  ? globSync('**/*.{md,html}', { cwd: root, dot: true, nodir: true, ignore: ['**/node_modules/**', 'docs/missions/**', '.git/**'] })
  : FRONT_DOOR.flatMap((p) => globSync(p, { cwd: root, dot: true, nodir: true })))
  .map((f) => f.replaceAll('\\', '/'));

const found = [];
for (const file of [...new Set(files)].sort()) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const { re, why } of RETIRED) {
      const m = line.match(re);
      if (m) found.push({ where: `${file}:${i + 1}`, word: m[0], why });
    }
  });
}

if (!TREE) {
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const description = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).description ?? '';
    for (const { re, why } of RETIRED) {
      const m = String(description).match(re);
      if (m) found.push({ where: 'package.json description', word: m[0], why });
    }
  }
}

if (found.length) {
  console.error(`\nPublic-claims guard failed: ${found.length} place(s) in public text name a feature Starcom does not have.\n`);
  for (const f of found) console.error(`  ${f.where}: "${f.word}" (${f.why})`);
  console.error('\nSay what Starcom does. To say what it does not do, describe it without the name.\n');
  process.exit(1);
}

console.log(`Public-claims guard: clean. ${files.length} public file(s) read${TREE ? ` in ${TREE}` : ''}; none names a retired feature.`);
