/**
 * NetRunner's broadcast through the publish review (plan item 0.1). It used to
 * ask with confirm() and show nothing. Now the package that goes to IPFS is
 * shown with the warning, IPFS is named as a destination, the fingerprint is of
 * the exact bytes uploaded, sample data is refused without a review, and a yes
 * sends exactly what was shown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EnhancedMissionResult } from '../../../applications/netrunner/execution/BotMissionExecutor';

const publishPreparedOsint = vi.fn();
vi.mock('../../../applications/netrunner/integration/OsintNostrPublisher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../applications/netrunner/integration/OsintNostrPublisher')>();
  return { ...actual, publishPreparedOsint: (...a: unknown[]) => publishPreparedOsint(...a) };
});

import { reviewOsintBroadcast } from '../netrunner';
import { currentReview, decideReview, sha256Hex } from '../publishReview';

const result = (overrides: Partial<EnhancedMissionResult> = {}): EnhancedMissionResult => ({
  missionId: 'm-1',
  botId: 'bot-1',
  target: 'example.com',
  status: 'success',
  intelCollected: 3,
  operationsPerformed: ['scan'],
  duration: 4200,
  completedAt: Date.UTC(2026, 8, 26, 10, 0, 0),
  errors: [],
  usedMockData: false,
  qualityScore: 80,
  confidenceLevel: 70,
  specializedFindings: {},
  toolsUsed: ['shodan'],
  processingStages: ['collection'],
  rawDataGenerated: 3,
  observationsCreated: 3,
  correlationOpportunities: [],
  suggestedNextActions: [],
  ...overrides,
});

async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  // The first publish from a key must carry the publisher acknowledgement.
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

describe('reviewOsintBroadcast', () => {
  beforeEach(() => { publishPreparedOsint.mockReset().mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 2 }); });
  afterEach(async () => {
    for (let i = 0; i < 50 && currentReview(); i++) {
      decideReview(currentReview()!.id, false);
      await new Promise((r) => setTimeout(r, 0));
    }
  });

  it('shows the package with the warning and IPFS, and sends exactly what was shown', async () => {
    const outcome = reviewOsintBroadcast(result());
    const shown = await answer(true);

    expect(shown.act).toBe('Publish OSINT report');
    expect(shown.content.title).toBe('OSINT Report: example.com');
    expect(shown.notice).toMatch(/authorised to examine/);
    expect(shown.destinations[0]).toEqual({ address: 'IPFS', kind: 'ipfs' });
    expect(shown.confirmLabel).toMatch(/and IPFS$/);
    expect(await outcome).toEqual({ success: true, eventId: 'evt-1', relaysOk: 2 });
    const sent = publishPreparedOsint.mock.calls[0][0] as { package: unknown };
    expect(sha256Hex(JSON.stringify(sent.package))).toBe(shown.digest);
  });

  /*
   * It was sent with no signer, so the broadcaster looked only for a browser
   * extension, and with none it signed nothing and no relay ever took it
   * (found by plan item 9.3's check in a browser).
   */
  it("hands the announcement this app's signer", async () => {
    const outcome = reviewOsintBroadcast(result());
    await answer(true);
    await outcome;
    const options = publishPreparedOsint.mock.calls[0][1] as { signer?: { signEvent?: unknown; getPublicKey?: unknown } } | undefined;
    expect(typeof options?.signer?.signEvent).toBe('function');
    expect(typeof options?.signer?.getPublicKey).toBe('function');
  });

  it('sends nothing when the review is cancelled', async () => {
    const outcome = reviewOsintBroadcast(result());
    await answer(false);

    expect(await outcome).toBeNull();
    expect(publishPreparedOsint).not.toHaveBeenCalled();
  });

  // Refused while the package is built: the bridge will not make a report from
  // sample data. The review's own sample check stays as a second line.
  it('refuses sample data before any review opens', async () => {
    await expect(reviewOsintBroadcast(result({ usedMockData: true }))).rejects.toThrow(/sample data/);
    expect(currentReview()).toBeNull();
    expect(publishPreparedOsint).not.toHaveBeenCalled();
  });
});
