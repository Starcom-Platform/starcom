/**
 * Nothing is published without the publish review (plan item 0.1).
 *
 * The guard is what makes the review the only way to publish, so it has to be
 * watched failing: on a planted direct call, on a raw relay publish, on a
 * review nobody mounted, and on a ratchet entry left behind after its path
 * moved.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-publish-review.mjs';

const clean = {
  'src/App.tsx': 'import PublishReviewRoot from "./components/Publishing/PublishReviewRoot";\nexport const App = () => <PublishReviewRoot />;\n',
  'src/services/intel/MissionService.ts': 'export const s = { async publishToNavcom(id: string) { return id; } };\n',
  'src/services/publishing/missionPackage.ts': 'import { missionService } from "../intel/MissionService";\nexport const go = (id: string) => missionService.publishToNavcom(id);\n',
  'src/services/intel/MissionPackageBroadcastService.ts': 'export const b = (pool: any, relays: string[], e: unknown) => pool.publish(relays, e);\n',
};

const ratchet = (entries: Record<string, string[]>) => ({
  'scripts/publish-review-ratchet.json': JSON.stringify({ why: 'test', notYetReviewed: entries }),
});

describe('guard-publish-review', () => {
  it('passes when publishing goes through the review and relays are published to only by publishing services', () => {
    expect(runGuardIn(GUARD, clean).status).toBe(0);
  });

  it('FAILS on a screen that calls a publishing entry point itself', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/applications/somewhere/Panel.tsx': 'export const onClick = () => missionService.publishToNavcom("m-1");\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/src\/applications\/somewhere\/Panel\.tsx:1\s+calls publishToNavcom directly/);
  });

  // A closing republishes a package (D-MX, MX12): its sending half is reviewed like the others.
  it('FAILS on a screen that sends a mission\'s closing itself, without its review', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/applications/somewhere/Panel.tsx': 'export const onClose = (p: unknown) => missionService.publishPreparedClosing(p);\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/src\/applications\/somewhere\/Panel\.tsx:1\s+calls publishPreparedClosing directly/);
  });

  it('FAILS on a screen that uploads to IPFS itself: that publishes too (plan 9.1)', () => {
    // The direct-message paperclip put the plain file on IPFS, with a public
    // gateway link, and nothing counted it as publishing.
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/components/Chat/Window.tsx': 'import { uploadToIPFS } from "../../lib/ipfs-client";\nexport const attach = (f: File) => uploadToIPFS(f);\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/src\/components\/Chat\/Window\.tsx:2\s+calls uploadToIPFS directly/);
  });

  it('FAILS on a screen that uploads an intel package to IPFS itself', () => {
    // Intel Packages' "Create" uploaded each new package at once, unreviewed.
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/components/Intel/PackageScreen.tsx': 'export const create = (p: unknown) => ipfsService.uploadIntelPackage(p, "me");\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/PackageScreen\.tsx:1\s+calls uploadIntelPackage directly/);
  });

  it('FAILS on a raw relay publish outside the publishing services', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/services/elsewhere.ts': 'export const leak = (pool: any, e: unknown) => pool.publish(["wss://r"], e);\n',
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/src\/services\/elsewhere\.ts:1\s+publishes to relays directly/);
  });

  it('FAILS when the review is not mounted', () => {
    const run = runGuardIn(GUARD, { ...clean, 'src/App.tsx': 'export const App = () => null;\n' });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/does not mount <PublishReviewRoot \/>/);
  });

  it('lets a listed direct call stand while its path moves, and no other', () => {
    const panel = { 'src/applications/somewhere/Panel.tsx': 'export const a = () => publishFinding(f);\nexport const b = () => retractFinding(s);\n' };
    const run = runGuardIn(GUARD, { ...clean, ...panel, ...ratchet({ 'src/applications/somewhere/Panel.tsx': ['publishFinding'] }) });
    expect(run.status).toBe(1);
    expect(run.output).not.toMatch(/calls publishFinding directly/);
    expect(run.output).toMatch(/Panel\.tsx:2\s+calls retractFinding directly/);
  });

  it('FAILS on a ratchet entry whose call has gone, so the list only shrinks', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/applications/somewhere/Panel.tsx': 'export const nothingPublishedHere = 1;\n',
      ...ratchet({ 'src/applications/somewhere/Panel.tsx': ['publishFinding'] }),
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/no longer calls publishFinding directly\. Delete it from scripts\/publish-review-ratchet\.json/);
  });

  it('has no view on comments, tests, or calls inside the module that implements them', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/applications/somewhere/Notes.tsx': '// missionService.publishToNavcom(id) now goes through the review\nexport const x = 1;\n',
      'src/applications/somewhere/__tests__/Panel.test.tsx': 'missionService.publishToNavcom("m-1");\npool.publish(["wss://r"], e);\n',
      'src/services/intel/findings/FindingsPublisherService.ts': 'export async function publishFinding(f: unknown) { return broadcast.publishFinding(f); }\n',
    });
    expect(run.status).toBe(0);
  });

  it('FAILS when there is no source to scan, rather than passing on nothing', () => {
    const run = runGuardIn(GUARD, { 'README.md': 'nothing here\n' });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/cannot confirm/);
  });
});
