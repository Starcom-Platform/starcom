/**
 * Every active layer reaches the globe, not the first one with data.
 *
 * The rule this replaced was an EXCLUSIVE chain: if IntelReports was active and
 * non-empty it returned intel and stopped. That silently defeated
 * useGlobeLayerControl for the two layers sharing the 3D marker pipeline —
 * its own header says pinning exists so a layer stays visible across mode
 * switches, and every DATA renderer honours pins. This selector did not, so a
 * pinned RLSH layer was never drawn at all.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { combineActiveIntelLikeReports } from '../activeIntelLikeReports';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';

const marker = (pubkey: string, kind: 'intel' | 'rlsh'): IntelReportOverlayMarker => ({
  pubkey, title: pubkey, content: '', tags: [],
  latitude: 0, longitude: 0, timestamp: 0, author: 'a', kind,
});

const intel = [marker('i1', 'intel'), marker('i2', 'intel')];
const rlsh = [marker('r1', 'rlsh'), marker('r2', 'rlsh'), marker('r3', 'rlsh')];

describe('combineActiveIntelLikeReports', () => {
  it('draws BOTH layers when both are active', () => {
    // The case the old exclusive chain made impossible.
    const { reports } = combineActiveIntelLikeReports(
      [{ active: true, reports: intel }, { active: true, reports: rlsh }], 300);
    expect(reports).toHaveLength(5);
    expect(new Set(reports.map((r) => r.kind))).toEqual(new Set(['intel', 'rlsh']));
  });

  it('no longer lets a non-empty first layer suppress the second', () => {
    // Precisely the old bug: intel had data, so RLSH never reached the globe.
    const { reports } = combineActiveIntelLikeReports(
      [{ active: true, reports: intel }, { active: true, reports: rlsh }], 300);
    expect(reports.filter((r) => r.kind === 'rlsh')).toHaveLength(3);
  });

  it('draws one layer when only one is active', () => {
    const only = combineActiveIntelLikeReports(
      [{ active: false, reports: intel }, { active: true, reports: rlsh }], 300);
    expect(only.reports.map((r) => r.pubkey)).toEqual(['r1', 'r2', 'r3']);
  });

  it('draws nothing when no layer is active', () => {
    const none = combineActiveIntelLikeReports(
      [{ active: false, reports: intel }, { active: false, reports: rlsh }], 300);
    expect(none.reports).toEqual([]);
    expect(none.dropped).toBe(0);
  });

  it('REPORTS truncation rather than silently showing a subset', () => {
    // The per-layer caps do not compose: 500 intel plus 120 RLSH could put 620
    // animated models on the globe. A globe quietly showing 300 of 620 is a map
    // that lies about how much it is showing.
    const many = Array.from({ length: 10 }, (_, i) => marker(`m${i}`, 'intel'));
    const r = combineActiveIntelLikeReports([{ active: true, reports: many }], 4);
    expect(r.reports).toHaveLength(4);
    expect(r.dropped).toBe(6);
    expect(r.requested).toBe(10);
  });

  it('does not claim a drop when it fits exactly at the ceiling', () => {
    // An off-by-one here would warn on every full load and train the operator
    // to ignore the warning that matters.
    const r = combineActiveIntelLikeReports([{ active: true, reports: rlsh }], 3);
    expect(r.dropped).toBe(0);
    expect(r.reports).toHaveLength(3);
  });

  it('keeps layer order stable, so the same markers survive truncation each load', () => {
    const a = combineActiveIntelLikeReports(
      [{ active: true, reports: intel }, { active: true, reports: rlsh }], 3);
    const b = combineActiveIntelLikeReports(
      [{ active: true, reports: intel }, { active: true, reports: rlsh }], 3);
    expect(a.reports.map((r) => r.pubkey)).toEqual(b.reports.map((r) => r.pubkey));
  });
});
