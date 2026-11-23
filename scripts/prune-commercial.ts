/**
 * The commercial build's data, pruned (decision D-CS, CS1, CS13): a step of `npm run build`, right after `vite build`
 * and before the service worker is stamped, so the stamp lists only what ships. In the non-commercial build it does
 * nothing. In the commercial build it removes from dist every file baked from a source the commercial build may not
 * use (the source register's `files`), fails if one remains, and writes dist/commercial-build.json saying what was left
 * out and why: a licence is about distribution, so hiding a layer is not enough while its data still ships.
 *
 * Usage: tsx --tsconfig tsconfig.app.json scripts/prune-commercial.ts [distDir]
 */
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProfile, restrictedSources } from '../src/legal/buildProfile';

const dist = process.argv[2] ?? 'dist';

if (buildProfile() !== 'commercial') {
  console.log('prune-commercial: the non-commercial build ships every source; nothing pruned.');
  process.exit(0);
}

const restricted = restrictedSources();
const removed: string[] = [];
for (const source of restricted) {
  for (const file of source.files) {
    if (!file.startsWith('public/')) continue; // baked into code, not copied as a file: gated where it is drawn
    const target = join(dist, file.slice('public/'.length));
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      removed.push(`${target} (${source.id}, ${source.status})`);
    }
  }
}

const left = restricted.flatMap((s) => s.files.filter((f) => f.startsWith('public/')).map((f) => join(dist, f.slice('public/'.length)))).filter(existsSync);
if (left.length) {
  console.error(`prune-commercial FAILED: still in ${dist}: ${left.join(', ')}`);
  process.exit(1);
}

writeFileSync(join(dist, 'commercial-build.json'), JSON.stringify({
  profile: 'commercial',
  leftOut: restricted.map((s) => ({ source: s.id, status: s.status, files: s.files })),
}, null, 1));
console.log(`prune-commercial: ${removed.length} file(s) left out of the commercial build; ${restricted.length} source(s) not used.`);
for (const line of removed) console.log(`  - ${line}`);
