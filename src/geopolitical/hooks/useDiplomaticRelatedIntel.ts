/**
 * Related intel for Diplomacy's drawer (decision D-DP, step 8): the Intel Reports in this browser's
 * workspace — its own and the notes received from The Record — about the countries in view, in the
 * time shown (diplomaticRelatedIntel.ts). Read only while the drawer shows a place or a country.
 */
import { useEffect, useMemo, useState } from 'react';
import { intelReportService } from '../../services/intel/IntelReportService';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import { relatedReports } from '../utils/diplomaticRelatedIntel';
import type { TimeSpan } from '../utils/gdeltTimeSpan';

const NO_REPORTS: IntelReportUI[] = [];

export function useDiplomaticRelatedIntel(countries: readonly string[], span: TimeSpan | null, active: boolean): IntelReportUI[] {
  const [reports, setReports] = useState<IntelReportUI[]>(NO_REPORTS);
  useEffect(() => {
    if (!active) return;
    let live = true;
    void intelReportService.listReports().then((list) => { if (live) setReports(list); }).catch(() => {});
    const off = intelReportService.onChange((list) => { if (live) setReports(list); });
    return () => { live = false; off(); };
  }, [active]);
  const key = [...countries].sort().join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the countries' codes, not the array
  return useMemo(() => (active ? relatedReports(reports, countries, span) : NO_REPORTS), [active, reports, key, span]);
}
