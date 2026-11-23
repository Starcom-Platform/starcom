/**
 * Mecha Jono's protest desk is Civil Unrest's (decision D-CU, CU3): its days of unrest and its protest surges carry
 * `starcom_intel`, so the intel intake drew them as Intel Reports. They move out, counted as handed to their own
 * layer, while the conflict surges stay Intel Reports.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

type Raw = { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string };
const LIVE: Raw[] = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/civil-unrest/unrest_live_2026-10-26.json'), 'utf8'));
const t = (e: Raw, v: string) => e.tags.some((tag) => tag[0] === 't' && tag[1] === v);
const unrest = LIVE.filter((e) => t(e, 'unrest_note'));
const protestSurges = LIVE.filter((e) => t(e, 'reporting_surge') && t(e, 'protest'));
const conflictSurges = LIVE.filter((e) => t(e, 'reporting_surge') && !t(e, 'protest'));

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

describe('NostrStarcomIntelIngest: Civil Unrest notes', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (nostrStarcomIntelIngest as any).resetState();
  });

  it('draws no day of unrest and no protest surge as an Intel Report', async () => {
    expect(unrest.length).toBeGreaterThan(10);
    expect(protestSurges.length).toBeGreaterThan(0);
    for (const note of [...unrest, ...protestSurges]) expect(await ingest(note), note.tags.find((x) => x[0] === 'd')?.[1]).toHaveLength(0);
  });

  it('counts each as handed to its own layer, not as invalid', async () => {
    for (const note of [...unrest, ...protestSurges]) await ingest(note);
    const metrics = nostrStarcomIntelIngest.getMetrics();
    expect(metrics.droppedOwnMode).toBe(unrest.length + protestSurges.length);
    expect(metrics.droppedInvalid).toBe(0);
  });

  it('still draws a conflict surge as an Intel Report', async () => {
    expect(conflictSurges.length).toBeGreaterThan(0);
    const drawn = (await Promise.all(conflictSurges.map(ingest))).flat();
    expect(drawn.length).toBeGreaterThan(0);
  });
});
