#!/usr/bin/env node
/**
 * @asserts Starcom ships no scraped RLSH data and fetches none: no embedded dataset of people, and no RLSH wiki, Wikipedia or static-file source in the RLSH service; profiles are drawn only as heroes submit them.
 *
 * The owner, 2026-10-17 (rlsh-minors.md, RS49): until a data-share agreement with the RLSH wiki's owner, Starcom
 * cannot hold scraped data about people; heroes submit their own public profiles through NavCom. A scrape put back,
 * or a fetch of one, fails the build. An agreement, when there is one, is recorded there and this guard changed with it.
 */
import fs from 'node:fs';

const problems = [];
for (const file of ['src/data/rlshEmbeddedDataset.json', 'src/data/rlshEmbeddedDataset.ts', 'public/rlsh/entities.json']) {
  if (fs.existsSync(file)) problems.push(`${file} ships scraped RLSH data. Profiles come only as heroes submit them (RS49).`);
}
const service = fs.readFileSync('src/services/RLSHVisualizationService.ts', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
for (const [pattern, what] of [
  [/rlshEmbeddedDataset/, 'imports an embedded RLSH dataset'],
  [/wikipedia\.org/i, 'fetches Wikipedia'],
  [/rlsh\.net/i, 'fetches the RLSH wiki'],
  [/\/rlsh\/entities\.json/, 'fetches a static file of people'],
]) {
  if (pattern.test(service)) problems.push(`src/services/RLSHVisualizationService.ts ${what}. Profiles come only as heroes submit them (RS49).`);
}
// src/data/rlshRoles/ holds registrations heroes submitted themselves: their own, and kept.
if (problems.length > 0) {
  console.error(`RLSH sources guard FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('RLSH sources guard: no scraped data shipped or fetched; profiles only as heroes submit them.');
