import React from 'react';
import { useGlobeIntelMarkers } from './Hooks/useGlobeIntelMarkers';
import { Docked } from '../Dock/Docked';
import {
  withheldAsExpired, stalestShown, hiddenByTimeWindow as hiddenByTimeWindowNote, truncatedMarks,
  unplaceableRecords, computedWhileDegraded, fabricatedInput, emptyBecause,
  refusedIntelEvents, openWorkOnEvidence as openWorkNote, openWorkNotDrawn,
  outlinesSimplified,
  territoriesNotDrawn,
  type Disclosure,
} from '../../services/epistemic/epistemicLanguage';
import { useRefusedIntel } from './Hooks/useRefusedIntel';
import { useOpenWork } from './Hooks/useOpenWork';
import { outlineSimplification } from '../../services/intel/globe/outlineFeatures';
import type { IntelReportOverlayMarker } from '../../interfaces/IntelReportOverlay';

/**
 * What the globe is NOT showing you.
 *
 * The intel layer computes a substantial amount of honesty metadata —
 * `unplaceable`, `emptyReason`, `degraded`, `integrity`, `truncated`, plus the
 * staleness and time-window figures the marker hook derives. Every one of it
 * was being discarded: Globe.tsx destructured `{ markers, arcs }` and dropped
 * the rest on the floor.
 *
 * So the globe rendered pins and said nothing about analysis that ran during a
 * source outage, findings that could not be placed, marks hidden by the time
 * cursor, or conclusions hours old. All of it was measured. None of it was
 * visible — which is the same end state as never having measured it, except
 * more expensive and more convincing.
 *
 * This component only ever states an absence or a caveat. It renders NOTHING
 * when there is nothing to disclose, so a clean globe stays clean and the
 * badge's presence is itself information.
 */

// Placement belongs to the dock now, not to this file — see dockOrder's
// globeIntelStatus slot for why.
const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  pointerEvents: 'none', maxWidth: 320,
  fontFamily: 'var(--sc-font-data)', fontSize: 11, lineHeight: 1.4,
};
const chip = (tone: 'warn' | 'info'): React.CSSProperties => ({
  padding: '3px 8px', borderRadius: 3,
  background: tone === 'warn' ? 'rgba(120,60,0,0.82)' : 'rgba(20,30,45,0.82)',
  border: `1px solid ${tone === 'warn' ? 'rgba(255,170,60,0.55)' : 'rgba(120,160,200,0.35)'}`,
  color: tone === 'warn' ? '#ffd9a0' : '#c8dcf0',
});

/**
 * `reportMarkers` are the INTEL REPORT marks, which is a different set from the
 * findings marks this component's layers describe. Only reports carry an
 * outline, and only the caller holds them — useGlobeIntelMarkers returns the
 * analysis layer. Passed in rather than re-derived, because a second read of
 * the report pipeline would be a second answer to one question.
 */
export const GlobeIntelStatus: React.FC<{
  reportMarkers?: readonly IntelReportOverlayMarker[];
  /**
   * Jurisdictions a publisher named that this globe holds no boundary for —
   * from useGlobeRegionMarks, which has always computed them and, until now,
   * returned them to nobody. Passed in rather than derived here because these
   * reports carry no coordinate and so never enter `reportMarkers`.
   */
  unmatchedTerritories?: readonly string[];
}> = ({ reportMarkers = [], unmatchedTerritories = [] }) => {
  const { layers, expiredLayers, ageMs, stale, hiddenByTimeWindow } = useGlobeIntelMarkers();
  const refused = useRefusedIntel();
  const openWork = useOpenWork();
  // Read from the marks themselves rather than from a second count: the shapes
  // drawn are the shapes these markers carry.
  const outlines = outlineSimplification(reportMarkers);
  const openObjectives = [...openWork.byReportId.values()].reduce((sum, n) => sum + n, 0);

  // Nothing published at all. Deliberately silent: the globe is being used for
  // something else, and a badge saying "no intel" on every other screen is
  // noise that trains people to ignore this corner.
  //
  // Refusals are the exception, and they are why this is not simply
  // `layers.length === 0`. Events arriving and being dropped is not the globe
  // being used for something else — it is the one case where an empty globe is
  // actively misleading, because somebody published and nobody was told.
  if (
    layers.length === 0 && expiredLayers.length === 0
    && refused.count === 0 && openObjectives === 0 && openWork.objectivesNotDrawn === 0
    // Found by running it: a globe showing a simplified shape and nothing else
    // returned null here, so the one disclosure that describes what IS drawn
    // could only ever appear alongside a disclosure about something else. The
    // tests missed it because their default fixture always has a layer.
    && outlines.simplified === 0
    // And again, for the same reason, with a territory named and not drawn:
    // the only thing worth saying about a globe whose sole region report is
    // `us-tx` is that it could not be drawn, and this guard swallowed exactly
    // that sentence. Every disclosure below has to appear here or it can only
    // ever be seen next to some other disclosure.
    && unmatchedTerritories.length === 0
  ) return null;

  // Sentences come from services/epistemic/epistemicLanguage, shared with the
  // other surfaces that disclose the same things. This component's twelve tests
  // are the specification for that wording and must keep passing verbatim —
  // they are what proves the extraction did not quietly reword anything.
  const notes: Disclosure[] = [];

  // Per layer, because each has its own source and its own age. A single
  // aggregate line would let one healthy source vouch for a broken one.
  for (const e of expiredLayers) {
    notes.push(withheldAsExpired(e.id, e.ageMs));
  }

  if (stale && ageMs !== null) {
    notes.push(stalestShown(ageMs));
  }
  if (hiddenByTimeWindow > 0) {
    notes.push(hiddenByTimeWindowNote(hiddenByTimeWindow));
  }
  // Before the per-layer notes: this is about what never reached a layer.
  if (refused.count > 0) {
    notes.push(refusedIntelEvents(refused.reasons));
  }
  // Work, not analysis — said in terms of the evidence, because that is the
  // only thing here with a position.
  if (openObjectives > 0) {
    notes.push(openWorkNote(openObjectives, openWork.byReportId.size));
  }
  if (openWork.objectivesNotDrawn > 0) {
    notes.push(openWorkNotDrawn(openWork.missionsNotDrawn, openWork.objectivesNotDrawn));
  }
  // A simplified boundary looks exactly like an exact one, so the count says
  // how many of the drawn shapes are not the shape that was published.
  if (outlines.simplified > 0) {
    notes.push(outlinesSimplified(outlines.simplified, outlines.drawn));
  }
  // A territory named and not drawn reads as "nothing was published about it"
  // unless it is said out loud.
  if (unmatchedTerritories.length > 0) {
    notes.push(territoriesNotDrawn([...unmatchedTerritories]));
  }

  for (const layer of layers) {
    // Name the source only when there is more than one; with a single layer
    // the prefix is noise. `cap` keeps the sentence reading correctly either
    // way rather than emitting a stray lowercase opening word.
    // Name the source only when there is more than one; with a single layer the
    // prefix is noise, and with several one healthy source must not vouch for a
    // broken one.
    const label = layers.length > 1 ? `${layer.id}: ` : '';
    if (layer.truncated) {
      const t = layer.truncated;
      notes.push(truncatedMarks(label, t.shown, t.total, Boolean(t.budgetOverrun)));
    }
    if (layer.unplaceable.count > 0) {
      notes.push(unplaceableRecords(label, layer.unplaceable.count, layer.unplaceable.reasons));
    }
    if (layer.degraded && layer.provenance.blindSpots.length > 0) {
      notes.push(computedWhileDegraded(label, layer.provenance.blindSpots));
    }
    if (layer.integrity && layer.integrity.mockCount > 0) {
      notes.push(fabricatedInput(label, layer.integrity.realRatio));
    }
    if (layer.marks.length === 0 && layer.emptyReason) {
      notes.push(emptyBecause(label, layer.emptyReason));
    }
  }

  if (notes.length === 0) return null;

  return (
    <Docked slot="globeIntelStatus">
      <div style={wrap} data-testid="globe-intel-status">
        {notes.map((n, i) => <div key={i} style={chip(n.tone)}>{n.text}</div>)}
      </div>
    </Docked>
  );
};

export default GlobeIntelStatus;
