/**
 * Mission Package manifest vectors — the redaction and canonicalization contract.
 *
 * The capability vectors prove who may dispatch. These prove WHAT gets dispatched:
 * given a mission, exactly which bytes must a conforming implementation emit, and
 * what digest must it sign? Redaction rules and canonical key ordering are both
 * unguessable from the type declaration alone.
 *
 * Generated through the real builder so the vectors cannot drift from behaviour,
 * then checked by a runner that reimplements the rules independently.
 *
 * Usage: npx tsx scripts/generate-manifest-vectors.mts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { buildMissionPackageManifest } from '../src/services/intel/MissionPackageBuilder';
import { profileTags } from '../src/services/intel/packageProfile';
import { MissionStatus } from '../src/types/intel/MissionUI';
import type { MissionUI } from '../src/types/intel/MissionUI';
import type { PackageManifest } from '../src/services/exchange/types';

const OUT = 'docs/spec/mission-vectors';
mkdirSync(OUT, { recursive: true });

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

const mission = (o: Partial<MissionUI>): MissionUI => ({
  id: 'mission-vector-1', missionNumber: 'MSN-2026-0001', title: 'T', briefing: 'B',
  status: MissionStatus.READY_FOR_PACKAGE, visibility: 'public', objectives: [], assignedTo: [],
  startDate: '2026-01-15T00:00:00.000Z', relatedReports: [], relatedCases: [],
  collaborators: [], activityLog: [],
  createdBy: 'creator-pubkey', createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z', ...o,
} as MissionUI);

/** A callsign: since rev 11 a package's author is its signer (D-MX, MX7). */
const AUTHOR = 'Kestrel';
/** id and createdAt are generated per call; pinned so vectors are byte-stable. */
const PINNED = { id: 'pkg-vector', createdAt: '2026-01-15T00:00:00.000Z' };
const FIELD_WORK = { jurisdiction: 'us-ca', until: '2027-01-31T23:59:59.000Z' };
const FIELD_WORK_ENDS = Date.parse(FIELD_WORK.until) / 1000;

/** A refused vector: a built manifest whose profile is replaced by one a conforming builder never emits, and the cause it is refused for. */
type Refusal = { reason: string; profile: unknown };

const cases: Array<[string, string, Partial<MissionUI>, Refusal?]> = [
  ['manifest-position-in-briefing',
   'A decimal coordinate pair in the briefing is replaced by [redacted:position].',
   { title: 'Recon', briefing: 'Rendezvous at 52.52, 13.405 before dawn.' }],
  ['manifest-position-in-title',
   'The title is masked too — it reaches the wire in both name and reports[].title.',
   { title: 'Strike at 52.52, 13.405', briefing: 'Proceed as briefed.' }],
  ['manifest-position-dms',
   'Degrees-minutes-seconds is masked, not only decimal pairs.',
   { title: 'Recon', briefing: "Observe from 52°31'12\"N 13°24'18\"E at dusk." }],
  ['manifest-ordinary-figures-survive',
   'The lat/lon range check bounds the mask: budgets, percentages and mission numbers are untouched.',
   { title: 'Logistics', briefing: 'Budget 4500.75 over 12 days; ref MSN-2026-0001; 99.5% uptime.' }],
  ['manifest-objective-position-masked',
   'An objective crosses as an ask (since rev 5), and a coordinate typed into it is replaced by [redacted:position].',
   { title: 'Recon', briefing: 'See objectives.',
     objectives: [{ id: 'o1', description: 'Observe the 48.8566, 2.3522 rooftop', completed: false }] as never }],
  ['manifest-counts-only',
   'Linked reports and cases cross as counts, never as ids or content.',
   { title: 'Assembled', briefing: 'Built from linked evidence.',
     relatedReports: ['report-a', 'report-b'], relatedCases: ['case-a'] }],
  ['manifest-no-evidence',
   'A mission with no reports, cases or objectives still produces a complete manifest — the evidentiary void, recorded.',
   { title: 'Act on nothing', briefing: 'No evidence was gathered.' }],
  ['manifest-profile-field-work',
   'Field work signs its region and its end in the profile (rev 11), and the event carries them as tags: navcom_mission, valid_until and jurisdiction.',
   { title: 'Cooling centres', briefing: 'Check which cooling centres are open.', claims: 'one', fieldWork: FIELD_WORK }],
  ['manifest-profile-region-too-fine-refused',
   'A region is a country or a state, never finer (rev 11; D-MX, MX11): a signed profile naming a city is refused.',
   { title: 'Cooling centres', briefing: 'Check which cooling centres are open.', fieldWork: FIELD_WORK },
   { reason: 'profile-region-not-a-country-or-state',
     profile: { missionState: 'open', claims: 'many', fieldWork: { jurisdiction: 'us-tx-leander', validUntil: FIELD_WORK_ENDS } } }],
  ['manifest-profile-claimed-by-many-refused',
   'claimed is only for a task one person takes (claims: one): a campaign anybody joins is never claimed.',
   { title: 'Cooling centres', briefing: 'Check which cooling centres are open.' },
   { reason: 'profile-claimed-needs-one', profile: { missionState: 'claimed', claims: 'many' } }],
];

console.log('Writing manifest vectors:');
for (const [name, description, overrides, refusal] of cases) {
  const source = mission(overrides);
  // As it crosses the wire: JSON, where an absent field has no key.
  const built: PackageManifest = JSON.parse(JSON.stringify({ ...buildMissionPackageManifest(source, AUTHOR), ...PINNED }));
  const manifest = refusal ? { ...built, profile: refusal.profile as PackageManifest['profile'] } : built;
  const canonicalJson = canonical(manifest);
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify({
    name, description,
    // The whole mission it was built from, and its author, so the builder can be held to these bytes.
    mission: source,
    author: AUTHOR,
    expect: {
      manifest,
      canonical: canonicalJson,
      digest: bytesToHex(sha256(utf8ToBytes(canonicalJson))),
      // What the event carries beside it, as the profile table writes it; a refused vector names its cause instead.
      ...(refusal ? { refused: refusal.reason } : { tags: profileTags(manifest.profile) }),
    },
  }, null, 2) + '\n');
  console.log(`  ${name}`);
}
