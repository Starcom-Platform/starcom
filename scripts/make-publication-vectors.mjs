#!/usr/bin/env node
/**
 * Generates the publication-policy conformance vectors.
 *
 * These are the shared artifact. scripts/peer/publication.mjs is a worked
 * example and Starcom's TypeScript is another; neither is authoritative. A peer
 * that ports the policy, or writes their own from the prose, checks it here.
 *
 * WHY THE VECTORS RATHER THAN A LIBRARY: a single module everyone imports would
 * make Starcom the moderator of what other people may publish, which is the
 * role this architecture is built to avoid. We do not host their content, do
 * not hold their keys, and should not own their policy. Agreeing on OUTCOMES
 * while disagreeing about implementation is the arrangement that lets four
 * nodes cooperate without one of them being in charge.
 *
 * Every case here is one an investigator would plausibly have. Subjects are
 * role descriptions and synthetic identifiers — a vector file that fabricates
 * claims about real people would be the exact failure the policy exists to
 * prevent.
 *
 * Usage: node scripts/make-publication-vectors.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'docs/spec/publication-vectors';

const vectors = [];
const add = (name, description, subjectKind, options, expect) => {
  vectors.push({ name, description, subjectKind, options, expect });
};

// ── Containment: is this a publication at all? ─────────────────────────────
add('contained-by-default', 'Material held in a workspace is not a publication candidate, whatever else is true.',
  'organization', { isMock: false, containment: { contained: true, reason: 'working-material' } },
  { allowed: false, reasonMatches: 'workspace' });

add('contained-outranks-consent', 'Containment is checked ABOVE consent — a released decision is separate from a publish decision.',
  'person', { isMock: false, consentToPublishAboutPerson: true, subjectRole: 'public-office',
    containment: { contained: true, reason: 'person-subject-default' } },
  { allowed: false, reasonMatches: 'workspace' });

add('released-then-judged', 'Released material still faces every check below it. Release is not permission.',
  'person', { isMock: false, containment: { contained: false, releasedBy: 'a', releasedReason: 'r', releasedAt: '2026-08-26T00:00:00Z' } },
  { allowed: false, reasonMatches: 'private individual' });

add('absent-containment-passes', 'Absent containment means NOT containment-managed, and does not block. Opt-in, not universal.',
  'organization', { isMock: false }, { allowed: true });

// ── Provenance: is the evidence real? ──────────────────────────────────────
add('fabricated-refused', 'Mock evidence never reaches the wire, signed and indistinguishable from real intelligence.',
  'organization', { isMock: true }, { allowed: false, reasonMatches: 'fabricated' });

add('unmeasured-provenance-refused', 'Undefined is refused alongside true: "nobody said" is not permission.',
  'organization', {}, { allowed: false, reasonMatches: 'does not state whether it is real' });

// ── Non-person subjects publish without ceremony ───────────────────────────
add('organization-publishes', 'Institutions are accountable. This is the ordinary case and must not prompt.',
  'organization', { isMock: false }, { allowed: true });

add('object-publishes', 'Threat infrastructure, vessels, hashes. Nothing here touches a person.',
  'object', { isMock: false }, { allowed: true });

add('place-publishes', 'A location where something regulated happened.',
  'place', { isMock: false }, { allowed: true });

add('unknown-subject-publishes', 'Deliberately allowed. Blocking it would make the person prompt routine, and a prompt that appears constantly stops being deliberation.',
  'unknown', { isMock: false }, { allowed: true });

// ── People in a public role ────────────────────────────────────────────────
add('public-office-with-consent', 'A legislator taking money from the regulator they chair. The least controversial publication in journalism.',
  'person', { isMock: false, subjectRole: 'public-office', consentToPublishAboutPerson: true },
  { allowed: true });

add('public-office-without-consent', 'Publishable, but still deliberate. Consent keeps it an act rather than a side effect.',
  'person', { isMock: false, subjectRole: 'public-office' },
  { allowed: false, reasonMatches: 'public office capacity' });

add('corporate-officer', 'A named officer acting in a role they hold publicly and are accountable for.',
  'person', { isMock: false, subjectRole: 'corporate-officer', consentToPublishAboutPerson: true },
  { allowed: true });

add('criminal-persona', 'A threat actor handle attributed by its own conduct. Core cyber investigation work.',
  'person', { isMock: false, subjectRole: 'criminal-persona', consentToPublishAboutPerson: true },
  { allowed: true });

// ── Private individuals ────────────────────────────────────────────────────
add('private-consent-alone-refused', 'THE LOAD-BEARING CASE. Consent alone published a whistleblower identity, a child\'s home address, a private donor and a recruitment candidate.',
  'person', { isMock: false, consentToPublishAboutPerson: true },
  { allowed: false, reasonMatches: 'private individual' });

add('private-absent-role-is-private', 'No subjectRole means private. Defaulting the other way would publish anyone nobody classified.',
  'person', { isMock: false, consentToPublishAboutPerson: true, subjectRole: undefined },
  { allowed: false, reasonMatches: 'private individual' });

add('private-with-justification', 'No absolute bar, deliberately: absolute bars get routed around. A landlord with 214 unremedied violations publishes because someone wrote down why.',
  'person', { isMock: false, subjectRole: 'private', consentToPublishAboutPerson: true,
    publicInterestJustification: '214 unremedied housing-code violations across 30 buildings; harm ongoing' },
  { allowed: true });

add('private-justification-without-consent', 'Both are required. A stated reason does not replace the decision to publish.',
  'person', { isMock: false, subjectRole: 'private', publicInterestJustification: 'documented ongoing harm' },
  { allowed: false, reasonMatches: 'private individual' });

add('private-blank-justification', 'Whitespace is not a justification. An empty field would let the check be satisfied by pressing a key.',
  'person', { isMock: false, subjectRole: 'private', consentToPublishAboutPerson: true, publicInterestJustification: '   ' },
  { allowed: false, reasonMatches: 'private individual' });

// ── Vocabulary ─────────────────────────────────────────────────────────────
add('unrecognised-role-refused', 'An unknown role is refused rather than coerced to private — a typo must not silently change the decision.',
  'person', { isMock: false, subjectRole: 'head-of-state', consentToPublishAboutPerson: true },
  { allowed: false, reasonMatches: 'Unrecognised subjectRole' });

fs.mkdirSync(OUT, { recursive: true });
for (const v of vectors) {
  fs.writeFileSync(path.join(OUT, `${v.name}.json`), JSON.stringify(v, null, 2) + '\n');
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
  format: 'Starcom publication policy vectors',
  version: 1,
  generatedBy: 'scripts/make-publication-vectors.mjs',
  note:
    'The shared artifact. scripts/peer/publication.mjs is a worked example and '
    + "Starcom's TypeScript is another; neither is authoritative. Port the policy or "
    + 'write your own, then check it here. Agreeing on outcomes while disagreeing about '
    + 'implementation is what lets nodes cooperate without one being in charge.',
  vectors: vectors.map((v) => ({ name: v.name, description: v.description, file: `${v.name}.json` })),
}, null, 2) + '\n');

console.log(`\nWrote ${vectors.length} publication vectors to ${OUT}/`);
for (const v of vectors) console.log(`  ${v.name}`);
console.log('');
