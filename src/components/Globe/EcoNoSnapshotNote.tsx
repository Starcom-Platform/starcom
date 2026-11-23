/**
 * Says why the globe draws no eco disasters while the shared time is paused
 * before the first eco snapshot, and when that snapshot was captured (decision
 * D-E, settled 2026-09-14 for step 8). A later snapshot, or live data, would show
 * disasters that had not happened by then. Renders nothing otherwise.
 */
import React from 'react';
import type { UseEcoHistoryPlaybackState } from '../../hooks/useEcoHistoryPlayback';
import { noEcoSnapshotBy } from '../../services/epistemic/epistemicLanguage';
import { formatUtcDateTime } from '../../utils/utcTime';

const noteStyle: React.CSSProperties = {
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  color: '#00ffff',
  padding: '8px 12px',
  borderRadius: '4px',
  fontSize: '12px',
  maxWidth: '280px',
  lineHeight: 1.4,
};

/** Whether there is something to say: paused, loaded, and no snapshot at or before the moment. */
export const showsNoEcoSnapshot = (playback: UseEcoHistoryPlaybackState): boolean =>
  !playback.loading && playback.scrubTime !== null && playback.currentSnapshot === null;

export const EcoNoSnapshotNote: React.FC<{ playback: UseEcoHistoryPlaybackState; quakesDrawn?: boolean }> = ({ playback, quakesDrawn = false }) => {
  const { scrubTime, minTime } = playback;
  if (!showsNoEcoSnapshot(playback) || scrubTime === null) return null;
  // With the year: a paused moment can be any year back to the quakes' history (D-EQ, EQ15).
  const first = minTime === null ? null : formatUtcDateTime(minTime, { year: true });
  return (
    <div data-testid="globe-eco-no-snapshot" style={noteStyle}>
      🌋 {noEcoSnapshotBy(formatUtcDateTime(scrubTime, { year: true }), first, quakesDrawn).text}
    </div>
  );
};

export default EcoNoSnapshotNote;
