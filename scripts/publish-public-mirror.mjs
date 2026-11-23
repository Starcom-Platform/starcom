#!/usr/bin/env node
/**
 * Builds the public mirror of Starcom (the owner's decision, 2026-10-17): a fresh tree from the committed HEAD,
 * rebuilt from scratch every time so nothing private can carry over, checked, and committed to Starcom-Platform/starcom
 * (the public repository since 23 Nov 2026) as Jono Tho'ra. The private repository, and Vercel, stay where they are:
 * work happens there, and the public repository receives it.
 *
 *   node scripts/publish-public-mirror.mjs            builds and checks, and says what would be published
 *   node scripts/publish-public-mirror.mjs --commit   also commits it to the local mirror (.local/public-mirror)
 *   node scripts/publish-public-mirror.mjs --push     also pushes the mirror (the owner's go, each time it matters)
 *   node scripts/publish-public-mirror.mjs --verify   also installs, checks and tests the tree as a fresh clone would,
 *                                                     with no private file, before anything is committed
 *
 * It refuses, before anything leaves this machine, when: a file with a sensitive name is in the tree; a line holds a
 * secret-like value (shown masked, never in full); a runtime dependency's licence is not one an open release can
 * carry; or THIRD-PARTY.md is missing or still has anything to verify. Mirror commits carry a neutral message, never
 * a private commit's.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const ARGS = new Set(process.argv.slice(2));
const COMMIT = ARGS.has('--commit') || ARGS.has('--push');
const PUSH = ARGS.has('--push');
const VERIFY = ARGS.has('--verify');
const MIRROR = path.join(ROOT, '.local', 'public-mirror');
const REMOTE = 'https://github.com/Starcom-Platform/starcom.git';
const AUTHOR = "Jono Tho'ra <1679960+Jthora@users.noreply.github.com>";

/** Left out of the public tree (the owner's choices, 2026-10-17). */
const EXCLUDE = [
  'artifacts', '.generated', 'asset development', 'archives', 'docs/archive', 'docs/archived',
  'contracts', 'chain', 'src/contracts',
  // A relay database's shared-memory and write-ahead files, tracked by mistake: a WAL can hold the database's pages.
  'data/relaynode.db-shm', 'data/relaynode.db-wal',
  // Status reports from 2025 inside src/, describing work since rewritten (2026-11-20).
  'src/docs',
  // Starcom Desktop is a private repository: a public clone would hold a link it cannot follow (until the owner opens it).
  '.gitmodules', 'desktop',
  // Data whose terms the owner has not yet confirmed (THIRD-PARTY.md, TO VERIFY): held back rather than published
  // unverified (approved 23 Nov). The script that bakes it stays, so anyone may fetch it under the source's own terms.
  'public/eco-natural/volcanoes-baked.json',
  // The owner's own business and legal planning, held back from the first release (23 Nov): data-licensing.md names
  // the owner and the funding plans; commercial-split.md holds licence strategy, questions for counsel and draft
  // letters. Either can be published later; nothing published can be taken back.
  'docs/missions/01-architecture-decisions/data-licensing.md',
  'docs/missions/01-architecture-decisions/commercial-split.md',
];

/**
 * No workflow is published: there is no CI, by the owner's choice of 23 Nov 2026 (the app is built with AI, and every
 * check runs locally, `npm run verify`). A workflow file that ever appears here is left out, and named, until the owner
 * chooses otherwise.
 */
const WORKFLOWS_PUBLISHED = new Set();

/**
 * The docs that are published (the owner's choice, 2026-11-20): current records only. Of the ~2,000 files under docs/,
 * most are 2025 plans and phase reports, and 138 describe features the code no longer has (a chain, a wallet, an
 * analytics dashboard). They stay in the private repository as history. Everything under docs/ that is not listed here
 * is left out, and the run names what was left out, so a new folder is not dropped silently.
 */
const DOCS_PUBLISHED = [
  'docs/README.md',
  // The guides for developers (23 Nov 2026).
  'docs/ARCHITECTURE.md', 'docs/GLOSSARY.md', 'docs/TESTING.md', 'docs/LANGUAGES.md',
  'docs/missions/',
  'docs/spec/',
  'docs/interchange/',
  'docs/measurements/',
  'docs/intake/',
  'docs/adr/ADR-0002-globe-interactivity-canonical-architecture.md',
  'docs/adr/ADR-0003-source-observation-envelope.md',
];
const docPublished = (rel) => DOCS_PUBLISHED.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p));
const SENSITIVE_NAME = /(^|\/)(\.env(\.[^/]*)?|\.starcom-identity[^/]*|[^/]*\.heapsnapshot|id_rsa[^/]*|id_ed25519[^/]*|[^/]*\.pem|[^/]*\.(db|sqlite|sqlite3)(-shm|-wal|-journal)?)$|(^|\/)\.vercel\/|(^|\/)\.local\//;
const SENSITIVE_OK = new Set(['.env.example']);

/** Strong patterns: a real secret has no business in the tree. */
const STRONG = [
  ['nostr nsec', /\bnsec1[02-9ac-hj-np-z]{58}\b/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['aws access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github token', /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['google api key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['stripe key', /\b(sk|rk)_(live|test)_[0-9A-Za-z]{16,}\b/],
  ['llm api key', /\b(sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,})\b/],
];
/** Where a strong pattern is the point, not a leak: published test vectors, a detector's own pattern, a template. */
const STRONG_OK = [/^docs\/spec\/mission-vectors\//, /^public\/spec\/mission-vectors\//, /^src\/applications\/netrunner\/services\/AdvancedOSINTCrawler\.ts$/, /^\.env\.example$/];
const NAMED = /(secret|private[_-]?key|api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|bearer|client[_-]?secret)/i;
const QUOTED = /(["'`])([A-Za-z0-9_\-+/=.]{20,})\1/g;
const PLACEHOLDER = /(your|example|xxxx|placeholder|changeme|dummy|fake|sample|test|mock|redacted|0000000|aaaaaaaa|1234567)/i;
const BINARY = /\.(png|jpe?g|gif|webp|ktx2|ico|wav|mp3|ogg|glb|gltf|bin|ttf|otf|woff2?|zip|gz|pdf)$/i;
const LICENCES_OK = /^(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|MPL-2\.0|CC0-1\.0|Unlicense|OFL-1\.1|BlueOak-1\.0\.0|Python-2\.0|\(MIT OR Apache-2\.0\)|MIT OR Apache-2\.0|Apache-2\.0 OR MIT|\(MIT OR GPL-3\.0-or-later\)|AGPL-3\.0(-only|-or-later)?|GPL-3\.0(-only|-or-later)?|LGPL-3\.0(-only|-or-later)?)$/;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const entropy = (s) => { const c = {}; for (const ch of s) c[ch] = (c[ch] ?? 0) + 1; return -Object.values(c).reduce((n, v) => n + (v / s.length) * Math.log2(v / s.length), 0); };

const problems = [];
const say = (line) => console.log(line);

// 1. A fresh tree from the committed HEAD: nothing uncommitted, nothing ignored, nothing from an earlier run.
const head = run('git', ['rev-parse', 'HEAD']).trim();
const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'starcom-public-'));
execFileSync('sh', ['-c', `git archive --format=tar HEAD | tar -x -C "${tree}"`], { stdio: 'inherit' });
for (const p of EXCLUDE) fs.rmSync(path.join(tree, p), { recursive: true, force: true });

// Workflows: only the public repository's own.
const workflowsLeftOut = [];
const workflowDir = path.join(tree, '.github', 'workflows');
if (fs.existsSync(workflowDir)) {
  for (const name of fs.readdirSync(workflowDir)) {
    if (WORKFLOWS_PUBLISHED.has(name)) continue;
    workflowsLeftOut.push(name);
    fs.rmSync(path.join(workflowDir, name), { recursive: true, force: true });
  }
}

// Docs: only the current records.
const docsLeftOut = new Map();
(function prune(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(tree, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      // A folder that holds something published is walked; one that holds nothing published goes whole.
      if (DOCS_PUBLISHED.some((p) => p.startsWith(`${rel}/`) || rel.startsWith(p))) prune(full);
      else { docsLeftOut.set(rel, countFiles(full)); fs.rmSync(full, { recursive: true, force: true }); }
    } else if (!docPublished(rel)) {
      docsLeftOut.set(rel, 1);
      fs.rmSync(full, { force: true });
    }
  }
})(path.join(tree, 'docs'));

// Empty folders go, as git drops them: a clone has none, so the checks below must not see any either.
(function dropEmpty(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== '.git') dropEmpty(path.join(dir, entry.name));
  }
  if (dir !== tree && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
})(tree);

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(path.relative(tree, full).split(path.sep).join('/'));
  }
})(tree);

// 2. Names.
for (const f of files) if (SENSITIVE_NAME.test(f) && !SENSITIVE_OK.has(f)) problems.push(`sensitive file name: ${f}`);

// 3. Values, masked.
for (const f of files) {
  if (BINARY.test(f)) continue;
  const text = fs.readFileSync(path.join(tree, f), 'utf8');
  if (text.includes('\u0000')) continue;
  text.split('\n').forEach((line, i) => {
    for (const [name, rx] of STRONG) {
      if (rx.test(line) && !STRONG_OK.some((ok) => ok.test(f))) problems.push(`${name}: ${f}:${i + 1}`);
    }
    if (line.length > 400 || !NAMED.test(line) || /(__tests__|\.test\.|\.spec\.|fixtures|vectors)/.test(f)) return;
    for (const m of line.matchAll(QUOTED)) {
      const v = m[2];
      if (PLACEHOLDER.test(v) || entropy(v) < 3.8 || (/^[a-z0-9_.-]+$/.test(v) && v.includes('_'))) continue;
      if (/[./]/.test(v) && /^[\w@./-]+$/.test(v) && /\.(ts|tsx|js|mjs|json|md|css)$|^[.@]/.test(v)) continue;
      problems.push(`secret-like value: ${f}:${i + 1}: ${line.trim().replace(v, '***').slice(0, 140)}`);
    }
  });
}

// 4. Runtime dependency licences, read from this checkout's installed packages.
const pkg = JSON.parse(fs.readFileSync(path.join(tree, 'package.json'), 'utf8'));
for (const name of Object.keys(pkg.dependencies ?? {})) {
  let licence = '(not installed here)';
  try {
    const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf8'));
    licence = typeof p.license === 'string' ? p.license : p.license?.type ?? '(none stated)';
  } catch { /* stays as said */ }
  if (!LICENCES_OK.test(licence)) problems.push(`dependency licence: ${name} is ${licence}`);
}

// 5. The notices.
const notices = path.join(tree, 'THIRD-PARTY.md');
if (!fs.existsSync(notices)) problems.push('THIRD-PARTY.md is missing: every dataset, texture, font and sound with its licence and source');
else {
  // Only the entries count: the file's own preamble names the marker.
  // An entry still to verify blocks the release only while its file is in the tree: one held back (EXCLUDE) is not
  // published, which is what the marker guards against.
  const inTree = (cell) => {
    const named = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    return named.length === 0 || named.some((p) => /[*?]/.test(p) || fs.existsSync(path.join(tree, p)));
  };
  const unverified = fs.readFileSync(notices, 'utf8').split('\n').filter((line) => line.startsWith('|') && /TO VERIFY/.test(line));
  for (const line of unverified) {
    const cell = line.split('|')[1].trim();
    if (inTree(cell)) problems.push(`THIRD-PARTY.md entry still marked TO VERIFY: ${cell}`);
    else say(`Held back, not published until verified: ${cell}`);
  }
}

const size = files.reduce((n, f) => n + fs.statSync(path.join(tree, f)).size, 0);
say(`Public tree from ${head.slice(0, 9)}: ${files.length} files, ${(size / 1e6).toFixed(1)} MB; left out: ${EXCLUDE.join(', ')}.`);
const leftOutTotal = [...docsLeftOut.values()].reduce((a, b) => a + b, 0);
const topLeftOut = [...docsLeftOut.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .map(([p, n]) => `${p.replace(/^docs\//, '')} (${n})`);
say(`Docs: ${leftOutTotal} file(s) under docs/ left out, as not current records. Largest: ${topLeftOut.join(', ')}.`);

// 6a. The public face, once more: nothing published may name a feature Starcom does not have.
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'guard-public-claims.mjs'), '--tree', tree], { stdio: 'pipe', encoding: 'utf8' });
} catch (e) {
  for (const line of String(e.stderr ?? '').split('\n').filter((l) => /^\s{2}\S/.test(l))) problems.push(`retired claim: ${line.trim()}`);
  if (!problems.some((p) => p.startsWith('retired claim'))) problems.push('guard-public-claims failed on the tree');
}
// 5a. Links. A newcomer's first documents must not point at anything the public tree lacks: one that does refuses the
// release. Links elsewhere (the working records under docs/missions/) are counted, so the number can only be watched.
const ENTRY_DOCS = new Set([
  'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'docs/README.md',
  'docs/ARCHITECTURE.md', 'docs/GLOSSARY.md', 'docs/TESTING.md', 'docs/LANGUAGES.md', 'docs/spec/README.md',
  'docs/spec/kinds.md', 'extension/README.md', 'data/README.md', 'claims/README.md',
  'docs/missions/README.md', 'docs/missions/01-architecture-decisions/README.md',
]);
let otherBroken = 0;
for (const rel of files.filter((f) => f.endsWith('.md'))) {
  const text = fs.readFileSync(path.join(tree, rel), 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#|\/)/.test(target)) continue;
    const bare = decodeURIComponent(target.split('#')[0]);
    if (!bare) continue;
    if (fs.existsSync(path.join(tree, path.dirname(rel), bare))) continue;
    if (ENTRY_DOCS.has(rel)) problems.push(`entry document links something not in the public tree: ${rel} → ${target}`);
    else otherBroken += 1;
  }
}
if (otherBroken) say(`Links elsewhere that point outside the public tree: ${otherBroken} (the working records; counted, not refused).`);

// 5b. A fresh clone's first hour, on request: install, then the local gate (guards, the real typecheck, conformance,
// the tests). It needs nothing the tree does not hold; a step that reaches for a private file fails here, not for a
// contributor. Run before the verdict, so one run names every problem.
if (VERIFY) {
  say('Verifying the tree as a fresh clone: npm ci, then npm run verify.');
  let fresh = true;
  for (const [cmd, args] of [['npm', ['ci', '--no-audit', '--no-fund']], ['npm', ['run', 'verify']]]) {
    try {
      execFileSync(cmd, args, { cwd: tree, stdio: 'inherit' });
    } catch {
      problems.push(`the tree fails as a fresh clone at: ${cmd} ${args.join(' ')}`);
      fresh = false;
      break;
    }
  }
  if (fresh) say('The tree installs and passes the local gate as a fresh clone.');
}
if (problems.length > 0) {
  console.error(`Public mirror REFUSED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  fs.rmSync(tree, { recursive: true, force: true });
  process.exit(1);
}
say('Checks passed: no sensitive names, no secret-like values, licences fit, notices complete.');
if (workflowsLeftOut.length) say(`Workflows left out (there is no CI): ${workflowsLeftOut.join(', ')}.`);


if (!COMMIT) {
  say(`Dry run. The tree is at ${tree} to look at; --commit commits it to ${path.relative(ROOT, MIRROR)}.`);
  process.exit(0);
}

// 6. The local mirror: a clone of the public repository, so each commit follows what is already public; then its tree
// is replaced whole, so a file removed here is removed there.
if (!fs.existsSync(path.join(MIRROR, '.git'))) {
  fs.mkdirSync(path.dirname(MIRROR), { recursive: true });
  run('git', ['clone', '-q', REMOTE, MIRROR]);
}
/*
 * Never over someone's work. The public repository can take changes this script did not make: a contributor's pull
 * request merged on GitHub. Replacing the tree whole would silently undo them. So the mirror must hold everything the
 * public repository holds; when it does not, nothing is committed, and the change is brought into the private
 * repository first (the owner's choice of 23 Nov 2026: work happens there).
 */
run('git', ['fetch', '-q', 'origin'], { cwd: MIRROR });
let publicHead = '';
try {
  publicHead = run('git', ['rev-parse', '--verify', '-q', 'origin/main'], { cwd: MIRROR }).trim();
} catch {
  // An empty public repository: nothing there to keep.
}
if (publicHead) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', publicHead, 'HEAD'], { cwd: MIRROR, stdio: 'ignore' });
  } catch {
    const theirs = run('git', ['log', '--format=%h %an: %s', `HEAD..${publicHead}`], { cwd: MIRROR }).trim();
    console.error('Public mirror REFUSED — the public repository has commits this mirror does not:');
    for (const line of theirs.split('\n')) console.error(`  ${line}`);
    console.error('Bring them into the private repository, then run this again. Nothing was committed or pushed.');
    fs.rmSync(tree, { recursive: true, force: true });
    process.exit(1);
  }
}
for (const entry of fs.readdirSync(MIRROR)) if (entry !== '.git') fs.rmSync(path.join(MIRROR, entry), { recursive: true, force: true });
execFileSync('sh', ['-c', `cp -R "${tree}/." "${MIRROR}/"`], { stdio: 'inherit' });
fs.rmSync(tree, { recursive: true, force: true });
run('git', ['add', '-A'], { cwd: MIRROR });
const changed = run('git', ['status', '--porcelain'], { cwd: MIRROR }).trim();
if (!changed) {
  say('Nothing changed since the last mirror commit.');
} else {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  run('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '--author', AUTHOR, '-m', `Starcom, as of ${stamp} UTC`], {
    cwd: MIRROR, env: { ...process.env, GIT_COMMITTER_NAME: "Jono Tho'ra", GIT_COMMITTER_EMAIL: '1679960+Jthora@users.noreply.github.com' },
  });
  say(`Committed to ${path.relative(ROOT, MIRROR)}.`);
}

if (PUSH) {
  run('git', ['push', '-q', 'origin', 'main'], { cwd: MIRROR, stdio: 'inherit' });
  say(`Pushed to ${REMOTE}.`);
}

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  return n;
}
