/**
 * The Intel Reports Starcom holds now (D-PW, PW89): those the ingest has accepted, as it replays them, then each new
 * one and each withdrawal, told in bursts (burst.ts) so a relay's hundreds make one render. Read only while asked.
 */
import { useEffect, useState } from 'react';
import { nostrStarcomIntelIngest } from '../../intel/NostrStarcomIntelIngest';
import { burst } from '../../nostr/burst';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const NONE: IntelReportUI[] = [];

export function useHeldIntelReports(active: boolean): IntelReportUI[] {
  const [reports, setReports] = useState<IntelReportUI[]>(NONE);
  useEffect(() => {
    if (!active) return undefined;
    const held = new Map<string, IntelReportUI>();
    const told = burst(() => setReports([...held.values()]));
    nostrStarcomIntelIngest.replayAccepted((report) => { held.set(report.id, report); });
    told.now();
    const offNew = nostrStarcomIntelIngest.subscribe((report) => { held.set(report.id, report); told.soon(); });
    const offGone = nostrStarcomIntelIngest.onWithdrawn((ids) => { ids.forEach((id) => held.delete(id)); told.soon(); });
    return () => { offNew(); offGone(); };
  }, [active]);
  return reports;
}
