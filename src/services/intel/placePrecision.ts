/**
 * How precisely a place is given, as a radius a person can choose (plan items
 * 1.9 and 0.11). One list, for the report form and for a click on the globe,
 * so a precision the globe computes is always one the form can show.
 */
export const PLACE_PRECISIONS: ReadonlyArray<{ metres: number; label: string }> = [
  { metres: 10, label: 'Exact, within 10 m' },
  { metres: 100, label: 'Within 100 m' },
  { metres: 1_000, label: 'Within 1 km' },
  { metres: 10_000, label: 'Within 10 km' },
  { metres: 100_000, label: 'Within 100 km' },
  { metres: 1_000_000, label: 'Within 1,000 km' },
];

/**
 * The nearest step at least as coarse as `metres`: rounding down would state a
 * place as more exact than it is.
 */
export function snapPrecisionUp(metres: number): number {
  const step = PLACE_PRECISIONS.find((p) => p.metres >= metres);
  return (step ?? PLACE_PRECISIONS[PLACE_PRECISIONS.length - 1]).metres;
}
