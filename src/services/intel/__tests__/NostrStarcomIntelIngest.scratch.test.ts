/**
 * Our own fixtures are not intel, and the globe should not draw them as intel.
 *
 * ─── WHAT WAS ON THE GLOBE ─────────────────────────────────────────────────
 *
 * Three of the seven pins a first-time visitor saw were ours: "Backbone-
 * Activation Cross-Node Verification <timestamp>", carrying
 * `QmScratchVerificationCidPlaceholder1234567890abcdef` — a CID that points at
 * nothing — placed at the coordinates of Washington DC because that is what the
 * scratch script happened to hardcode. They were published on 2026-08-06 by
 * cross-node verification runs and tagged `t=scratch-verification` by those
 * runs, which is exactly the mark needed to tell them apart.
 *
 * ─── WHY THIS IS THE ONLY AVAILABLE FIX ────────────────────────────────────
 *
 * They cannot be unpublished. NIP-09 deletion and addressable replacement both
 * require a signature from the publishing key, and the audit on 2026-09-23
 * found the three events carry three DIFFERENT pubkeys — one per run, minted by
 * uncommitted scratch scripts (`src/services/intel/__tests__/__scratch_*`) that
 * no longer exist. Those secrets are gone, so nobody on earth can retract these
 * three events. They are on nostr.mom and nos.lol permanently.
 *
 * So the fix is at the read side, which is the side we still control: refuse
 * our own scratch marker at ingest. That also generalises — the tag is in the
 * interchange spec, so any node reading this vocabulary can drop fixtures the
 * same way rather than each discovering these three posts for themselves.
 *
 * ─── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * It refuses on the TAG alone, never on the title or the placeholder CID.
 * Content heuristics would eventually refuse somebody's real report for saying
 * the word "test", and a read path that silently drops real intel is a worse
 * failure than a fixture on the globe.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { nostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

/** The real shape of what is on the relays, tag for tag. */
const scratchPost = (overrides: Record<string, unknown> = {}) => ({
  id: `evt-${Math.random().toString(36).slice(2, 10)}`,
  pubkey: '2fab0c45058ae72b3dc92056c1dd83b6d3ed6921df5222643cd887bada8fd8a9',
  created_at: Math.floor(Date.parse('2026-08-06T14:17:48.000Z') / 1000),
  kind: 30023,
  tags: [
    ['d', 'starcom_intel_QmScratchVerificationCidPlaceholder1234567890abcdef'],
    ['t', 'starcom_intel'],
    ['t', 'starcom-intel'],
    ['t', 'scratch-verification'],
  ],
  content: JSON.stringify({
    title: 'Backbone-Activation Cross-Node Verification 1786025868340',
    ipfsCid: 'QmScratchVerificationCidPlaceholder1234567890abcdef',
    solanaTx: null,
    lat: 38.9072,
    lon: -77.0369,
  }),
  sig: 'sig',
  ...overrides,
});

/** A real report from a peer, identical but for the scratch tag. */
const realPost = () => scratchPost({
  id: `evt-${Math.random().toString(36).slice(2, 10)}`,
  tags: [
    ['d', 'starcom-intel-case-417'],
    ['t', 'starcom_intel'],
  ],
  content: JSON.stringify({
    title: 'Permit filings cluster near the substation',
    lat: 42.3314,
    lon: -83.0458,
  }),
});

async function ingest(raw: ReturnType<typeof scratchPost>): Promise<IntelReportUI[]> {
  const got: IntelReportUI[] = [];
  const off = nostrStarcomIntelIngest.subscribe((r) => got.push(r));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = nostrStarcomIntelIngest as any;
  const wasActive = svc.active;
  svc.active = true;
  try {
    await svc.handleEvent(raw, 'wss://test-relay');
  } finally {
    svc.active = wasActive;
    off();
  }
  return got;
}

describe('NostrStarcomIntelIngest: our own fixtures', () => {
  beforeEach(() => {
    // resetState is private; these assertions are about counters, and a shared
    // singleton carrying the previous test's totals would make them meaningless.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (nostrStarcomIntelIngest as any).resetState();
  });

  it('refuses an event tagged as our scratch verification', async () => {
    const reports = await ingest(scratchPost());
    expect(reports).toHaveLength(0);
  });

  it('counts the refusal rather than dropping it silently', async () => {
    await ingest(scratchPost());
    expect(nostrStarcomIntelIngest.getMetrics().droppedScratch).toBe(1);
  });

  it('does not count a fixture as accepted', async () => {
    await ingest(scratchPost());
    const metrics = nostrStarcomIntelIngest.getMetrics();
    expect(metrics.accepted).toBe(0);
    expect(metrics.acceptedEvents).toBe(0);
  });

  it('still accepts a real report that merely looks similar', async () => {
    // Same kind, same vocabulary, same publisher shape — only the mark differs.
    // If this ever fails, the refusal has grown into content sniffing.
    const reports = await ingest(realPost());
    expect(reports).toHaveLength(1);
    expect(reports[0].title).toBe('Permit filings cluster near the substation');
    expect(nostrStarcomIntelIngest.getMetrics().droppedScratch).toBe(0);
  });

  it('refuses regardless of which key signed it', async () => {
    // Three different pubkeys published these; the mark is the tag, not the author.
    const reports = await ingest(scratchPost({
      pubkey: 'd9685067cd794c35b93288b55b8dfbfee29d2fdefe856e3db30b8141667d7fd2',
      id: 'evt-second-key',
    }));
    expect(reports).toHaveLength(0);
  });
});
