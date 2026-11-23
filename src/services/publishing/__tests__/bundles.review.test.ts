/**
 * Sending a case to chosen people goes through the review (plan item 2.4,
 * slice d): what goes, to whom and where is shown first, and the bundle is
 * signed and sealed only on a yes. The signing and sealing are stand-ins
 * here; bundleOverARelay.test.ts does them for real.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nip19 } from 'nostr-tools';

const makeBundle = vi.hoisted(() => vi.fn(async () => ({ format: 'starcom.bundle', version: 1, manifest: { id: 'm' }, envelopes: [] })));
vi.mock('../../exchange/bundle', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../exchange/bundle')>()), makeBundle }));
const sendBundle = vi.hoisted(() => vi.fn(async (_file: unknown, recipients: string[]) => ({ reached: recipients, notReached: [] })));
vi.mock('../../intel/bundles/sendBundle', () => ({ sendBundle }));

import { currentReview, decideReview } from '../publishReview';
import { reviewBundleSend } from '../bundles';
import { sealedRelaysFor as bundleRelaysFor } from '../../team/sealedRelays';
import { intelWorkspaceManager } from '../../intel/IntelWorkspaceManager';
import { realTimeTeamService } from '../../RealTimeTeamService';
import { joinRelay } from '../../nostr/joinedRelays';
import { TooLargeForARelay } from '../../intel/bundles/bundleParts';

const AISHA = 'b'.repeat(64);
const INTERNAL = 'wss://relay.internal.example';

async function aCase(overrides: Record<string, unknown> = {}) {
  const id = `intel-${Math.random().toString(36).slice(2)}`;
  await intelWorkspaceManager.ensureInitialized();
  await intelWorkspaceManager.addReport({
    id, title: 'Berth 4 cranes at night', type: 'INTEL_REPORT', summary: '', content: 'Three cranes after 02:00.', conclusions: [], recommendations: [],
    analysisType: 'OSINT', methodology: [], confidence: 0.6, sourceIntel: [], author: 'x', contributors: [],
    createdAt: '2026-09-26T11:00:00.000Z', modifiedAt: '2026-09-26T12:00:00.000Z', targetAudience: [], metadata: {},
  });
  return intelWorkspaceManager.addCase({ title: 'Night loading at berth 4', description: 'Is berth 4 loading at night?', visibility: 'limited', relatedEntities: [id], ...overrides });
}

async function aReport(title: string, metadata: Record<string, unknown> = {}) {
  const id = `intel-${Math.random().toString(36).slice(2)}`;
  await intelWorkspaceManager.addReport({
    id, title, type: 'INTEL_REPORT', summary: '', content: `${title}: what was seen.`, conclusions: [], recommendations: [],
    analysisType: 'OSINT', methodology: [], confidence: 0.6, sourceIntel: [], author: 'x', contributors: [],
    createdAt: '2026-09-26T11:00:00.000Z', modifiedAt: '2026-09-26T12:00:00.000Z', targetAudience: [], metadata,
  });
  return id;
}

async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

beforeEach(() => { makeBundle.mockClear(); sendBundle.mockClear(); process.env.VITE_NOSTR_INTERNAL_RELAYS = INTERNAL; });
afterEach(() => { delete process.env.VITE_NOSTR_INTERNAL_RELAYS; });

describe('sending a case to people', () => {
  it('shows what goes, to whom and where, and signs and sends only on a yes', async () => {
    const created = await aCase();
    const outcome = reviewBundleSend({ type: 'case', id: created.id }, [AISHA]);
    const shown = await answer(true);

    expect(shown.act).toBe('Send case');
    expect(shown.content.title).toBe('Night loading at berth 4');
    expect(shown.content.body).toMatch(/report: Berth 4 cranes at night/);
    expect(shown.content.fields.find((f) => f.label === 'To')?.value).toBe(`${nip19.npubEncode(AISHA).slice(0, 14)}…${nip19.npubEncode(AISHA).slice(-6)}`);
    expect(shown.content.fields.find((f) => f.label === 'Sealed')?.value).toMatch(/not who sent it, and not what it is/);
    expect(shown.destinations).toEqual([{ address: INTERNAL, kind: 'internal' }]);

    expect(await outcome).toMatchObject({ status: 'sent', result: { reached: [AISHA] } });
    expect(makeBundle).toHaveBeenCalledWith({ type: 'case', id: created.id }, expect.arrayContaining([expect.objectContaining({ type: 'case' }), expect.objectContaining({ type: 'report' })]), []);
    expect(sendBundle).toHaveBeenCalledWith(expect.anything(), [AISHA], [INTERNAL]);
  });

  it('signs nothing and sends nothing when the person says no', async () => {
    const created = await aCase();
    const outcome = reviewBundleSend({ type: 'case', id: created.id }, [AISHA]);
    await answer(false);
    expect(await outcome).toEqual({ status: 'cancelled' });
    expect(makeBundle).not.toHaveBeenCalled();
    expect(sendBundle).not.toHaveBeenCalled();
  });

  it('says so when there is no relay to send it over, and points to the file', async () => {
    delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
    const created = await aCase();
    expect(await reviewBundleSend({ type: 'case', id: created.id }, [AISHA])).toEqual({ status: 'refused', reason: expect.stringMatching(/Export it as a file/) });
    expect(currentReview()).toBeNull();
  });

  it('never sends sample material', async () => {
    const created = await aCase({ sample: true });
    const outcome = await reviewBundleSend({ type: 'case', id: created.id }, [AISHA]);
    expect(outcome).toMatchObject({ status: 'refused' });
    expect(sendBundle).not.toHaveBeenCalled();
  });

  it('says which record is too large for a relay, before showing anything', async () => {
    const created = await aCase({ description: 'x'.repeat(60_000) });
    await expect(reviewBundleSend({ type: 'case', id: created.id }, [AISHA])).rejects.toThrow(TooLargeForARelay);
    expect(currentReview()).toBeNull();
  });

  it("goes over the team relays whose roster names the person, or every team relay joined when none does", async () => {
    const team = await realTimeTeamService.createTeam({ name: 'Newark desk', relayUrl: 'wss://relay.newark.example', relayPubkey: '9'.repeat(64) }, 'a'.repeat(64), 'a'.repeat(64));
    await realTimeTeamService.joinTeam(team.id, { pubkey: AISHA, walletAddress: AISHA, name: 'Aisha', role: 'CYBER_ANALYST' });
    await realTimeTeamService.createTeam({ name: 'Paterson desk', relayUrl: 'wss://relay.paterson.example', relayPubkey: '8'.repeat(64) }, 'a'.repeat(64), 'a'.repeat(64));
    // Nothing joined yet: the build's internal relays only.
    expect(bundleRelaysFor([AISHA])).toEqual([INTERNAL]);
    joinRelay({ url: 'wss://relay.newark.example', relayPubkey: '9'.repeat(64), team: 'Newark desk' });
    joinRelay({ url: 'wss://relay.paterson.example', relayPubkey: '8'.repeat(64), team: 'Paterson desk' });
    // Aisha is on Newark's roster, so not Paterson's relay.
    expect(bundleRelaysFor([AISHA])).toEqual([INTERNAL, 'wss://relay.newark.example']);
    // Chen joined by invite, which a roster here never hears of: every team relay joined.
    expect(bundleRelaysFor(['c'.repeat(64)])).toEqual([INTERNAL, 'wss://relay.newark.example', 'wss://relay.paterson.example']);
  });
});

describe('sending honours distribution (plan item 9.13, decision G8)', () => {
  it('refuses a Private case in words, before showing or signing anything', async () => {
    const created = await aCase({ visibility: 'private' });
    expect(await reviewBundleSend({ type: 'case', id: created.id }, [AISHA])).toEqual({
      status: 'refused', reason: expect.stringMatching(/^This case is Private: it stays in this workspace/),
    });
    expect(currentReview()).toBeNull();
    expect(makeBundle).not.toHaveBeenCalled();
  });

  it('refuses an undecided case until someone chooses, even where there is no relay, rather than pointing to a file', async () => {
    delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
    const created = await aCase({ visibility: undefined });
    expect(await reviewBundleSend({ type: 'case', id: created.id }, [AISHA])).toEqual({
      status: 'refused', reason: expect.stringMatching(/^Nobody has chosen who may receive this case yet/),
    });
    expect(currentReview()).toBeNull();
  });

  it('shows what stays here as Private and what goes undecided, and signs the list of what was kept back', async () => {
    const ledger = await aReport('Harbour master ledger', { visibility: 'private' });
    const rota = await aReport('Berth 4 shift rota');
    const cranes = await aReport('Berth 4 cranes at night', { visibility: 'limited' });
    const created = await aCase({ relatedEntities: [cranes, ledger, rota] });
    const outcome = reviewBundleSend({ type: 'case', id: created.id }, [AISHA]);
    const shown = await answer(true);

    expect(shown.content.body.split('\n')).toEqual([
      'case: Night loading at berth 4',
      'report: Berth 4 cranes at night',
      'report: Berth 4 shift rota (undecided)',
      'report: Harbour master ledger — stays here: Private',
    ]);
    expect(shown.content.fields.find((f) => f.label === 'Holds')?.value).toBe('1 case, 2 reports');
    expect(shown.content.fields.find((f) => f.label === 'Stays here')?.value)
      .toBe('1 Private record is not sent. The people it goes to see that one was kept back, never what it holds.');
    expect(shown.content.fields.find((f) => f.label === 'Undecided')?.value)
      .toBe('1 record it carries has no distribution chosen. It goes, sealed to these people, and stays undecided.');
    expect(await outcome).toMatchObject({ status: 'sent' });
    expect(makeBundle).toHaveBeenCalledWith(
      { type: 'case', id: created.id },
      [expect.objectContaining({ id: created.id }), expect.objectContaining({ id: cranes }), expect.objectContaining({ id: rota })],
      [{ type: 'report', id: ledger, title: 'Harbour master ledger' }],
    );
  });

  it('says nothing of what stays here, or of undecided records, when there are none', async () => {
    const created = await aCase({ relatedEntities: [] });
    const outcome = reviewBundleSend({ type: 'case', id: created.id }, [AISHA]);
    const shown = await answer(false);
    await outcome;
    expect(shown.content.fields.map((f) => f.label)).toEqual(['To', 'Holds', 'Sealed', 'Readable']);
  });
});
