/**
 * Names never leave this browser (plan item 2.1; Locked Decision #7).
 *
 * A name is for reading this screen. It must not reach a Mission Package, a
 * finding, or a relay as a profile: a package carries objectives and a
 * briefing, never who wrote them, and a name a person typed for themselves is
 * not something they agreed to publish.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { setOwnName, learnName, forgetNames } from '../names';
import { nostrIdentityService } from '../NostrIdentityService';
import { missionService } from '../../intel/MissionService';
import { buildMissionPackageManifest } from '../../intel/MissionPackageBuilder';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { intelCaseService } from '../../intel/IntelCaseService';
import { attestationForCasePosition } from '../../intel/findings/caseAdjudication';

const AISHA = 'b'.repeat(64);
const MARK = 'ZX9Q'; // in every name here, so any leak is one search

beforeEach(() => {
  forgetNames();
  setOwnName(`Priya Raman ${MARK}`);
  learnName(AISHA, `Aisha Knight ${MARK}`, 'team');
});

describe('what a name never reaches', () => {
  it('a Mission Package, even from a mission with named collaborators and comments', async () => {
    const created = await missionService.createMission({
      title: 'Paterson shelters', briefing: 'Beds tonight. Rests on direct observation.', visibility: 'public',
    });
    const me = nostrIdentityService.signerPubkey()!;
    await missionService.saveMission({
      ...created,
      collaborators: [{ userId: AISHA, name: `Aisha Knight ${MARK}`, addedAt: new Date().toISOString(), addedBy: me }],
      comments: [{ id: 'c1', content: 'On my way.', author: me, createdAt: new Date().toISOString() } as never],
    });
    const mission = (await missionService.getMission(created.id))!;

    expect(JSON.stringify(buildMissionPackageManifest(mission))).not.toContain(MARK);
  });

  it("a finding: a case's published position", async () => {
    const id = (await caseManagerAdapter.addCase({ title: 'Newark food banks', description: 'Which are closed.', visibility: 'public' }))!;
    await caseManagerAdapter.statePosition(id, 'Two of the five sites are closed.');
    const record = (await intelCaseService.getCase(id))!;

    const attestation = attestationForCasePosition(record, {
      subjectRef: 'Newark food bank network', subjectKind: 'person', evidenceIsSynthetic: false,
    });
    expect(attestation).not.toBeNull();
    expect(JSON.stringify(attestation)).not.toContain(MARK);
  });
});

describe('what reads names', () => {
  const src = join(process.cwd(), 'src');
  const sources = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
  const files = sources(src).map((path) => ({ path: relative(src, path), text: readFileSync(path, 'utf8') }));

  it('is nothing that builds, signs or sends an event, but a bundle', () => {
    const readers = files.filter((f) => /from ['"](?:[^'"]*\/identity|\.)\/names['"]/.test(f.text)).map((f) => f.path);
    const senders = /^services\/(publishing|nostr|exchange)\/|^services\/intel\/(findings|capability)\/|MissionPackage|nostrService|Broadcast/;
    // A bundle goes only to the people its sender chooses, encrypted to each or
    // as a file they hand over, and carries the sender's own name so the
    // receiver can say who it is from (plan items 2.1 and 2.4). Only their own:
    // bundle.test.ts holds that no name learned for anyone else goes with it.
    const bundle = 'services/exchange/bundle.ts';
    expect(readers.filter((path) => senders.test(path) && path !== bundle)).toEqual([]);
  });

  it('publishes no profile: nothing writes a kind 0 event', () => {
    const profileWriters = files.filter((f) => /\bkind:\s*0\b/.test(f.text)).map((f) => f.path);
    expect(profileWriters).toEqual([]);
  });
});
