import { useEffect, useState } from 'react';
import { intelReportService } from '../../services/intel/IntelReportService';
import { intelCaseService } from '../../services/intel/IntelCaseService';
import { missionService } from '../../services/intel/MissionService';
import type { CoachRecords } from './coachSteps';

/**
 * The records the coach's steps are checked against, read from the same
 * services the screens use and read again whenever one changes: a step is
 * done the moment the record says so. Null while reading, and not read at all
 * while the coach is off.
 */
export function useCoachRecords(on: boolean): CoachRecords | null {
  const [records, setRecords] = useState<CoachRecords | null>(null);
  useEffect(() => {
    if (!on) { setRecords(null); return; }
    let live = true;
    const read = async () => {
      try {
        const [reports, cases, missions] = await Promise.all([
          intelReportService.listReports(), intelCaseService.listCases(), missionService.listMissions(),
        ]);
        if (live) setRecords({ reports, cases, missions: missions.map((m) => ({ ...m, status: String(m.status) })) });
      } catch {
        // Unread records complete nothing; the coach waits rather than guessing.
      }
    };
    void read();
    const stops = [intelReportService.onChange(() => { void read(); }), intelCaseService.onChange(() => { void read(); }), missionService.onChange(() => { void read(); })];
    return () => { live = false; stops.forEach((stop) => stop()); };
  }, [on]);
  return records;
}
