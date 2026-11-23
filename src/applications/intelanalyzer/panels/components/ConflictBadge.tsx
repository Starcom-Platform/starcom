import React from 'react';
import { Chip } from '@mui/material';
import type { LocationConflict } from '../../state/correlationUtils';

export interface ConflictBadgeProps {
  sourceId?: string;
  locationConflicts: LocationConflict[];
}

/**
 * Mirrors AnomalyBadge's pattern exactly — a visible, informational chip,
 * never a block. Unlike AnomalyBadge, not gated behind the showClusters
 * toggle (that toggle controls an unrelated map-overlay feature; hiding a
 * real contradiction behind it would undercut the whole point of surfacing
 * one). A single credible report is often the entire point of ground-truth
 * reporting — this is context for a human reviewer to weigh, never a
 * precondition for approval.
 */
// A conflict where both sides are well-corroborated (see LocationConflict.
// strength's doc comment) is a genuinely different situation from one
// where either side is shaky — color reflects that distinction so a
// reviewer can triage at a glance instead of having to read the tooltip
// on every badge.
const STRONG_CONFLICT_THRESHOLD = 0.7;

const ConflictBadge: React.FC<ConflictBadgeProps> = ({ sourceId, locationConflicts }) => {
  if (!sourceId) return null;
  const hit = locationConflicts.find(c => c.sourceIdA === sourceId || c.sourceIdB === sourceId);
  if (!hit) return null;
  const isStrong = hit.strength >= STRONG_CONFLICT_THRESHOLD;
  return (
    <Chip
      data-testid="inspector-conflict-badge"
      label={`Location conflict · ${hit.distanceKm}km / ${hit.hoursApart}h`}
      size="small"
      title={`"${hit.entity}" placed ${hit.distanceKm}km apart within ${hit.hoursApart}h across two reports (confidence: ${Math.round(hit.strength * 100)}%)`}
      sx={isStrong
        ? { backgroundColor: 'rgba(255,71,87,0.2)', color: '#ff4757' }
        : { backgroundColor: 'rgba(255,165,2,0.2)', color: '#ffa502' }}
    />
  );
};

export default ConflictBadge;
