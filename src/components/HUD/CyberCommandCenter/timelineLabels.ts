/**
 * Which event names the timeline can print without printing them over each other.
 *
 * Every event's name went on one row just above its pin. With the 93 events a dev
 * session loads, the pins sit a few pixels apart and the names ran together into
 * a band nobody could read. A name is now printed only where it has room, in one
 * of a few rows, and more important events get first claim on that room. Every
 * pin is still drawn; only names are left off, and the view says how many.
 */
export interface LabelCandidate {
  id: string;
  /** Centre of the name, which is where its pin is. */
  x: number;
  /** Width of the name as it will be drawn. */
  width: number;
  importance: number;
}

export interface PlacedLabel {
  id: string;
  /** 0 is the row nearest the pins. */
  row: number;
}

export function placeLabels(
  candidates: LabelCandidate[],
  options: { rows: number; gap: number; minX: number; maxX: number },
): PlacedLabel[] {
  const { rows, gap, minX, maxX } = options;
  const taken: Array<Array<[number, number]>> = Array.from({ length: rows }, () => []);
  const order = [...candidates].sort(
    (a, b) => (b.importance || 0) - (a.importance || 0) || a.x - b.x,
  );

  const placed: PlacedLabel[] = [];
  for (const candidate of order) {
    const left = candidate.x - candidate.width / 2;
    const right = candidate.x + candidate.width / 2;
    // A name that would run off the canvas is not printed at all, rather than cut.
    if (left < minX || right > maxX) continue;

    for (let row = 0; row < rows; row++) {
      if (taken[row].every(([l, r]) => right + gap <= l || r + gap <= left)) {
        taken[row].push([left, right]);
        placed.push({ id: candidate.id, row });
        break;
      }
    }
  }
  return placed;
}
