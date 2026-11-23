/**
 * Records are attributed to whoever signs (plan item 2.2).
 *
 * With a signer extension installed, creating a case or a mission minted a
 * second, local key and recorded the work under it, while everything the
 * person published was signed by the extension. Reports took whatever the
 * caller wrote: 'anonymous', 'ANALYST', or a wallet's key.
 *
 * Real persistence, as in the workspace suites.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, afterEach } from 'vitest';
import nostrService from '../../nostrService';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { missionService } from '../MissionService';
import { intelCaseService } from '../IntelCaseService';
import { intelReportService } from '../IntelReportService';

const EXTENSION_PUBKEY = 'e'.repeat(64);
const withExtension = () => {
  (globalThis as { nostr?: unknown }).nostr = {
    getPublicKey: async () => EXTENSION_PUBKEY,
    signEvent: async (event: Record<string, unknown>) => ({ ...event, pubkey: EXTENSION_PUBKEY, sig: 'x', id: 'y' }),
  };
};

afterEach(() => {
  delete (globalThis as { nostr?: unknown }).nostr;
  nostrService.forgetIdentity();
});

describe('with a signer extension installed', () => {
  it("records a new case as the extension key's, and makes no local key", async () => {
    nostrService.forgetIdentity();
    withExtension();
    const id = await caseManagerAdapter.addCase({ title: 'Attributed case', description: 'Whose is it?' });
    const created = (await intelCaseService.getCase(id!))!;

    expect(created.createdBy).toBe(EXTENSION_PUBKEY);
    expect(created.activityLog[0].userId).toBe(EXTENSION_PUBKEY);
    expect(nostrService.hasIdentity()).toBe(false);
  });

  it("records a new mission, and its first log entry, as the extension key's", async () => {
    nostrService.forgetIdentity();
    withExtension();
    const mission = await missionService.createMission({ title: 'Attributed mission', briefing: 'Whose is it?' });

    expect(mission.createdBy).toBe(EXTENSION_PUBKEY);
    expect(mission.activityLog[0].userId).toBe(EXTENSION_PUBKEY);
    expect(nostrService.hasIdentity()).toBe(false);
  });

  it("records a report written here as the extension key's when nobody else is named", async () => {
    nostrService.forgetIdentity();
    withExtension();
    const report = await intelReportService.createReport({ title: 'Attributed report', content: 'Seen.', category: 'general', tags: [] });

    expect(report.author).toBe(EXTENSION_PUBKEY);
    expect(nostrService.hasIdentity()).toBe(false);
  });
});

describe('without one', () => {
  it("records a report under this browser's key, never a placeholder", async () => {
    const report = await intelReportService.createReport({ title: 'Local report', content: 'Seen.', category: 'general', tags: [] });

    expect(report.author).toBe(nostrService.getPublicKey());
    expect(report.author).not.toMatch(/^(anonymous|ANALYST|Current User|offline-user)$/);
  });
});
