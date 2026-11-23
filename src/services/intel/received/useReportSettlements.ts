import { useEffect, useMemo, useState } from 'react';
import { MissionLabelIngest } from '../MissionLabelIngest';
import { useAccessVersion } from '../../nostr/accessChanges';
import type { MissionLabel } from '../missionLabels';
import type { TakenMission } from './takenMissions';
import { settlementOf, settlersOf, type Settlement } from './reportSettlement';

/** Labels held at most, newest kept, as the claims reader holds them. */
const MAX_HELD = 500;
/** The words a label on a report can say, read apart from claims so a busy mission's claims cannot crowd them out. */
const REPORT_WORDS = ['settled', 'witnessed', 'challenged'] as const;

/**
 * How each report sent on this mission stands (NavCom §5.3; D-MX, MX30), by its id inside the seal. The labels are
 * asked for by the mission and the word, never by report: asking a relay for labels on a report's id would tell it
 * which report this browser sent. A report sent before its id was kept has none, and is left out. Read again each
 * minute, so a report settles by silence on the screen as its seven days end.
 */
export function useReportSettlements(mission: Pick<TakenMission, 'coordinate' | 'signer' | 'reports'>): ReadonlyMap<string, Settlement> {
  const [labels, setLabels] = useState<MissionLabel[]>([]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const access = useAccessVersion();
  const sent = (mission.reports ?? []).filter((r) => r.id && r.author);
  const coordinate = sent.length > 0 ? mission.coordinate ?? '' : '';

  useEffect(() => {
    if (!coordinate) return undefined;
    const ingest = new MissionLabelIngest();
    const off = ingest.subscribe((label) => setLabels((held) => [...held, label].slice(-MAX_HELD)));
    ingest.start([coordinate], REPORT_WORDS);
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => {
      off();
      ingest.stop();
      clearInterval(tick);
      setLabels([]);
    };
  }, [coordinate, access]);

  const ids = sent.map((r) => r.id).join(' ');
  return useMemo(() => {
    const settlers = settlersOf(mission.signer, now);
    return new Map(sent.map((r) => [r.id!, settlementOf({ id: r.id!, author: r.author!, at: Date.parse(`${r.day}T00:00:00Z`) / 1000 }, settlers, labels, now)]));
    // `sent` is read through `ids`, so a new array of the same reports reads nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, mission.signer, labels, now]);
}
