#!/usr/bin/env node
/**
 * @asserts A sentence of the app's copy has 20 words or fewer, and a count never says "(s)".
 *
 * COPY LENGTH GUARD (plan item 3.1)
 *
 * The house style (intern-readiness.md, section 7): say what the person can do
 * next; lead with the fact and put the caveat behind a "?"; keep a sentence
 * under 20 words; never write "(s)". The walk of 2026-09-26 found the app's
 * honesty stated as essays, and a newcomer read neither the essay nor the
 * caveat inside it. The honesty stays; the sentences get shorter.
 *
 * What it reads: every string in a .tsx file under src/ (JSX text, attributes,
 * and literals that reach the screen by way of a variable), and the modules
 * that hold the words the app says (COPY_MODULES). A template's `${…}` counts
 * as one word. Not read: tests, stories, SVG path data and other strings that
 * are not prose, and markdown documents carried as content.
 *
 * A guard that reads nothing must not pass, so an empty scan fails.
 */
import ts from 'typescript';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const MAX_WORDS = 20;

/** Where the app's words live outside components. */
const COPY_MODULES = [
  'src/services/epistemic/epistemicLanguage.ts',
  'src/services/help/glossary.ts',
  'src/components/Coach/coachSteps.ts',
  'src/services/intel/bundles/bundleDistribution.ts',
  'src/services/nostr/publishTargets.ts',
  // The app's English words, moved out of components as they are translated (D-ML, L1). Other languages
  // are not held to an English sentence's length.
  'src/i18n/app/en.ts', 'src/i18n/uplink/en.ts',
];

/**
 * Files left as written, each with its reason. An exemption nobody justifies
 * becomes the hole the next essay goes through.
 */
const EXEMPT = new Map([
  ['src/components/SupportDrive/SupportFunnelRoot.tsx',
    "the project's own appeal, in its owner's voice: not instructions for using the app (owner, 2026-09-30)"],
]);

function* sources(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (/\.tsx$/.test(entry) && !/\.(test|spec|stories)\.tsx$/.test(entry)) yield full;
  }
}

const rel = (file) => relative(ROOT, file).split(sep).join('/');

/** A word a reader reads: letters, perhaps with an apostrophe, hyphen or punctuation round it. */
const WORD = /^[("“'‘[]*[A-Za-z][A-Za-z'’-]*[)"”'’.,;:!?…\]]*$/;
const tokens = (s) => s.split(/\s+/).filter(Boolean);
const wordCount = (s) => tokens(s).filter((t) => /[A-Za-z0-9]/.test(t)).length;
/** Prose, as against path data, identifiers or numbers: most of it is words. */
const isProse = (s) => {
  const all = tokens(s);
  return all.length > 0 && all.filter((t) => WORD.test(t)).length / all.length >= 0.6;
};
/** Markdown carried as content, not a sentence of the app's own. */
const isDocument = (s) => /(^|\n)\s*(---|#{1,6} )/.test(s);
const sentencesOf = (s) => s.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=["“'‘(]?[A-Z0-9])/);
const decode = (s) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

const findings = [];
const allowed = new Set();
let read = 0;

const files = [...sources(join(ROOT, 'src')), ...COPY_MODULES.map((m) => join(ROOT, m)).filter(existsSync)];
for (const file of files) {
  const name = rel(file);
  const text = readFileSync(file, 'utf8');
  read += 1;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const check = (node, value, isJsxText) => {
    if (!isJsxText && isDocument(value)) return;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const hits = [];
    if (/\w\(s\)/.test(value)) hits.push({ line, what: '"(s)"', text: value.replace(/\s+/g, ' ').trim() });
    for (const sentence of sentencesOf(decode(value))) {
      if (!isProse(sentence)) continue;
      const n = wordCount(sentence);
      if (n > MAX_WORDS) hits.push({ line, what: `${n} words`, text: sentence });
    }
    if (!hits.length) return;
    if (EXEMPT.has(name)) { allowed.add(name); return; }
    for (const hit of hits) findings.push({ file: name, ...hit });
  };
  const visit = (node) => {
    // An attribute that holds a path or an address, never words.
    if (ts.isJsxAttribute(node) && ['d', 'points', 'viewBox', 'className', 'href', 'src', 'data-testid'].includes(node.name.getText(source))) return;
    if (ts.isJsxText(node)) check(node, node.getText(source), true);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node, node.text, false);
    else if (ts.isTemplateExpression(node)) {
      const joined = node.head.text + node.templateSpans.map((span) => `X${span.literal.text}`).join('');
      check(node, joined, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (read === 0) {
  console.error('\n  COPY LENGTH GUARD: nothing to read under src/. Failing rather than passing on nothing.\n');
  process.exit(1);
}

console.log(`\n  COPY LENGTH GUARD — ${read} ${read === 1 ? 'file' : 'files'} read\n`);
for (const name of allowed) console.log(`  allowed  ${name} — ${EXEMPT.get(name)}`);
if (!findings.length) {
  console.log('  Every sentence has 20 words or fewer, and no count says "(s)".\n');
  process.exit(0);
}
for (const f of findings) console.log(`  ${f.file}:${f.line}  ${f.what}  ${f.text.slice(0, 110)}${f.text.length > 110 ? '…' : ''}`);
console.log(`
  ${findings.length === 1 ? '1 place breaks' : `${findings.length} places break`} the house style: a sentence over ${MAX_WORDS} words, or "(s)".
  Say what the person can do next. Lead with the fact; put the caveat behind a "?".
  Shorten the sentence, never delete the caveat.
`);
process.exit(1);
