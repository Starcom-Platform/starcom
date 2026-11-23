// conflictZonesTheme.ts — pure color/scale logic for ConflictZones' two layers: real GDELT
// conflict/violence events (war-events layer) and real UNHCR displacement magnitudes
// (humanitarian-crisis layer). Deliberately its own file, not an addition to
// resourceZoneTheme.ts — that file already exports an unrelated conflictZoneColor for
// disputed/line-of-control border highlighting within ResourceZones; reusing the name here
// would collide in meaning, not just in identifier.
//
// Kept apart from the THREE-touching hook (useConflictZones3D.ts), same reasoning as
// diplomaticEventTheme.ts/resourceZoneTheme.ts: trivially unit-testable, no THREE/DOM
// dependency.

// War-event severity: real GoldsteinScale, -10..+10. ConflictZones only ever sees the
// conflict-root-code range (14-20, see GDELTEventService.getRealConflictEvents), which is
// predominantly negative — verified live before building this (getRealConflictEvents' own
// test asserts >50% negative). Colour ramps from amber (mild — e.g. root 14 "Protest" near
// 0) to deep red (severe — e.g. root 19 "Fight" near -10).
const WAR_EVENT_COLOR_MILD = { r: 0xff, g: 0xaa, b: 0x33 }; // amber
const WAR_EVENT_COLOR_SEVERE = { r: 0xff, g: 0x22, b: 0x22 }; // red

function warEventSeverity(goldsteinScale: number): number {
  // 0 (mild/near-zero or positive) .. 1 (severe, GoldsteinScale -10)
  return Math.max(0, Math.min(10, -goldsteinScale)) / 10;
}

export function warEventColor(goldsteinScale: number): number {
  const t = warEventSeverity(goldsteinScale);
  const r = Math.round(WAR_EVENT_COLOR_MILD.r + (WAR_EVENT_COLOR_SEVERE.r - WAR_EVENT_COLOR_MILD.r) * t);
  const g = Math.round(WAR_EVENT_COLOR_MILD.g + (WAR_EVENT_COLOR_SEVERE.g - WAR_EVENT_COLOR_MILD.g) * t);
  const b = Math.round(WAR_EVENT_COLOR_MILD.b + (WAR_EVENT_COLOR_SEVERE.b - WAR_EVENT_COLOR_MILD.b) * t);
  return (r << 16) | (g << 8) | b;
}

const WAR_MARKER_SCALE_MIN = 0.6;
const WAR_MARKER_SCALE_MAX = 2.0;

export function goldsteinToWarMarkerScale(goldsteinScale: number): number {
  return WAR_MARKER_SCALE_MIN + warEventSeverity(goldsteinScale) * (WAR_MARKER_SCALE_MAX - WAR_MARKER_SCALE_MIN);
}

// Humanitarian-crisis magnitude: real UNHCR combined displacement total (idps + refugees +
// asylum_seekers), ranging from real low-hundreds up to Sudan's real ~11.6M (2024/2025 —
// the world's largest displacement crisis, see UNHCRDisplacementService.ts) — a log scale,
// not linear, or the handful of largest crises would swamp every other marker down to
// invisibility.
export const HUMANITARIAN_CRISIS_COLOR = 0xcc44ff; // magenta-violet, distinct from the war-event red/amber spectrum

const HUMANITARIAN_SCALE_MIN = 0.5;
const HUMANITARIAN_SCALE_MAX = 2.5;
const HUMANITARIAN_LOG_MIN = 2; // 10^2 = 100 — near the real observed floor
const HUMANITARIAN_LOG_MAX = 7; // 10^7 = 10,000,000 — above Sudan's real ~11.6M ceiling

export function displacementToMarkerScale(total: number): number {
  if (total <= 0) return HUMANITARIAN_SCALE_MIN;
  const log = Math.log10(total);
  const t = Math.max(0, Math.min(1, (log - HUMANITARIAN_LOG_MIN) / (HUMANITARIAN_LOG_MAX - HUMANITARIAN_LOG_MIN)));
  return HUMANITARIAN_SCALE_MIN + t * (HUMANITARIAN_SCALE_MAX - HUMANITARIAN_SCALE_MIN);
}
