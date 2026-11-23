#!/usr/bin/env node
/**
 * Type-aware inventory (and, with --apply, rewriter) for the classification purge.
 *
 * ─── WHY THIS IS NOT A REGEX ────────────────────────────────────────────────
 *
 * A previous attempt at this migration used pattern-based edits across ~180
 * files and produced two kinds of damage:
 *
 *   1. Syntax damage — `intelDefaults: {,` — from removing a property but not
 *      its separator. Findable by the compiler, but only after the fact.
 *   2. SILENT semantic damage — stripping `visibility: 'public'` in files where
 *      that was a legitimate optional field rather than a purged one. Invisible
 *      to the compiler, because removing an optional property still typechecks.
 *
 * The second is why this exists. "classification" names SIX different things in
 * this repository, and only text can't tell them apart:
 *
 *   record handling   IntelItemUI / IntelReportUI       → migrate
 *   crypto envelope   PQCryptoService              → purge
 *   log verbosity     SecureLogger LogContext           → purge
 *   storage options   SecureStorageManager              → purge
 *   border taxonomy   geopolitical FEATURECLA           → LEAVE ALONE
 *   solar flare class solar-system                      → LEAVE ALONE
 *
 * So every site is resolved through the TypeChecker and reported with the
 * concept it belongs to. Anything that cannot be resolved is reported as
 * UNRESOLVED and left for a human — never guessed at.
 *
 * ─── SAFETY PROPERTIES ──────────────────────────────────────────────────────
 *
 * · Read-only by default. `--apply` is required to write anything.
 * · It never DELETES a property. It renames a resolved one, or does nothing.
 *   Deletions belong to the compiler-driven stage, where absence is provable.
 * · Edits replace whole AST node ranges (node.getStart()..getEnd()), so a
 *   dangling separator is not expressible.
 * · Edits are applied back-to-front within a file, so earlier offsets stay valid.
 *
 * Usage:
 *   node scripts/codemod-classification.mjs                 # inventory, by concept
 *   node scripts/codemod-classification.mjs --file <path>    # one file
 *   node scripts/codemod-classification.mjs --concept record-handling
 *   node scripts/codemod-classification.mjs --file <path> --apply
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ts = require('typescript');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };

const APPLY = has('--apply');
const ONLY_FILE = val('--file');
const ONLY_CONCEPT = val('--concept');

const PROJECT = 'tsconfig.app.json';

/** The tier vocabulary. A union containing any of these is a purged ladder. */
const TIERS = new Set([
  'UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET',
  'COMPARTMENTED', 'UNRESTRICTED', 'RESTRICTED', 'SENSITIVE', 'PUBLIC',
]);

/**
 * Which of the six concepts a site belongs to.
 *
 * Path first, because the two exempt domains and the three single-owner systems
 * are unambiguous by location. Only the remainder needs the checker.
 */
function conceptFor(file, declFile) {
  const f = file.replaceAll('\\', '/');
  const d = (declFile || '').replaceAll('\\', '/');
  if (f.includes('/src/geopolitical/')) return 'EXEMPT-border-taxonomy';
  if (f.includes('/src/solar-system/')) return 'EXEMPT-solar-flare-class';
  if (d.includes('SecureLogger')) return 'log-verbosity';
  if (d.includes('SecureStorageManager')) return 'storage-options';
  if (d.includes('PQCryptoService')) return 'crypto-envelope';
  if (d.includes('IntelItemUI') || d.includes('IntelReportUI')
    || d.includes('MissionUI') || d.includes('IntelCaseUI')) return 'record-handling';
  if (d.includes('/models/Intel/') || d.includes('/core/intel/')) return 'legacy-domain';
  if (d) return `other:${path.basename(d)}`;
  return 'UNRESOLVED';
}

/** True when a type is (or includes) a purged tier union. */
function isTierType(checker, type) {
  if (!type) return false;
  const parts = type.isUnion() ? type.types : [type];
  let sawTier = false;
  for (const t of parts) {
    if (t.isStringLiteral() && TIERS.has(t.value)) sawTier = true;
  }
  return sawTier;
}

const program = ts.createProgram({
  rootNames: ts.parseJsonConfigFileContent(
    ts.readConfigFile(PROJECT, ts.sys.readFile).config, ts.sys, process.cwd()
  ).fileNames,
  options: { ...ts.parseJsonConfigFileContent(
    ts.readConfigFile(PROJECT, ts.sys.readFile).config, ts.sys, process.cwd()
  ).options, noEmit: true },
});
const checker = program.getTypeChecker();

const sites = [];

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  const rel = path.relative(process.cwd(), sf.fileName).replaceAll('\\', '/');
  if (!rel.startsWith('src/')) continue;
  if (ONLY_FILE && rel !== ONLY_FILE.replace(/^\.\//, '')) continue;

  const visit = (node) => {
    let nameNode = null;
    let kind = null;
    if (ts.isPropertyAssignment(node) && node.name && node.name.getText() === 'classification') {
      nameNode = node.name; kind = 'property-assignment';
    } else if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node))
      && node.name && node.name.getText() === 'classification') {
      nameNode = node.name; kind = 'declaration';
    } else if (ts.isPropertyAccessExpression(node) && node.name.getText() === 'classification') {
      nameNode = node.name; kind = 'access';
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.getText() === 'classification') {
      nameNode = node.name; kind = 'shorthand';
    }

    if (nameNode) {
      const sym = checker.getSymbolAtLocation(nameNode);
      const decls = sym?.getDeclarations?.() ?? [];
      const declFile = decls.length
        ? path.relative(process.cwd(), decls[0].getSourceFile().fileName)
        : '';
      const type = sym ? checker.getTypeOfSymbolAtLocation(sym, nameNode) : undefined;
      const { line } = sf.getLineAndCharacterOfPosition(nameNode.getStart());
      sites.push({
        file: rel,
        line: line + 1,
        kind,
        concept: conceptFor(sf.fileName, declFile),
        declFile: declFile.replaceAll('\\', '/'),
        isTier: isTierType(checker, type),
        typeText: type ? checker.typeToString(type).slice(0, 90) : '(unresolved)',
        start: nameNode.getStart(),
        end: nameNode.getEnd(),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const filtered = ONLY_CONCEPT ? sites.filter((s) => s.concept === ONLY_CONCEPT) : sites;

// ── Report ─────────────────────────────────────────────────────────────────
const byConcept = new Map();
for (const s of filtered) {
  if (!byConcept.has(s.concept)) byConcept.set(s.concept, []);
  byConcept.get(s.concept).push(s);
}

console.log(`\n  classification sites resolved through the TypeChecker: ${filtered.length}\n`);
for (const [concept, list] of [...byConcept.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const tiers = list.filter((s) => s.isTier).length;
  const files = new Set(list.map((s) => s.file)).size;
  console.log(`  ${concept.padEnd(28)} ${String(list.length).padStart(4)} sites  ${String(files).padStart(3)} files  ${tiers} tier-typed`);
}

const unresolved = filtered.filter((s) => s.concept === 'UNRESOLVED');
if (unresolved.length) {
  console.log(`\n  UNRESOLVED (${unresolved.length}) — reported, never guessed at:`);
  for (const s of unresolved.slice(0, 12)) {
    console.log(`    ${s.file}:${s.line}  ${s.kind}  ${s.typeText}`);
  }
  if (unresolved.length > 12) console.log(`    … and ${unresolved.length - 12} more`);
}

if (ONLY_FILE) {
  console.log(`\n  sites in ${ONLY_FILE}:`);
  for (const s of filtered) {
    console.log(`    :${s.line}  ${s.kind.padEnd(20)} ${s.concept.padEnd(26)} tier=${s.isTier}`);
    console.log(`           declared in ${s.declFile || '(none)'}`);
    console.log(`           type ${s.typeText}`);
  }
}

if (!APPLY) {
  console.log('\n  Read-only. Pass --apply to rewrite (requires --file).\n');
  process.exit(0);
}

if (!ONLY_FILE) {
  console.error('\n  --apply requires --file: this rewrites one file at a time, by design.\n');
  process.exit(2);
}

// ── Apply: rename resolved record-handling sites only. Never deletes. ──────
const target = filtered.filter((s) => s.concept === 'record-handling' && s.isTier);
if (!target.length) {
  console.log('\n  Nothing to rewrite in this file (no resolved record-handling tier sites).\n');
  process.exit(0);
}
const file = ONLY_FILE.replace(/^\.\//, '');
let text = fs.readFileSync(file, 'utf8');
// Back-to-front, so earlier offsets stay valid.
for (const s of [...target].sort((a, b) => b.start - a.start)) {
  text = text.slice(0, s.start) + 'visibility' + text.slice(s.end);
}
fs.writeFileSync(file, text);
console.log(`\n  Rewrote ${target.length} site(s) in ${file}. Review the diff before trusting it.\n`);
