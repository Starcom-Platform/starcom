/**
 * The colour of an electric-field sample: one brightness ramp over its rank.
 *
 * ─── WHAT THIS REPLACES ────────────────────────────────────────────────────
 *
 * Above the median a sample's colour was a percentile band; below it, the colour
 * named the dataset the sample came from. So 'top 10%' was rgba(255,165,0) and a
 * US/Canada sample below the median was rgba(255,140,0) — two oranges 25/255 apart
 * standing for opposite readings of the same field, and a drawn colour could not say
 * which of the two rules had produced it.
 *
 * One rule for every sample now: brightness rises with the sample's percentile rank
 * among the samples drawn. Which dataset a sample came from goes in its tooltip, not
 * its colour. The stops are plasma-like — purple through coral and orange to yellow —
 * and start well above black, so the bottom band still shows on a dark globe. That
 * lightness really does rise band by band is asserted by the test, not by this comment.
 *
 * One colour is off the ramp on purpose. The outlier detector flags samples outside
 * 1.5× the interquartile range on EITHER side. A strong one is drawn cyan, a hue the
 * ramp never reaches, so "off the scale" does not read as "slightly brighter than the
 * top band". A weak one keeps its band: an unusually quiet reading is still, truthfully,
 * in the bottom half, and a separate colour for it would give a reader two kinds of
 * "outlier" to tell apart for no reading they could act on.
 */

type Rgb = readonly [number, number, number];

export interface RampStop {
  /** The lowest percentile rank (0–100) this stop covers. */
  minRank: number;
  rgb: Rgb;
  /** What the colour stands for, as a legend or share card states it. */
  meaning: string;
}

/** Brightest first, so the first stop a rank reaches is its band. */
export const ELECTRIC_FIELD_RAMP: readonly RampStop[] = [
  { minRank: 90, rgb: [240, 249, 33], meaning: 'top 10% of samples' },
  { minRank: 70, rgb: [248, 149, 64], meaning: 'top 30%' },
  // Crimson rather than plasma's own coral here: coral sat 82 apart from the orange
  // above it, under the test's bar for colours a reader has to tell apart.
  { minRank: 50, rgb: [220, 56, 96], meaning: 'top half' },
  { minRank: 0, rgb: [156, 23, 158], meaning: 'bottom half' },
];

export const STRONG_OUTLIER: Omit<RampStop, 'minRank'> = {
  rgb: [77, 232, 255],
  meaning: 'unusually strong (outlier)',
};

export function electricFieldSampleColor(
  percentileRank: number,
  isOutlier: boolean,
  opacity: number,
): { color: string; meaning: string } {
  const rank = Number.isFinite(percentileRank) ? percentileRank : 0;
  const stop = isOutlier && rank >= 50
    ? STRONG_OUTLIER
    : ELECTRIC_FIELD_RAMP.find((s) => rank >= s.minRank) ?? ELECTRIC_FIELD_RAMP[ELECTRIC_FIELD_RAMP.length - 1];
  const [r, g, b] = stop.rgb;
  return { color: `rgba(${r}, ${g}, ${b}, ${opacity})`, meaning: stop.meaning };
}
