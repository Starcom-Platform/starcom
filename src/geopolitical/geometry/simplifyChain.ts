/**
 * A line on the globe, simplified (decision D-ZR; the owner's pick of 2026-10-18: where it lags, Sector lines simpler
 * at a distance). Douglas–Peucker in degrees, with a cap on how long a kept span may be, measured as arc: a fat line
 * is drawn as straight segments between its points, so a long span would cut a chord through the globe instead of
 * following it. Both ends are always kept, so lines that meet still meet.
 */
type LngLat = [number, number];

/** How far apart two points are, in degrees of arc, near enough for spans of a degree or two. */
const arc = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot((b[0] - a[0]) * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180), b[1] - a[1]);

/** How far a point is from the segment between two others, in degrees, the same way. */
function offset(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const ax = a[0] * k; const bx = b[0] * k; const px = p[0] * k;
  const dx = bx - ax; const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (p[1] - a[1]) * dy) / length2));
  return Math.hypot(px - (ax + t * dx), p[1] - (a[1] + t * dy));
}

/** The points of `chain` worth keeping: none further than `tolerance` from the line kept, no span longer than `maxSpan`. */
export function simplifyChain<P extends readonly number[] = LngLat>(chain: readonly P[], tolerance: number, maxSpan: number): P[] {
  if (chain.length <= 2) return [...chain];
  const keep = new Uint8Array(chain.length);
  keep[0] = 1;
  keep[chain.length - 1] = 1;
  const spans: Array<[number, number]> = [[0, chain.length - 1]];
  while (spans.length > 0) {
    const [i, j] = spans.pop()!;
    if (j - i < 2) continue;
    let farthest = -1;
    let most = -1;
    for (let k = i + 1; k < j; k++) {
      const d = offset(chain[k], chain[i], chain[j]);
      if (d > most) { most = d; farthest = k; }
    }
    if (most > tolerance) {
      keep[farthest] = 1;
      spans.push([i, farthest], [farthest, j]);
      continue;
    }
    // Straight enough, but too long a span to follow the globe: as many even pieces as it needs, at once.
    const pieces = Math.ceil(arc(chain[i], chain[j]) / maxSpan);
    if (pieces <= 1) continue;
    let from = i;
    for (let piece = 1; piece < pieces; piece++) {
      const at = i + Math.round(((j - i) * piece) / pieces);
      if (at <= from || at >= j) continue;
      keep[at] = 1;
      spans.push([from, at]);
      from = at;
    }
    spans.push([from, j]);
  }
  return chain.filter((_, k) => keep[k] === 1);
}
