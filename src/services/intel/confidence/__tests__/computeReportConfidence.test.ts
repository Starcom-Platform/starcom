/**
 * computeReportConfidence — Phase 1 (roadmap: "confidence scoring, option
 * 2 — weighted corroboration aggregate"). Previously, IntelReportUI.
 * confidence was a bare author-typed number (defaulting to 0.5) with zero
 * relationship to the reliability grades of the Intel it actually cited.
 */
import { describe, it, expect } from 'vitest';
import { computeReportConfidence, CONFIDENCE_ALGORITHM_VERSION } from '../computeReportConfidence';
import type { IntelReliability } from '../../../../types/intel/IntelItemUI';

function gradeMap(grades: Record<string, IntelReliability>) {
  return (id: string) => grades[id];
}

describe('computeReportConfidence', () => {
  it('returns null when there are no linked sources — caller should keep the author-typed value', () => {
    expect(computeReportConfidence(undefined, () => undefined)).toBeNull();
    expect(computeReportConfidence([], () => undefined)).toBeNull();
  });

  it('returns null when none of the linked ids resolve to a real Intel item', () => {
    expect(computeReportConfidence(['ghost-1', 'ghost-2'], () => undefined)).toBeNull();
  });

  it('a single linked source scores on its own merits — not diluted for lacking corroboration', () => {
    const result = computeReportConfidence(['intel-1'], gradeMap({ 'intel-1': 'A' }));
    expect(result).not.toBeNull();
    expect(result!.value).toBe(1.0); // A-grade weight, no corroboration bonus applied
    expect(result!.basis).toBe('derived');
    expect(result!.sourceCount).toBe(1);
    expect(result!.algorithmVersion).toBe(CONFIDENCE_ALGORITHM_VERSION);
  });

  it('a single low-reliability source is honestly scored low, not defaulted to 0.5', () => {
    const result = computeReportConfidence(['intel-1'], gradeMap({ 'intel-1': 'F' }));
    expect(result!.value).toBe(0.1);
  });

  it('corroboration from additional independent sources raises the score above the single-best source', () => {
    const single = computeReportConfidence(['intel-1'], gradeMap({ 'intel-1': 'B' }));
    const corroborated = computeReportConfidence(
      ['intel-1', 'intel-2', 'intel-3'],
      gradeMap({ 'intel-1': 'B', 'intel-2': 'B', 'intel-3': 'C' })
    );
    expect(corroborated!.value).toBeGreaterThan(single!.value);
  });

  it('the corroboration bonus is bounded — a pile of weak sources cannot manufacture certainty', () => {
    const grades: Record<string, IntelReliability> = {};
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const id = `intel-${i}`;
      ids.push(id);
      grades[id] = 'F'; // weight 0.1 each
    }
    const result = computeReportConfidence(ids, gradeMap(grades));
    // base 0.1 + bonus capped at 0.15 = 0.25, nowhere near "certain"
    expect(result!.value).toBeLessThanOrEqual(0.25);
  });

  it('never exceeds 1.0 even when the base score is already at the ceiling', () => {
    const result = computeReportConfidence(
      ['intel-1', 'intel-2', 'intel-3'],
      gradeMap({ 'intel-1': 'A', 'intel-2': 'A', 'intel-3': 'A' })
    );
    expect(result!.value).toBeLessThanOrEqual(1.0);
  });

  it('ids that fail to resolve are skipped, not treated as zero-weight evidence', () => {
    const result = computeReportConfidence(
      ['intel-1', 'ghost'],
      gradeMap({ 'intel-1': 'A' })
    );
    // Should behave identically to a single resolvable A-grade source —
    // an unresolvable id must not drag the score down as if it were a
    // real, poorly-rated source.
    expect(result!.value).toBe(1.0);
    expect(result!.sourceCount).toBe(1);
  });
});
