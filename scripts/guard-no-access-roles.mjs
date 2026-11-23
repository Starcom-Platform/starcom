#!/usr/bin/env node
/**
 * @asserts No intel record offers or stores an access level that nothing enforces: no collaborator roles, and no per-user permission lists.
 *
 * ─── WHAT WAS HERE ─────────────────────────────────────────────────────────
 *
 * Cases, missions and reports carried a role for each collaborator (VIEWER,
 * COMMENTER, EDITOR, MANAGER, OWNER) and lists of who might comment, edit,
 * delete, share and assign. A report's collaborator form offered the five roles
 * in a picker, and every mission collaborator was labelled EDITOR. Nothing
 * checked any of it.
 *
 * ─── WHY NOTHING COULD ─────────────────────────────────────────────────────
 *
 * Starcom is local-first. The record lives in the operator's own storage, so a
 * list of who may edit it is a list its holder can edit. Showing one implies a
 * control that does not exist, which is the same theatre the classification
 * purge removed (guard-no-classification). The authority that is real is
 * signed and checkable by anyone: see
 * src/services/intel/capability/missionCapability.ts, where a mission's
 * dispatch is delegated by signature.
 *
 * ─── WHAT IS NOT FORBIDDEN ─────────────────────────────────────────────────
 *
 * `isPublic` remains on records, because the attention queue reads it
 * (caseVisibility.ts): a public case is everyone's business, which is relevance,
 * not access. Collaborators remain, as who is working on something.
 *
 * The list names are forbidden only in intel code. Other domains use words like
 * `canEdit` for their own purposes, and this guard has no view on those.
 *
 * Test files are not scanned: a test may hold a record saved before the removal,
 * to prove the old keys are ignored.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { sync: globSync } = require('glob');

const INTEL_CODE = [
  'src/types/intel/',
  'src/core/intel/',
  'src/services/intel/',
  'src/components/Intel/',
  'src/applications/teamworkspace/',
  'src/pages/Cases/',
];

const RULES = [
  {
    name: 'collaborator roles',
    applies: () => true,
    forbid: /\bCollaboratorRole\b|\brole\s*:\s*['"](VIEWER|COMMENTER|EDITOR|MANAGER|OWNER)['"]/,
    why: 'A collaborator is who is working on something. A role from VIEWER to OWNER implies an access level nothing enforces.',
  },
  {
    name: 'per-user permission lists',
    applies: (file) => INTEL_CODE.some((dir) => file.startsWith(dir)),
    forbid: /\b(canComment|canEdit|canDelete|canShare|canAssign|externalSharing)\b/,
    why: 'Whoever holds this browser\'s storage can edit a list of who may edit. Authority that matters is signed: see missionCapability.ts.',
  },
];

const isTest = (file) => /\/__tests__\/|\/tests\/|\.(test|spec|vitest)\.[tj]sx?$/.test(file);

/** Comments are prose about the removal, not code that stores anything. */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const files = globSync('src/**/*.{ts,tsx}', { nodir: true }).map((f) => f.split('\\').join('/')).filter((f) => !isTest(f));

if (files.length === 0) {
  console.error('Access-roles guard FAILED — no source files found under src/, so it cannot confirm anything.');
  process.exit(1);
}

const violations = [];
for (const file of files) {
  const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
  for (const rule of RULES) {
    if (!rule.applies(file)) continue;
    lines.forEach((line, i) => {
      const match = line.match(rule.forbid);
      if (match) violations.push({ file, line: i + 1, rule, found: match[0] });
    });
  }
}

if (violations.length > 0) {
  console.error(`Access-roles guard FAILED — ${violations.length} violation(s).`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.rule.name}: \`${v.found}\``);
    console.error(`    ${v.rule.why}`);
  }
  console.error('Remove it. If a record needs a real authority, make it a signed, checkable grant instead.');
  process.exit(1);
}

console.log(`Access-roles guard passed: ${files.length} source files scanned; no collaborator roles, and no permission lists in intel code.`);
