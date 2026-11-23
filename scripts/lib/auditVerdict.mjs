/**
 * How the layer audit decides what a layer added, and how noisy its own frames are.
 *
 * ─── WHY THIS IS ITS OWN MODULE ────────────────────────────────────────────
 *
 * Both decisions were inline in audit-globe-layers.mjs, and both were wrong in
 * ways that only showed when the output was read beside itself. Extracted for
 * the same reason `rendererLabel.mjs` was: a claim a probe makes about an
 * application should be testable without launching one.
 *
 * ─── THE VERDICT WAS READING THE WRONG STATISTIC ───────────────────────────
 *
 * The run of 2026-09-17 reported "adds nothing visible over DiplomaticEvents"
 * for Resources and for Conflict Zones, while the very next lines of its own
 * output counted 244 and 183 marks at least 4x4 px at that view. Both cannot be
 * true.
 *
 * The verdict compared `addsOverModeFloor` — the fraction of PIXELS that differ
 * between one load of the layer and one load of the floor — against a noise
 * fraction measured the same way. That fraction is dominated by the animated
 * cloud shell, which moves between any two loads and dwarfs a few hundred small
 * marks. Meanwhile the mark count beside it is computed from two INDEPENDENT
 * pairs and keeps only what changed in both, which is precisely what cancels a
 * drifting cloud.
 *
 * So the verdict now reads the mark statistic. The pixel fraction is still
 * measured and still printed, labelled as what it is, because it is a real
 * measurement of something — just not of whether a layer drew anything.
 *
 * ─── THE NOISE FIGURE WAS INFLATED BY ITS OWN PAIRING ──────────────────────
 *
 * A layer's marks come from `(layer₁ vs floor₁)` and `(layer₂ vs floor₂)`: four
 * captures, two disjoint pairs, so the two comparisons have independent cloud
 * phases and only a real mark survives the intersection.
 *
 * The noise figure was built from three captures as `(b vs a)` and `(c vs a)` —
 * `a` on one side of BOTH pairs. Where a's clouds differ from b's and from c's,
 * the difference survives the intersection and is counted as a mark. That is
 * a's cloud phase leaking through, and it measured 161 marks at atlantic and 154
 * at americas against 0 at asiapac. The comment above that code already stated
 * the intent — "Four captures is what that takes: two pairs" — and the constant
 * beside it provided three.
 */

/** The safety factor a layer's marks must clear over its view's noise. */
export const NOISE_MULTIPLE = 1.5;

/**
 * Two pairs from four captures of the same view, sharing no capture.
 *
 * Throws rather than degrading: pairing off three captures is the defect this
 * exists to prevent, and a noise floor quietly measured the wrong way is worse
 * than a run that stops and says so.
 */
export function noisePairs(captures) {
  if (!Array.isArray(captures) || captures.length < 4) {
    throw new Error(
      `noisePairs needs four independent captures to make two disjoint pairs, got ${
        Array.isArray(captures) ? captures.length : typeof captures
      }. Sharing one capture across both pairs lets its cloud phase count as marks.`,
    );
  }
  const [a, b, c, d] = captures;
  return [[a, b], [c, d]];
}

/**
 * What a layer added over its mode's floor, decided on marks.
 *
 * `byView` is one entry per view: `{ view, marks, noiseMarks }`. The BEST view
 * decides, not the mean — a layer with data in one region is not half blank, it
 * is a layer whose data is in one region, and the per-view lines say which.
 */
export function layerVerdict({ isFloor, floorLabel, byView, noiseMultiple = NOISE_MULTIPLE }) {
  if (isFloor) {
    return { text: "its mode's floor — least drawn, not known empty", bestView: null, net: 0 };
  }
  const scored = (byView ?? []).map((v) => ({
    ...v,
    net: (v.marks ?? 0) - (v.noiseMarks ?? 0) * noiseMultiple,
  }));
  if (scored.length === 0) {
    return { text: `adds nothing visible over ${floorLabel}`, bestView: null, net: 0 };
  }
  const best = scored.reduce((a, b) => (b.net > a.net ? b : a), scored[0]);
  if (best.net <= 0) {
    return { text: `adds nothing visible over ${floorLabel}`, bestView: null, net: 0 };
  }
  return {
    text: `adds ${Math.round(best.net)} marks over ${floorLabel}, best at ${best.view}`,
    bestView: best.view,
    net: best.net,
  };
}
