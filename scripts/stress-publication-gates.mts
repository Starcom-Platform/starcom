/**
 * What can this platform actually publish?
 *
 * Run because an investigator put it plainly: if the gates flinch on people,
 * they will flinch on everything, and the tool is a toy. That is a claim about
 * behaviour, so it gets measured rather than argued with.
 *
 * Every case below is one an investigator working cyber investigations or
 * strategic intelligence would plausibly have on their desk. Each states what
 * SHOULD happen on the merits — the standard journalism and defamation law
 * already use, not a house rule — and the run reports what actually happens.
 *
 * No real individuals. Subjects are role descriptions and synthetic
 * identifiers, because a stress test that fabricates claims about actual people
 * is the exact failure it exists to check for.
 *
 * Usage: npx tsx --tsconfig tsconfig.app.json scripts/stress-publication-gates.mts
 */
import { evaluatePublication } from '../src/services/intel/findings/publicationPolicy';
import { release } from '../src/services/intel/findings/workspaceContainment';
import type { SubjectKind } from '../src/types/intel/SourceObservation';

type Expect = 'publish' | 'refuse';

interface Case {
  id: string;
  what: string;
  subjectKind: SubjectKind;
  /** How the subject stands to public power. Absent means private. */
  role?: 'public-office' | 'corporate-officer' | 'criminal-persona' | 'private';
  /** Convenience for the section split below. */
  publicRole?: boolean;
  /** Why publishing about a private individual serves the public. */
  justification?: string;
  expect: Expect;
  why: string;
}

const CASES: Case[] = [
  // ── Non-person intel. If the platform flinches here, the charge is proven. ──
  {
    id: 'C-01',
    what: 'Ransomware crew\'s C2 infrastructure: 14 IPs, 3 domains, TLS fingerprint',
    subjectKind: 'object',
    expect: 'publish',
    why: 'Threat infrastructure attribution is the core of cyber investigation. Nothing about it touches a private person.',
  },
  {
    id: 'C-02',
    what: 'Corporate services firm is the PSC of 4,486 UK companies',
    subjectKind: 'organization',
    expect: 'publish',
    why: 'A countable fact from a public register about a company. Already published by this node.',
  },
  {
    id: 'C-03',
    what: 'Defence contractor holds 11 subsidiaries in three secrecy jurisdictions',
    subjectKind: 'organization',
    expect: 'publish',
    why: 'Corporate structure from filings. Public-interest reporting on an institution.',
  },
  {
    id: 'C-04',
    what: 'Government ministry\'s procurement went to one vendor in 87% of contracts',
    subjectKind: 'organization',
    expect: 'publish',
    why: 'Public spending, public record. This is what oversight looks like.',
  },
  {
    id: 'C-05',
    what: 'Police department deployed facial recognition at 40 protest sites',
    subjectKind: 'organization',
    expect: 'publish',
    why: 'State surveillance capability, matter of public concern.',
  },
  {
    id: 'C-06',
    what: 'Named APT group attributed to a state intelligence service',
    subjectKind: 'organization',
    expect: 'publish',
    why: 'Standard threat intelligence. Published by every major vendor.',
  },
  {
    id: 'C-07',
    what: 'Vessel switched off AIS for 9 days inside a sanctions exclusion zone',
    subjectKind: 'object',
    expect: 'publish',
    why: 'Observable behaviour of a tracked object. Nothing personal.',
  },
  {
    id: 'C-08',
    what: 'Chemical plant discharge exceeded permit at a named site',
    subjectKind: 'place',
    expect: 'publish',
    why: 'Environmental harm at a location, regulated and on the record.',
  },

  // ── People. The contested ground, and where the standard actually matters. ──
  {
    id: 'C-09',
    role: 'public-office',
    what: 'Sitting legislator received payments from a shell company while chairing its regulator',
    subjectKind: 'person',
    publicRole: true,
    expect: 'publish',
    why: 'Public official, official capacity, corruption. The single clearest case in all of journalism.',
  },
  {
    id: 'C-10',
    role: 'public-office',
    what: 'Named police officer discharged a weapon; incident is in the public inquest record',
    subjectKind: 'person',
    publicRole: true,
    expect: 'publish',
    why: 'State agent exercising state power, already a matter of public record.',
  },
  {
    id: 'C-11',
    role: 'corporate-officer',
    what: 'CEO of a listed company signed off the filings now under investigation',
    subjectKind: 'person',
    publicRole: true,
    expect: 'publish',
    why: 'A named officer acting in a corporate role they hold publicly and are accountable for.',
  },
  {
    id: 'C-12',
    role: 'criminal-persona',
    what: 'Ransomware operator\'s handle, linked across four forums by writing style and reused infra',
    subjectKind: 'person',
    publicRole: true,
    expect: 'publish',
    why: 'Attribution of a criminal actor by their operational persona. Core threat intel work.',
  },
  {
    id: 'C-13',
    what: 'Whistleblower\'s real identity, deduced from document metadata',
    subjectKind: 'person',
    publicRole: false,
    expect: 'refuse',
    why: 'Publishing this endangers the person the network exists to protect. Never a publication.',
  },
  {
    id: 'C-14',
    what: 'Home address of a target\'s adult child',
    subjectKind: 'person',
    publicRole: false,
    expect: 'refuse',
    why: 'Collateral private individual. No public role, no public interest, real physical risk.',
  },
  {
    id: 'C-15',
    what: 'Private citizen who once donated to a campaign under investigation',
    subjectKind: 'person',
    publicRole: false,
    expect: 'refuse',
    why: 'A donation is public record; making a person a subject over it is not proportionate.',
  },
  {
    id: 'C-16',
    what: 'Ex-intelligence contact identified as a possible EIN recruit',
    subjectKind: 'person',
    publicRole: false,
    expect: 'refuse',
    why: 'Recruitment research. Should never have been a publication candidate at all.',
  },

  // ── The escape hatch, tested. There is no absolute bar, deliberately. ──
  {
    id: 'C-17',
    what: 'Private landlord with 214 unremedied housing-code violations across 30 buildings',
    subjectKind: 'person',
    publicRole: false,
    justification: 'A private person whose conduct is causing documented harm to hundreds of tenants; '
      + 'the violations are on the public record and the harm is ongoing.',
    expect: 'publish',
    why: 'No public office, but a stated and recorded public interest. Absolute bars get routed around; '
      + 'a question an editor asks out loud does not.',
  },
];

const g = (s: string) => `\x1b[32m${s}\x1b[0m`;
const r = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

console.log('\n  PUBLICATION STRESS TEST — what this platform will actually put on the wire\n');

let wrong = 0;
const rows: Array<{ c: Case; actual: Expect; reason: string }> = [];

for (const c of CASES) {
  // Real investigator conditions: evidence is real, and the operator has made a
  // considered decision to publish about this subject where it is a person.
  const containment = c.subjectKind === 'person'
    ? release('investigator', 'reviewed for publication')
    : undefined;

  const decision = evaluatePublication(c.subjectKind, {
    isMock: false,
    consentToPublishAboutPerson: c.subjectKind === 'person' ? true : undefined,
    containment,
    subjectRole: c.role,
    publicInterestJustification: c.justification,
  });

  const actual: Expect = decision.allowed ? 'publish' : 'refuse';
  const reason = decision.allowed ? '' : decision.reason;
  if (actual !== c.expect) wrong++;
  rows.push({ c, actual, reason });
}

const section = (title: string, filter: (c: Case) => boolean) => {
  console.log(`  ${title}`);
  for (const { c, actual } of rows.filter(({ c }) => filter(c))) {
    const ok = actual === c.expect;
    const mark = ok ? g('  ok  ') : r(' WRONG');
    console.log(`   ${mark} ${c.id}  ${c.what.slice(0, 72)}`);
    console.log(`          expected ${c.expect.padEnd(8)} got ${actual}`);
    if (!ok) console.log(r(`          ${c.why}`));
  }
  console.log('');
};

section('NON-PERSON INTEL', (c) => c.subjectKind !== 'person');
section('PEOPLE IN A PUBLIC ROLE', (c) => c.subjectKind === 'person' && c.publicRole === true);
section('PRIVATE INDIVIDUALS', (c) => c.subjectKind === 'person' && c.publicRole !== true);

console.log(`  ${CASES.length} cases, ${wrong === 0 ? g('0 wrong') : r(`${wrong} wrong`)}\n`);

if (wrong) {
  console.log(dim('  A wrong row is not a policy disagreement. It is the gate answering a'));
  console.log(dim('  question it was never asked — see which axis the cases differ on.\n'));
}
process.exit(wrong ? 1 : 0);
