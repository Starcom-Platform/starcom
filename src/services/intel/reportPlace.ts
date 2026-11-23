/**
 * What a report says about where it is — including when it says nothing.
 *
 * ─── WHY THIS IS NOT A STRING ──────────────────────────────────────────────
 *
 * There are three states and they are different claims, so a caller must not
 * be able to render them as one. A coordinate is a point somebody published. A
 * jurisdiction is a place stated at territory resolution and NOT a point — the
 * publisher declined to give one, and a centroid invented from it would mark
 * somewhere nobody said anything happened. No place at all is a third thing
 * again: not a missing coordinate, not an unknown one, but a report whose
 * subject has no location, which is most of what desk work produces.
 *
 * Collapsing the last two into "location unknown" would be the worst of the
 * three, because it asserts that a location exists and this node failed to
 * learn it. For a records-request thread or a statutory analysis, nothing was
 * ever lost.
 *
 * ─── WHY IT EXISTS AT ALL ──────────────────────────────────────────────────
 *
 * Until 2026-09-20 no screen in the app rendered `jurisdictions`. A report kept
 * precisely because it named a country showed in the lists with its place line
 * simply absent, indistinguishable from one that named nowhere — and placeless
 * reports were refused at the door, so the third state could not occur. Both
 * changed together, and a reader now has to be able to tell all three apart.
 */
import type { IntelReportUI } from '../../types/intel/IntelReportUI';

export type ReportPlace =
  /** A point the publisher gave, or one derived from a shape they gave. */
  | { kind: 'point'; latitude: number; longitude: number }
  /** Territories the publisher named. Deliberately carries no coordinate. */
  | { kind: 'jurisdiction'; codes: string[] }
  /** The publisher named nowhere. An absence of claim, not of knowledge. */
  | { kind: 'none' };

/**
 * Both coordinates, or neither. A report with one is not half-placed; it is
 * unplaceable, and reportToMarker already refuses it on the same basis.
 */
export function reportPlace(report: Pick<IntelReportUI, 'latitude' | 'longitude' | 'jurisdictions'>): ReportPlace {
  const { latitude, longitude } = report;
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { kind: 'point', latitude: latitude as number, longitude: longitude as number };
  }

  const codes = (report.jurisdictions ?? []).filter((code) => code.trim().length > 0);
  if (codes.length > 0) return { kind: 'jurisdiction', codes };

  return { kind: 'none' };
}

/*
 * How a place reads is in the catalogue (D-ML, L3): workspace.placeAbout and reportPanel.subject, and
 * workspace.noPlace and reportPanel.noPlace. "about" rather than "in": the publisher said what the report
 * concerns, not where it was written or where its author is. A report about French subsidy policy is not a
 * report located in France. No place is stated as the publisher's silence, not as this node's failure.
 */
