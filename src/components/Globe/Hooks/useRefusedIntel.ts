/**
 * What arrived under the intel hashtag and was refused before it could be drawn.
 *
 * Reads the ingest's own counters rather than deriving a second figure: the
 * service already counts every event it drops, and a count computed here would
 * be a second answer to one question — the same trap
 * `useGlobeIntelReportPipeline` names when it logs the hydration path's skipped
 * count instead of disclosing it.
 *
 * This answers a DIFFERENT question from that one. The hydration count is "what
 * is missing from the set now drawn"; this is "what reached this node and never
 * became a report at all". An event with no geo encoding never becomes a report,
 * so nothing downstream could report it.
 *
 * Subscribes to the ingest's change signal rather than polling, so a refusal
 * shows up when it happens and the globe does not wake on a timer to ask.
 */
import { useEffect, useState } from 'react';
import { nostrStarcomIntelIngest } from '../../../services/intel/NostrStarcomIntelIngest';

export interface RefusedIntel {
  count: number;
  /** By cause, because "no location" and "unreadable" have different fixes. */
  reasons: Record<string, number>;
}

const EMPTY: RefusedIntel = { count: 0, reasons: {} };

const read = (): RefusedIntel => {
  const metrics = nostrStarcomIntelIngest.getMetrics();
  const reasons: Record<string, number> = {};
  /*
   * Named for what the reader needs to know, not for the counter's variable
   * name. This said "with no location", which stopped being true on
   * 2026-09-20: an event with no place is now KEPT, so nothing is refused for
   * lacking one. What droppedNoGeo counts today is an event that claimed a
   * position and whose position could not be read — a malformed geohash, a
   * GeoJSON body that parsed to no features, a non-finite coordinate. That is
   * a defect in what arrived, and the wording has to say so, or the globe
   * reports placeless desk work as intel it turned away.
   */
  if (metrics.droppedNoGeo > 0) reasons['with an unreadable position'] = metrics.droppedNoGeo;
  if (metrics.droppedInvalid > 0) reasons['that could not be read'] = metrics.droppedInvalid;
  const count = Object.values(reasons).reduce((sum, n) => sum + n, 0);
  return count === 0 ? EMPTY : { count, reasons };
};

export function useRefusedIntel(): RefusedIntel {
  const [refused, setRefused] = useState<RefusedIntel>(read);

  useEffect(() => {
    // Read once on mount as well as on change: the ingest starts at boot and may
    // already have refused something before this component existed, which is the
    // same gap replayAccepted closes for accepted reports.
    setRefused(read());
    return nostrStarcomIntelIngest.onChange(() => setRefused(read()));
  }, []);

  return refused;
}
