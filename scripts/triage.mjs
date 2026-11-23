#!/usr/bin/env node
/**
 * A durable queue for going through the unreachable code one item at a time.
 *
 * ─── WHY A LEDGER AND NOT A LIST ───────────────────────────────────────────
 *
 * The survey found 197 orphan modules, 35 test-only modules and 23 families of
 * the same idea implemented more than once. That is a campaign, not a task: too
 * large for any one working session, and the decisions made early have to be
 * visible to whoever picks it up months later.
 *
 * That constraint is not incidental. This codebase reached its current state
 * because context kept being lost between sessions and the same file kept being
 * rewritten under a new name. A triage run WITHOUT a durable record would
 * reproduce exactly that: someone re-examines a file, cannot see that it was
 * already judged, and decides again — differently.
 *
 * So every verdict is written to docs/triage/ledger.json, committed, and shown
 * back before anything is re-examined.
 *
 * ─── THE QUESTION THIS ANSWERS FOR EACH FILE ───────────────────────────────
 *
 * Not "is it dead". Half of what looks dead here is switched off. The question
 * is which of four things it is:
 *
 *   EXPAND   built, never wired, and worth finishing
 *   MERGE    superseded by something else; its unique parts belong there
 *   DELETE   genuinely nothing, and nothing would carry forward
 *   KEEP     unreachable on purpose, with a reason
 *
 * ─── HOW HISTORY TELLS EXPAND FROM MERGE ───────────────────────────────────
 *
 * A file no commit ever imported was built and never connected — the question
 * is whether to finish it. A file that WAS imported and is not any more was
 * replaced, and the question is what replaced it and what it still knows that
 * the replacement does not. `git log -S` on the module's own name separates the
 * two, and it is the single most useful fact in a brief.
 *
 * Usage:
 *   node scripts/triage.mjs queue [--limit 20] [--kind orphan|test-only]
 *   node scripts/triage.mjs brief <file>
 *   node scripts/triage.mjs record <file> --verdict expand|merge|delete|keep
 *                                         [--into <file>] --why "<reason>"
 *   node scripts/triage.mjs progress
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const LEDGER = path.join(ROOT, 'docs/triage/ledger.json');

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const git = (args) => {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return ''; }
};

const loadLedger = () =>
  fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { entries: {} };

const saveLedger = (l) => {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n');
};

/** The survey is the source of candidates; this never maintains its own list. */
const survey = () => {
  const out = execFileSync('node', ['scripts/survey-reachability.mjs', '--json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out);
};

/**
 * How much structure two files share, 0 to 1.
 *
 * A merge verdict needs this and not just a matching name. IntelReportPopup
 * exists twice: one is a 654-line detail VIEWER, the other a 275-line
 * submission FORM with a map picker and wallet signing. Same name, opposite
 * jobs, 0% shared structure — and the name-only classifier called it a
 * high-confidence merge, which would have thrown away a working capability.
 *
 * Cheap shingling rather than a real diff: the question is "are these two
 * versions of one thing", and that survives renamed variables in a way a diff
 * does not.
 */
const similarity = (a, b) => {
  const norm = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '"S"')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  const shingles = (t) => {
    const out = new Set();
    for (let i = 0; i + 5 <= t.length; i++) out.add(t.slice(i, i + 5).join(' '));
    return out;
  };
  try {
    const A = shingles(norm(a)), B = shingles(norm(b));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const s of A) if (B.has(s)) inter++;
    return inter / (A.size + B.size - inter);
  } catch { return 0; }
};

const stem = (f) => path.basename(f).replace(/\.[jt]sx?$/, '');

/** Did any commit ever add or remove a reference to this module's name? */
const wiringHistory = (file) => {
  const name = stem(file);
  const log = git(['log', '--oneline', '-S', name, '--all', '--', '*.ts', '*.tsx']);
  const commits = log ? log.split('\n') : [];
  // Commits touching the file itself are authorship, not wiring.
  const own = new Set((git(['log', '--format=%h', '--', file]) || '').split('\n').filter(Boolean));
  const external = commits.filter((c) => !own.has(c.split(' ')[0]));
  return { everWired: external.length > 0, commits: external.slice(0, 4) };
};

const purposeOf = (file) => {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const block = src.match(/^\/\*\*([\s\S]*?)\*\//);
  if (block) {
    return block[1].split('\n').map((l) => l.replace(/^\s*\*ic?\s?/, '').replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean).slice(0, 3).join(' ');
  }
  const line = src.match(/^\/\/\s*(.+)$/m);
  return line ? line[1] : '(no header comment)';
};

const exportsOf = (file) => {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return [...src.matchAll(/export\s+(?:default\s+)?(?:const|function|class|interface|type|enum)\s+(\w+)/g)]
    .map((m) => m[1]);
};

/**
 * Files whose name is a plausible replacement for this one.
 *
 * The first version matched any shared substring of five characters, which in a
 * codebase where half the modules are named after Intel meant IntelSyncService
 * "related to" models/Intel/Intel.ts — true of the alphabet, useless as a merge
 * target. A suggestion that is usually wrong is worse than none: it gets acted
 * on once and then distrusted forever.
 *
 * Two relationships count now, and nothing else:
 *
 *   · the same name with an adjective stripped — Foo vs EnhancedFoo
 *   · the same name in a different directory — the moved-file case
 *
 * Both are the shapes that actually mean "this replaced that".
 */
const ADJECTIVES = /^(Enhanced|Advanced|Unified|Improved|Ultra|Legacy|New|Modern|Simple|Basic|Refactored|Optimized|Smart|Dynamic|Compact|Cyber|CyberCommand|Starcom)/;

const relatives = (file) => {
  const name = stem(file);
  const bare = name.replace(ADJECTIVES, '');
  if (bare.length < 4) return [];
  return git(['ls-files', 'src']).split('\n')
    .filter((f) => f !== file && /\.[jt]sx?$/.test(f) && !/\.(test|spec)\./.test(f))
    .filter((f) => {
      const s = stem(f);
      if (s === name) return true;                       // same name, moved
      return s.replace(ADJECTIVES, '') === bare;         // same name, adjective differs
    })
    .slice(0, 5);
};

const testsFor = (file) => {
  const name = stem(file);
  return git(['grep', '-l', name, '--', 'src/**/*.test.ts', 'src/**/*.test.tsx'])
    .split('\n').filter(Boolean).slice(0, 3);
};

/* ───────────────────────────────────────────────────────────────────────── */

if (cmd === 'queue') {
  const s = survey();
  const ledger = loadLedger();
  const kind = flag('--kind', 'all');
  const limit = Number(flag('--limit', '20'));

  const rows = [
    ...(kind === 'all' || kind === 'orphan' ? s.orphans.map((o) => ({ ...o, kind: 'orphan' })) : []),
    ...(kind === 'all' || kind === 'test-only' ? s.testOnly.map((o) => ({ ...o, kind: 'test-only' })) : []),
  ].filter((r) => !ledger.entries[r.file]).sort((a, b) => b.lines - a.lines);

  console.log('');
  console.log(`  TRIAGE QUEUE — ${rows.length} undecided, ${Object.keys(ledger.entries).length} recorded`);
  console.log('');
  for (const r of rows.slice(0, limit)) {
    console.log(`      ${String(r.lines).padStart(5)}  ${r.kind.padEnd(10)}  ${r.file}`);
  }
  if (rows.length > limit) console.log(`      …and ${rows.length - limit} more`);
  console.log('');
  console.log('  node scripts/triage.mjs brief <file>   to open one');
  console.log('');
}

else if (cmd === 'brief') {
  const file = argv[1];
  if (!file || !fs.existsSync(path.join(ROOT, file))) {
    console.error('  usage: triage.mjs brief <file>'); process.exit(1);
  }
  const ledger = loadLedger();
  const prior = ledger.entries[file];
  const w = wiringHistory(file);
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');

  console.log('');
  console.log(`  ${file}`);
  console.log(`  ${src.split('\n').length} lines · added ${git(['log', '--diff-filter=A', '--format=%ad', '--date=short', '--', file]).split('\n').pop() || '?'} · last touched ${git(['log', '-1', '--format=%ad', '--date=short', '--', file])}`);
  console.log('');

  if (prior) {
    console.log(`  ALREADY DECIDED — ${prior.verdict}${prior.into ? ' into ' + prior.into : ''}`);
    console.log(`      ${prior.why}`);
    console.log('');
  }

  console.log('  PURPOSE');
  console.log(`      ${purposeOf(file).slice(0, 240) || '(none stated)'}`);
  console.log('');

  console.log('  WIRING HISTORY');
  if (w.everWired) {
    console.log('      Was referenced by other files at some point, and is not now.');
    console.log('      → likely MERGE: find what replaced it, carry over what it still knows.');
    for (const c of w.commits) console.log(`          ${c}`);
  } else {
    console.log('      No commit ever added or removed a reference to it from elsewhere.');
    console.log('      → likely EXPAND: it was built and never connected. The question is');
    console.log('        whether to finish it, not whether it was abandoned.');
  }
  console.log('');

  const ex = exportsOf(file);
  console.log(`  EXPORTS (${ex.length})`);
  console.log(`      ${ex.slice(0, 10).join(', ') || '(none)'}`);
  console.log('');

  const t = testsFor(file);
  console.log('  TESTS');
  console.log(`      ${t.length ? t.join('\n      ') : '(none — nothing describes what it should do)'}`);
  console.log('');

  const rel = relatives(file);
  console.log('  POSSIBLE RELATIVES');
  console.log(`      ${rel.length ? rel.join('\n      ') : '(no name-alike found)'}`);
  console.log('');
  console.log('  node scripts/triage.mjs record ' + file + ' --verdict expand|merge|delete|keep --why "..."');
  console.log('');
}

else if (cmd === 'record') {
  const file = argv[1];
  const verdict = flag('--verdict', '');
  const why = flag('--why', '');
  const into = flag('--into', '');
  if (!file || !['expand', 'merge', 'delete', 'keep'].includes(verdict) || !why) {
    console.error('  usage: triage.mjs record <file> --verdict expand|merge|delete|keep [--into <file>] --why "<reason>"');
    process.exit(1);
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    console.error(`  ${file} is a directory. Record each file inside it individually —`);
    console.error('  a directory-level verdict has no single line count to attribute.');
    process.exit(1);
  }
  const ledger = loadLedger();
  ledger.entries[file] = {
    verdict, why, ...(into ? { into } : {}),
    lines: fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').length : 0,
    decidedAt: git(['log', '-1', '--format=%H']).slice(0, 12) || 'uncommitted',
  };
  saveLedger(ledger);
  console.log(`  recorded: ${file} → ${verdict}${into ? ' into ' + into : ''}`);
}

else if (cmd === 'progress') {
  const s = survey();
  const ledger = loadLedger();
  const total = s.orphans.length + s.testOnly.length;
  const done = Object.keys(ledger.entries).length;
  const byVerdict = {};
  for (const e of Object.values(ledger.entries)) byVerdict[e.verdict] = (byVerdict[e.verdict] ?? 0) + 1;

  console.log('');
  console.log(`  TRIAGE PROGRESS — ${done} of ${total + done} decided (${Math.round(done / (total + done) * 100)}%)`);
  console.log('');
  for (const [v, n] of Object.entries(byVerdict).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(4)}  ${v}`);
  }
  const lines = Object.values(ledger.entries).reduce((a, e) => a + (e.lines || 0), 0);
  console.log('');
  console.log(`      ${lines} lines accounted for`);
  console.log('');
}

else if (cmd === 'plan') {
  /*
   * ─── WHY NOT LARGEST-FIRST ─────────────────────────────────────────────
   *
   * The queue orders by size, which is the wrong axis. Of 197 orphans, 44 have
   * tests — someone wrote down what they should do, so the verdict is
   * decidable — and 64 have no history, no tests and no name-alike at all,
   * which costs the most to investigate and yields the least.
   *
   * This orders by how much the EVIDENCE decides, and groups files into
   * clusters, because the work is cluster-shaped. The first item triaged by
   * hand was four files for one marquee; treating them as four rows means
   * deriving the same context four times, which is the failure that produced
   * this codebase.
   */
  const s = survey();
  const ledger = loadLedger();
  const tracked = git(['ls-files', 'src']).split('\n');
  const candidates = [
    ...s.orphans.map((o) => ({ ...o, kind: 'orphan' })),
    ...s.testOnly.map((o) => ({ ...o, kind: 'test-only' })),
  ].filter((c) => !ledger.entries[c.file]);

  const NOUN = (n) => n.replace(/^(Enhanced|Advanced|Unified|Improved|Ultra|Legacy|New|Modern|Simple|Basic|Refactored|Optimized|Smart|Dynamic|Cyber|CyberCommand)/, '');

  // Cluster by directory, then by noun within it.
  const clusters = new Map();
  for (const c of candidates) {
    const key = path.dirname(c.file) + '::' + NOUN(stem(c.file)).slice(0, 12);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(c);
  }

  const rows = [];
  for (const [key, members] of clusters) {
    const dir = key.split('::')[0];
    const evidence = { tests: [], liveRelatives: [], wasWired: false };
    for (const m of members) {
      const name = stem(m.file);
      const w = wiringHistory(m.file);
      if (w.everWired) evidence.wasWired = true;
      evidence.tests.push(...testsFor(m.file));
      evidence.liveRelatives.push(...relatives(m.file).filter((r) =>
        !candidates.some((c) => c.file === r)));       // relative must be LIVE
    }
    evidence.tests = [...new Set(evidence.tests)];
    evidence.liveRelatives = [...new Set(evidence.liveRelatives)];

    /*
     * A shared name is not enough for a merge. Two files can carry one name and
     * do opposite jobs, and calling that a merge throws away the one that is
     * not the survivor. The most similar live relative decides.
     */
    const scored = evidence.liveRelatives
      .map((r) => ({ file: r, sim: Math.max(...members.map((m) => similarity(m.file, r))) }))
      .sort((x, y) => y.sim - x.sim);
    const best = scored[0];
    const SAME_THING = 0.25;
    evidence.liveRelatives = scored.map((x) => `${x.file} (${(x.sim * 100).toFixed(0)}%)`);

    // What the evidence supports, and how strongly.
    let verdict, confidence, because;
    if (best && best.sim >= SAME_THING && evidence.wasWired) {
      verdict = 'merge'; confidence = 'high';
      because = `was wired once and ${(best.sim * 100).toFixed(0)}% of its structure lives on in a name-alike — that is what replaced it`;
    } else if (best && best.sim < SAME_THING && best.sim >= 0) {
      verdict = 'unknown'; confidence = 'none';
      because = `shares a name with a live file but only ${(best.sim * 100).toFixed(0)}% of its structure — probably a different thing wearing the same name, so somebody has to look`;
    } else if (evidence.tests.length && !evidence.wasWired) {
      /*
       * Tests prove the module is FINISHABLE. They do not prove the feature was
       * wanted, and that distinction is the whole difference between a cleanup
       * and a product decision.
       *
       * I tried to rescue a high-confidence expand by asking whether anything
       * already referenced the module's exports. It cannot work, and the reason
       * is definitional: these modules are ORPHANS — nothing imports them, so
       * nothing can be expecting them. The check appeared to pass once, on
       * SolarWindVisualizer, and what it had actually found was another file
       * using a type called SolarWindData. A shared noun, not a call site.
       *
       * So: never wired plus tests is always MEDIUM. It means "finishable, and
       * somebody wrote down what finished looks like" — which is genuinely
       * better than the rest of the queue, and still not a decision this script
       * gets to make. CMEVisualizer and SolarWindVisualizer are 871 lines of
       * tested space-weather rendering that nothing planned in; whether the
       * globe should show coronal mass ejections is not a question the evidence
       * answers.
       */
      verdict = 'expand'; confidence = 'medium';
      because = 'never wired, but tests describe what finished looks like — better than the rest of the queue, still a product call';
    } else if (evidence.liveRelatives.length) {
      verdict = 'merge'; confidence = 'medium';
      because = 'a live name-alike exists; compare before deciding which is richer';
    } else if (evidence.wasWired) {
      verdict = 'merge'; confidence = 'low';
      because = 'was wired once, but nothing obvious replaced it — needs a look at the commit that unwired it';
    } else {
      verdict = 'unknown'; confidence = 'none';
      because = 'never wired, no tests, no relative — the evidence does not say what it was for';
    }

    rows.push({
      dir, members, verdict, confidence, because,
      lines: members.reduce((a, m) => a + m.lines, 0),
      tests: evidence.tests, relatives: evidence.liveRelatives,
    });
  }

  const RANK = { high: 0, medium: 1, low: 2, none: 3 };
  rows.sort((a, b) => (RANK[a.confidence] - RANK[b.confidence]) || (b.lines - a.lines));

  const limit = Number(flag('--limit', '12'));
  const only = flag('--confidence', 'all');
  const shown = only === 'all' ? rows : rows.filter((r) => r.confidence === only);

  const tally = {};
  for (const r of rows) tally[r.confidence] = (tally[r.confidence] ?? 0) + 1;

  console.log('');
  console.log(`  TRIAGE PLAN — ${candidates.length} undecided file(s) in ${rows.length} cluster(s)`);
  console.log('');
  for (const c of ['high', 'medium', 'low', 'none']) {
    if (tally[c]) console.log(`      ${String(tally[c]).padStart(4)}  ${c === 'none' ? 'needs your intent' : c + ' confidence'}`);
  }
  console.log('');

  for (const r of shown.slice(0, limit)) {
    console.log(`    ${r.verdict.toUpperCase()} · ${r.confidence} · ${r.lines} lines · ${r.dir}`);
    console.log(`        ${r.because}`);
    for (const m of r.members.slice(0, 4)) console.log(`        · ${m.file}  (${m.lines})`);
    if (r.members.length > 4) console.log(`        · …and ${r.members.length - 4} more`);
    if (r.relatives.length) console.log(`        → likely target: ${r.relatives.slice(0, 2).join(', ')}`);
    if (r.tests.length) console.log(`        → specified by: ${r.tests.slice(0, 2).join(', ')}`);
    console.log('');
  }
  if (shown.length > limit) console.log(`    …and ${shown.length - limit} more cluster(s) (--limit)\n`);

  console.log('  Ordered by what the evidence decides, not by size. The "needs your');
  console.log('  intent" band is the only part that genuinely requires a product call.');
  console.log('');
}

else if (cmd === 'dossier') {
  /*
   * Turns the needs-intent band into one document.
   *
   * Eighty-one separate questions is not a decision anyone makes; it is a
   * decision they postpone. Grouped by subsystem, with what each thing does and
   * what it would take to finish it, the same eighty-one become a session of
   * saying yes or no — because the question stops being "what is this file" and
   * becomes "do we want this capability".
   */
  const s = survey();
  const ledger = loadLedger();
  const candidates = [...s.orphans, ...s.testOnly].filter((c) => !ledger.entries[c.file]);

  /** Which part of the product this belongs to, for grouping. */
  const areaOf = (f) => {
    const p = f.replace(/^src\//, '');
    if (p.startsWith('applications/')) return 'Application: ' + p.split('/')[1];
    if (p.startsWith('components/HUD/')) return 'HUD';
    if (p.startsWith('components/')) return 'Components: ' + (p.split('/')[1] || '');
    if (p.startsWith('services/')) return 'Services: ' + (p.split('/')[1] || 'top level');
    if (p.startsWith('core/')) return 'Core: ' + (p.split('/')[1] || '');
    if (p.startsWith('pages/')) return 'Pages: ' + (p.split('/')[1] || '');
    return p.split('/')[0];
  };

  const byArea = new Map();
  for (const c of candidates) {
    const a = areaOf(c.file);
    if (!byArea.has(a)) byArea.set(a, []);
    byArea.get(a).push(c);
  }

  const out = { generated: git(['log', '-1', '--format=%H']).slice(0, 12), areas: [] };
  for (const [area, items] of [...byArea.entries()].sort((a, b) =>
    b[1].reduce((x, i) => x + i.lines, 0) - a[1].reduce((x, i) => x + i.lines, 0))) {
    out.areas.push({
      area,
      lines: items.reduce((a, i) => a + i.lines, 0),
      items: items.sort((a, b) => b.lines - a.lines).map((i) => {
        const w = wiringHistory(i.file);
        const tests = testsFor(i.file);
        const rel = relatives(i.file);
        return {
          file: i.file, lines: i.lines,
          purpose: purposeOf(i.file).slice(0, 180),
          exports: exportsOf(i.file).slice(0, 6),
          everWired: w.everWired,
          tests: tests.length,
          relatives: rel.slice(0, 2),
        };
      }),
    });
  }

  if (argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); }
  else {
    console.log('');
    console.log(`  DOSSIER — ${candidates.length} undecided across ${out.areas.length} areas`);
    console.log('');
    for (const a of out.areas.slice(0, Number(flag('--limit', '10')))) {
      console.log(`  ${a.area}  ·  ${a.items.length} file(s), ${a.lines} lines`);
      for (const i of a.items.slice(0, 4)) {
        console.log(`      ${String(i.lines).padStart(5)}  ${i.file.replace(/^src\//, '')}`);
        console.log(`             ${i.everWired ? 'was wired once' : 'never wired'}` +
          `${i.tests ? `, ${i.tests} test file(s)` : ', no tests'}` +
          `${i.relatives.length ? `, name-alike: ${i.relatives[0].replace(/^src\//, '')}` : ''}`);
      }
      if (a.items.length > 4) console.log(`      …and ${a.items.length - 4} more`);
      console.log('');
    }
  }
}

else {
  console.log('  usage: triage.mjs queue | plan | dossier | brief <file> | record <file> ... | progress');
  process.exit(1);
}
