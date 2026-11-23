/**
 * How to DESCRIBE whatever the pointer is over.
 *
 * Extracted so it can be tested. The three call sites that need this — the
 * tooltip's entity label, its confidence tag, and the screen-reader
 * announcement — all previously read global mode state, and the third did so on
 * the same line as `hoveredModel.report.title`. The object was in hand and the
 * mode was asked instead.
 *
 * The integration harness for that component passes `models: []` and drives no
 * raycast, so it can only ever exercise the nothing-hovered path. Testing the
 * dispatch through it would mean simulating three.js picking in jsdom; naming
 * the rule makes the contract assertable directly.
 */
import { modelKind } from '../../interfaces/IntelReportOverlay';
import type { IntelOverlayMarkerKind, IntelReportOverlayMarker } from '../../interfaces/IntelReportOverlay';

export interface MarkerPresentation {
  kind: IntelOverlayMarkerKind;
  entityLabel: string;
  /**
   * geoConfidence is a property only RLSH markers carry. Gating it on MODE
   * meant that in RLSH mode an intel marker was offered a tag it does not
   * have, and a pinned RLSH marker in any other mode was denied one it does.
   */
  showConfidenceTag: boolean;
}

const LABELS: Record<IntelOverlayMarkerKind, string> = {
  intel: 'Intel Report',
  rlsh: 'RLSH Entity',
};

/**
 * @param hovered   the model under the pointer, or null when nothing is
 * @param primaryModeKind what the current PRIMARY mode implies — used only when
 *   nothing is hovered, because then the label describes no object and the mode
 *   is the best available guess. Reading the marker unconditionally reported
 *   "Intel Report" in RLSH mode with an empty pointer, which an integration
 *   test caught: it was a regression in the one state the old code got right
 *   for free.
 */
export function describeHoveredMarker(
  hovered: { report?: Pick<IntelReportOverlayMarker, 'kind'> } | null | undefined,
  primaryModeKind: IntelOverlayMarkerKind,
): MarkerPresentation {
  const kind = hovered ? modelKind(hovered) : primaryModeKind;
  return {
    kind,
    entityLabel: LABELS[kind],
    showConfidenceTag: kind === 'rlsh',
  };
}
