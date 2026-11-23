/**
 * Mecha Jono's Terminator Watch notes are AI Watch's (decision D-AW, AW1). Those with a place carry
 * `starcom_intel` too, so the intel intake drew them as Intel Reports; they move out, as RLSH moved into
 * Hero Watch, and each is counted as handed to its own mode rather than dropped silently.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

type Raw = { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string };
const LIVE: Raw[] = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/ai-watch/terminator_watch_live_2026-10-12.json'), 'utf8'));
const placed = LIVE.filter((e) => e.tags.some((t) => t[0] === 'jurisdiction'));

async function ingest(raw: Raw): Promise<IntelReportUI[]> {
  const got: IntelReportUI[] = [];
  const off = nostrStarcomIntelIngest.subscribe((r) => got.push(r));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = nostrStarcomIntelIngest as any;
  const wasActive = svc.active;
  svc.active = true;
  try {
    await svc.handleEvent(raw, 'wss://record.cosmiccodex.app');
  } finally {
    svc.active = wasActive;
    off();
  }
  return got;
}

describe('NostrStarcomIntelIngest: AI Watch notes', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (nostrStarcomIntelIngest as any).resetState();
  });

  it('draws no Terminator Watch note as an Intel Report, the placed ones included', async () => {
    expect(placed).toHaveLength(9);
    for (const note of placed) expect(await ingest(note)).toHaveLength(0);
  });

  it('counts each as handed to its own mode, not as invalid', async () => {
    for (const note of placed) await ingest(note);
    const metrics = nostrStarcomIntelIngest.getMetrics();
    expect(metrics.droppedOwnMode).toBe(9);
    expect(metrics.droppedInvalid).toBe(0);
    expect(metrics.accepted).toBe(0);
  });

  it('still reads the same publisher\'s other intel', async () => {
    const note = placed[0];
    const intel = { ...note, id: 'other-intel', tags: note.tags.filter((t) => !(t[0] === 't' && t[1] === 'terminator_watch')).map((t) => (t[0] === 'd' ? ['d', 'starcom-intel-other-1'] : t)) };
    expect(await ingest(intel)).toHaveLength(1);
  });
});
