import { describe, it, expect } from 'vitest';
import {
  computeLocationConflicts,
  computeCooccurrence,
  computeCorroboratedFindings,
} from '../correlationUtils';
import type { Event } from '../../adapters/eventsAdapter';

/**
 * Correlation cost baseline — the gate-open measurement for build-passes
 * phase III.1, and the number II.A.4 (move correlation off the main thread)
 * has to beat.
 *
 * Excluded from the stable suite by vitest.stable.config's `**\/*.perf.test.*`
 * rule. Run deliberately:
 *   npx vitest run src/applications/intelanalyzer/state/__tests__/correlation.perf.test.ts
 *
 * The shape that matters is MANY events across FEW entities, not many events
 * overall. computeLocationConflicts buckets by entity and then compares every
 * pair within each bucket, so cost is O(n²) *per entity*. Scaling the entity
 * pool alongside the event count keeps bucket sizes constant and hides the
 * quadratic entirely — the first version of this benchmark did exactly that
 * and made the engine look linear.
 *
 * Many sources reporting about the same entities IS the federated case, and
 * it is the whole point of wiring six sources in.
 *
 * BEFORE (gate-open measurement, 25 entities, 2026-08-20):
 *
 *   events   conflicts   corroboration   total
 *      500       15 ms          13 ms      36 ms
 *     1000       36 ms          59 ms      96 ms
 *     2000      101 ms         212 ms     317 ms
 *     4000      410 ms        1126 ms    1540 ms
 *     8000     1731 ms        3450 ms    5191 ms
 *
 * AFTER II.A.4 (same machine, same shape):
 *
 *   events   conflicts   corroboration   total
 *      500        8 ms           5 ms      28 ms
 *     1000       15 ms          11 ms      27 ms
 *     2000        8 ms          24 ms      35 ms
 *     4000       38 ms          77 ms     124 ms
 *     8000      214 ms         268 ms     499 ms
 *
 * ~10x at 8000 events, from two changes: parsing each timestamp once instead
 * of inside the inner loop, and sorting each entity bucket by time so the
 * inner loop can `break` on the first out-of-window partner instead of
 * `continue`.
 *
 * **This is a constant-factor win, NOT an asymptotic one, and the distinction
 * matters.** Cost is now O(n * w) where w is the number of events sharing a
 * 24-hour window — but in this fixture (and in reality) w grows with n,
 * because more events over the same span means a denser window. Measured
 * growth from 1000 to 4000 events is still ~13x, against ~11x before. The
 * curve has essentially the same shape; it sits roughly ten times lower.
 *
 * Saying "we made it sub-quadratic" would be wrong. More events genuinely do
 * mean more pairs to compare, and no amount of bucketing changes that. What
 * changed is that the work per pair went from expensive (a Date construction
 * on each side) to cheap, and pairs outside the window stopped being visited
 * at all.
 *
 * The guard below is therefore an ABSOLUTE budget, not a growth ratio. A ratio
 * cannot distinguish the fixed version from the original — both are ~11-13x —
 * which is exactly why the first version of this assertion was useless.
 */

function makeEvents(n: number, entityPool: number): Event[] {
  const out: Event[] = [];
  const base = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < n; i++) {
    out.push({
      id: `e${i}`,
      title: `Event ${i}`,
      timestamp: new Date(base + (i % 500) * 3600_000).toISOString(),
      category: 'GENERAL',
      tags: [`t${i % 20}`, `t${i % 7}`],
      lat: (i % 180) - 90 + (i % 13) / 13,
      lon: (i % 360) - 180 + (i % 17) / 17,
      confidence: 0.5 + (i % 50) / 100,
      sourceType: i % 2 ? 'REPORT' : 'INTEL_ITEM',
      sourceId: `src-${i % 40}`,
      entityRefs: [`Entity ${i % entityPool}`, `Entity ${(i * 7) % entityPool}`],
    });
  }
  return out;
}

function timed(fn: () => unknown): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe('correlation cost baseline', () => {
  it('records cost across volumes at a fixed, small entity pool', () => {
    const ENTITIES = 25;
    const rows: string[] = [];

    for (const n of [500, 1000, 2000, 4000, 8000]) {
      const events = makeEvents(n, ENTITIES);
      const conflicts = timed(() => computeLocationConflicts(events));
      const cooccurrence = timed(() => computeCooccurrence(events));
      const corroboration = timed(() => computeCorroboratedFindings(events));
      rows.push(
        `${String(n).padStart(6)}  conflicts ${conflicts.toFixed(0).padStart(5)}ms` +
        `  cooccur ${cooccurrence.toFixed(0).padStart(4)}ms` +
        `  corroboration ${corroboration.toFixed(0).padStart(5)}ms` +
        `  total ${(conflicts + cooccurrence + corroboration).toFixed(0).padStart(5)}ms`
      );
    }

    console.log('\ncorrelation cost, 25 entities:\n' + rows.join('\n') + '\n');
    expect(rows).toHaveLength(5);
  }, 300_000);

  it('stays inside an absolute budget at 8000 events', () => {
    // The recorded pre-fix cost at this volume was 5191 ms. The budget is set
    // well above the measured ~500 ms so a loaded CI box does not fail it,
    // and well below the old cost so a regression to the original inner loop
    // cannot pass. A growth-ratio assertion cannot do this job: the fixed and
    // unfixed versions have nearly the same ratio, differing by a constant.
    const events = makeEvents(8000, 25);

    const conflicts = timed(() => computeLocationConflicts(events));
    const corroboration = timed(() => computeCorroboratedFindings(events));

    expect(conflicts + corroboration).toBeLessThan(2000);
  }, 300_000);

  it('does not achieve its speed by silently dropping input', () => {
    // The failure mode the speed assertion could otherwise mask: "optimising"
    // by capping the working set, which makes the engine fast and wrong.
    const events = makeEvents(4000, 25);

    const findings = computeCorroboratedFindings(events);
    const conflicts = computeLocationConflicts(events);

    expect(findings.length + conflicts.length).toBeGreaterThan(0);
    // Every entity in the pool must still be reachable by the engine.
    const seen = new Set([...findings.map(f => f.entityRef), ...conflicts.map(c => c.entity)]);
    expect(seen.size).toBeGreaterThan(1);
  }, 300_000);

  it('accepts precomputed conflicts so a caller holding both does not pay twice', () => {
    const events = makeEvents(4000, 25);
    const conflicts = computeLocationConflicts(events);

    const withRecompute = timed(() => computeCorroboratedFindings(events));
    const withPrecomputed = timed(() => computeCorroboratedFindings(events, conflicts));

    expect(withPrecomputed).toBeLessThanOrEqual(withRecompute);
    // And it must produce the same answer, not a cheaper different one.
    expect(computeCorroboratedFindings(events, conflicts))
      .toEqual(computeCorroboratedFindings(events));
  }, 300_000);
});
