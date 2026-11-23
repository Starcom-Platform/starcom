#!/usr/bin/env node
/**
 * Finds files that are versions of each other.
 *
 * ─── WHY NAME MATCHING IS NOT ENOUGH ───────────────────────────────────────
 *
 * guard-rogue-files already catches the obvious shape: Foo beside EnhancedFoo
 * in one directory. That misses everything that drifted apart — the same
 * capability written three times in three places under three names, each with a
 * feature the others lack. Merging those is the actual prize, and no name
 * comparison will find them.
 *
 * So this compares CONTENT. Every file is reduced to a set of token shingles —
 * comments, whitespace, string contents and identifier casing removed — and
 * files sharing enough shingles are reported as a cluster.
 *
 * ─── WHY SHINGLES AND NOT A DIFF ───────────────────────────────────────────
 *
 * A diff answers "are these the same file"; two implementations of one idea are
 * never the same file. Shingles answer "how much structure do these share",
 * which survives renamed variables, reordered functions and a different import
 * block. Comparing every pair would be 1.6 million comparisons on this repo, so
 * candidates come from an inverted index: only files that share a rare shingle
 * are ever compared.
 *
 * ─── READING THE OUTPUT ────────────────────────────────────────────────────
 *
 * Similarity is Jaccard over shingle sets, so 0.60 means three fifths of the
 * structure is shared. High similarity is not automatically bad — a family of
 * adapters written to one contract SHOULD look alike, and that is a sign the
 * contract works. What is worth attention is a cluster where the members have
 * DIFFERENT sizes and DIFFERENT export names: that is usually one idea
 * implemented repeatedly, each time with something the others are missing.
 *
 * The `unique to each` line is the point. It is what you would lose by deleting
 * any one member, and therefore what a merge has to carry.
 *
 * Usage: node scripts/survey-duplication.mjs [--min 0.55] [--limit 20]
 *                                            [--lines 60] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MIN_SIM = Number(flag('--min', '0.55'));
const LIMIT = Number(flag('--limit', '20'));
const MIN_LINES = Number(flag('--lines', '60'));
const AS_JSON = argv.includes('--json');

const ROOT = process.cwd();
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (/\.(ts|tsx|js|jsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) files.push(p);
  }
};
walk(path.join(ROOT, 'src'));

/** Structure only: no comments, no string contents, no casing, no whitespace. */
const normalise = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '"S"')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const K = 5;                                   // tokens per shingle
const shingle = (norm) => {
  const t = norm.split(' ');
  const out = new Set();
  for (let i = 0; i + K <= t.length; i++) out.add(t.slice(i, i + K).join(' '));
  return out;
};

const docs = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n').length;
  if (lines < MIN_LINES) continue;
  const sh = shingle(normalise(src));
  if (sh.size < 20) continue;
  docs.push({
    file: path.relative(ROOT, f), lines, sh,
    exports: [...src.matchAll(/export\s+(?:default\s+)?(?:const|function|class|interface|type)\s+(\w+)/g)].map((m) => m[1]),
  });
}

/* Candidate pairs via an inverted index on rare shingles — comparing all pairs
   would be 1.6M comparisons here. */
const index = new Map();
for (let i = 0; i < docs.length; i++) {
  for (const s of docs[i].sh) {
    if (!index.has(s)) index.set(s, []);
    const bucket = index.get(s);
    if (bucket.length < 40) bucket.push(i);     // ignore shingles shared by everything
  }
}

const seen = new Set();
const pairs = [];
for (const bucket of index.values()) {
  if (bucket.length < 2 || bucket.length > 12) continue;
  for (let a = 0; a < bucket.length; a++) {
    for (let b = a + 1; b < bucket.length; b++) {
      const key = bucket[a] + ':' + bucket[b];
      if (seen.has(key)) continue;
      seen.add(key);
      const A = docs[bucket[a]], B = docs[bucket[b]];
      let inter = 0;
      const [small, large] = A.sh.size < B.sh.size ? [A.sh, B.sh] : [B.sh, A.sh];
      for (const s of small) if (large.has(s)) inter++;
      const sim = inter / (A.sh.size + B.sh.size - inter);
      if (sim >= MIN_SIM) pairs.push({ a: bucket[a], b: bucket[b], sim });
    }
  }
}

/* Transitive clusters, so a triplicate reads as one finding rather than three. */
const parent = new Map();
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
for (const p of pairs) { for (const n of [p.a, p.b]) if (!parent.has(n)) parent.set(n, n); }
for (const p of pairs) { const ra = find(p.a), rb = find(p.b); if (ra !== rb) parent.set(ra, rb); }

const clusters = new Map();
for (const n of parent.keys()) {
  const r = find(n);
  if (!clusters.has(r)) clusters.set(r, []);
  clusters.get(r).push(n);
}

const simOf = new Map(pairs.map((p) => [p.a + ':' + p.b, p.sim]));
const rows = [...clusters.values()]
  .filter((c) => c.length > 1)
  .map((c) => {
    const members = c.map((i) => docs[i]).sort((x, y) => y.lines - x.lines);
    const sims = [];
    for (let a = 0; a < c.length; a++) for (let b = a + 1; b < c.length; b++) {
      const s = simOf.get(c[a] + ':' + c[b]) ?? simOf.get(c[b] + ':' + c[a]);
      if (s) sims.push(s);
    }
    const shared = members.map((m) => new Set(m.exports))
      .reduce((acc, s) => new Set([...acc].filter((x) => s.has(x))));
    return {
      members: members.map((m) => ({
        file: m.file, lines: m.lines,
        unique: m.exports.filter((e) => !members.every((o) => o.exports.includes(e))),
      })),
      sim: sims.reduce((a, b) => a + b, 0) / sims.length,
      spread: members[0].lines - members[members.length - 1].lines,
      sharedExports: [...shared].length,
    };
  })
  .sort((a, b) => (b.members.length - a.members.length) || (b.spread - a.spread));

if (AS_JSON) {
  // NOT process.exit() — on a pipe, stdout is asynchronous and exiting
  // immediately after a large write truncates it. The consumer then gets valid
  // JSON that simply stops mid-object, which reads as a parser bug rather than
  // a flush bug. Returning lets the process end when the write drains.
  console.log(JSON.stringify(rows, null, 2));
} else {

console.log('');
console.log(`  DUPLICATION SURVEY — ${docs.length} files ≥${MIN_LINES} lines, similarity ≥ ${MIN_SIM}`);
console.log(`  ${rows.length} cluster(s), ${rows.filter((r) => r.members.length > 2).length} with three or more members`);
console.log('');

for (const r of rows.slice(0, LIMIT)) {
  console.log(`    ${r.members.length} files · ${(r.sim * 100).toFixed(0)}% shared structure · ${r.spread} line spread`);
  for (const m of r.members) {
    const u = m.unique.length ? `   unique to it: ${m.unique.slice(0, 4).join(', ')}` : '';
    console.log(`        ${String(m.lines).padStart(5)}  ${m.file}${u}`);
  }
  console.log('');
}
if (rows.length > LIMIT) console.log(`    …and ${rows.length - LIMIT} more cluster(s) (--limit)\n`);

/*
 * ─── SAME IDEA, DIFFERENT DIRECTORIES ──────────────────────────────────────
 *
 * Content similarity finds versions of one file. It does not find one CAPABILITY
 * implemented five times in five places, because by then the implementations
 * have almost nothing textually in common — which is exactly why they are
 * expensive and exactly why nobody notices.
 *
 * Names survive that drift. TimelinePanel, TimelineView and EvidenceTimeline
 * are the same noun in five directories, and no amount of shingling relates
 * them.
 */
const NOUNS = /^(.*?)(Panel|View|Popup|Modal|Manager|Service|Provider|Container|Dashboard|Bar|Card|List|Selector|Controller|Adapter|Renderer|Widget)$/;
const byNoun = new Map();
for (const d of docs) {
  const stem = path.basename(d.file).replace(/\.[jt]sx?$/, '');
  const m = stem.match(NOUNS);
  if (!m || !m[1]) continue;
  const noun = m[1].replace(/^(Enhanced|Advanced|Unified|Improved|Ultra|Legacy|New|Modern|Simple|Basic|Refactored|Optimized|Smart|Dynamic|Cyber|CyberCommand|Starcom|Intel|NetRunner)/, '');
  if (noun.length < 4) continue;
  if (!byNoun.has(noun)) byNoun.set(noun, []);
  byNoun.get(noun).push(d);
}

const families = [...byNoun.entries()]
  .filter(([, v]) => v.length > 1 && new Set(v.map((d) => path.dirname(d.file))).size > 1)
  .map(([noun, v]) => ({ noun, members: v.sort((a, b) => b.lines - a.lines) }))
  .sort((a, b) => b.members.length - a.members.length);

console.log(`  SAME NOUN, DIFFERENT DIRECTORIES — ${families.length} famil(ies)`);
console.log('');
for (const f of families.slice(0, 12)) {
  console.log(`    "${f.noun}" — ${f.members.length} implementations, ${f.members.reduce((a, m) => a + m.lines, 0)} lines total`);
  for (const m of f.members) console.log(`        ${String(m.lines).padStart(5)}  ${m.file}`);
  console.log('');
}
if (families.length > 12) console.log(`    …and ${families.length - 12} more (--limit)\n`);

console.log('  A large line spread with different unique exports is the shape worth');
console.log('  opening: one idea implemented more than once, each version carrying');
console.log('  something the others lack. A family of adapters written to one contract');
console.log('  will also score high, and that is the contract working.');
console.log('');
}
