/**
 * What the layer audit is allowed to conclude.
 *
 * ─── WHY THESE NUMBERS ─────────────────────────────────────────────────────
 *
 * Every figure below is from the run of 2026-09-17, which is the run that showed
 * both defects. Using the real numbers means a regression reproduces the exact
 * false statement the audit made rather than a made-up one.
 *
 * That run reported "adds nothing visible over DiplomaticEvents" for Resources
 * and Conflict Zones while counting 244 and 183 marks at least 4x4 px at the
 * same view. It reached that verdict from a pixel fraction the animated cloud
 * shell dominates, and it compared it against a noise floor inflated by sharing
 * one capture across both of its pairs.
 */
import { describe, it, expect } from 'vitest';
import { noisePairs, layerVerdict, NOISE_MULTIPLE } from '../lib/auditVerdict.mjs';

describe('noisePairs', () => {
  it('makes two pairs that share no capture', () => {
    const [first, second] = noisePairs(['a', 'b', 'c', 'd']);

    expect(first).toEqual(['a', 'b']);
    expect(second).toEqual(['c', 'd']);
    for (const capture of first) expect(second).not.toContain(capture);
  });

  /*
   * The defect itself. Three captures cannot make two disjoint pairs, and the
   * code that tried paired them as (b,a) and (c,a) — a on both sides, so a's
   * cloud phase survived the intersection and counted as 161 marks at atlantic.
   */
  it('refuses to pair off three captures', () => {
    expect(() => noisePairs(['a', 'b', 'c'])).toThrow(/four independent captures/);
  });

  it('says why, so the message names the consequence and not just the count', () => {
    expect(() => noisePairs(['a', 'b', 'c'])).toThrow(/cloud phase/);
  });

  it('refuses what is not a set of captures at all', () => {
    expect(() => noisePairs(undefined as unknown as string[])).toThrow();
    expect(() => noisePairs([] as string[])).toThrow();
  });
});

describe('layerVerdict', () => {
  /*
   * The two false verdicts, as they were measured. Resources counted 387, 759
   * and 508 marks at the three views against noise of 161, 154 and 0, and was
   * reported as adding nothing visible.
   */
  it('does not call a layer with hundreds of marks invisible', () => {
    const verdict = layerVerdict({
      isFloor: false,
      floorLabel: 'DiplomaticEvents (relative)',
      byView: [
        { view: 'atlantic', marks: 387, noiseMarks: 161 },
        { view: 'americas', marks: 759, noiseMarks: 154 },
        { view: 'asiapac', marks: 508, noiseMarks: 0 },
      ],
    });

    expect(verdict.text).not.toMatch(/adds nothing/);
    expect(verdict.text).toMatch(/^adds \d+ marks over DiplomaticEvents \(relative\)/);
    expect(verdict.net).toBeGreaterThan(0);
  });

  it('does not call Conflict Zones invisible either', () => {
    const verdict = layerVerdict({
      isFloor: false,
      floorLabel: 'DiplomaticEvents (relative)',
      byView: [
        { view: 'atlantic', marks: 330, noiseMarks: 161 },
        { view: 'americas', marks: 793, noiseMarks: 154 },
        { view: 'asiapac', marks: 606, noiseMarks: 0 },
      ],
    });

    expect(verdict.text).not.toMatch(/adds nothing/);
    expect(verdict.bestView).toBe('asiapac');
  });

  /*
   * And it must still be able to say a layer drew nothing, or it would only ever
   * flatter. Satellites measured 166 marks at atlantic against 161 of noise and
   * 0 at asiapac — a CelesTrak refusal, and correctly nothing.
   */
  it('still says nothing visible when the marks are all noise', () => {
    const verdict = layerVerdict({
      isFloor: false,
      floorLabel: 'IntelReports (relative)',
      byView: [
        { view: 'atlantic', marks: 166, noiseMarks: 161 },
        { view: 'americas', marks: 61, noiseMarks: 154 },
        { view: 'asiapac', marks: 0, noiseMarks: 0 },
      ],
    });

    expect(verdict.text).toBe('adds nothing visible over IntelReports (relative)');
    expect(verdict.bestView).toBeNull();
  });

  /*
   * The best view decides, and on marks it is a different view than the pixel
   * fraction chose. Cyber Threats was reported "best at atlantic", where its 167
   * marks are indistinguishable from 161 of noise; its only real marks are the
   * 13 at asiapac, where the noise is 0.
   */
  it('picks the view where the marks are real, not where the pixels moved most', () => {
    const verdict = layerVerdict({
      isFloor: false,
      floorLabel: 'IntelReports (relative)',
      byView: [
        { view: 'atlantic', marks: 167, noiseMarks: 161 },
        { view: 'americas', marks: 88, noiseMarks: 154 },
        { view: 'asiapac', marks: 13, noiseMarks: 0 },
      ],
    });

    expect(verdict.bestView).toBe('asiapac');
    expect(verdict.text).toContain('adds 13 marks');
  });

  it('says what the floor is rather than comparing it with itself', () => {
    const verdict = layerVerdict({ isFloor: true, floorLabel: 'unused', byView: [] });

    expect(verdict.text).toBe("its mode's floor — least drawn, not known empty");
  });

  it('claims nothing when it measured no views', () => {
    expect(layerVerdict({ isFloor: false, floorLabel: 'X', byView: [] }).text)
      .toBe('adds nothing visible over X');
    expect(layerVerdict({ isFloor: false, floorLabel: 'X' }).text)
      .toBe('adds nothing visible over X');
  });

  /*
   * The safety factor is the one the fraction-based verdict already used, moved
   * onto the statistic that cancels clouds rather than dropped.
   */
  it('requires the marks to clear the noise by the stated margin', () => {
    const atMargin = layerVerdict({
      isFloor: false, floorLabel: 'X',
      byView: [{ view: 'v', marks: 100 * NOISE_MULTIPLE, noiseMarks: 100 }],
    });
    const above = layerVerdict({
      isFloor: false, floorLabel: 'X',
      byView: [{ view: 'v', marks: 100 * NOISE_MULTIPLE + 20, noiseMarks: 100 }],
    });

    expect(atMargin.text).toMatch(/adds nothing/);
    expect(above.text).toMatch(/adds 20 marks/);
  });
});
