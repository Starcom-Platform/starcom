import { useEffect, useMemo, useState } from 'react';
import { MissionLabelIngest } from './MissionLabelIngest';
import { useAccessVersion } from '../nostr/accessChanges';
import { claimsOn, type MissionLabel, type PackageClaim } from './missionLabels';

/** Labels held at most, newest kept: a busy package must not grow without end. */
const MAX_HELD = 500;

export interface MissionLabels {
  /** The public claims on this package that have not expired, one per key. */
  claims: (coordinate: string) => PackageClaim[];
  /** Whether a relay has sent all it holds: before that, no claims seen says nothing. */
  answered: boolean;
}

/**
 * NavCom's labels on these packages (D-MX, MX1, MX5), read while shown.
 * Expiry is looked at again each minute, so a lapsed claim drops off the
 * screen as it lapses.
 */
export function useMissionLabels(coordinates: readonly string[]): MissionLabels {
  const [labels, setLabels] = useState<MissionLabel[]>([]);
  const [answered, setAnswered] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  // Joined, so the watch restarts on a change of set, not on every new array.
  const key = [...new Set(coordinates.filter((c) => c.trim()))].sort().join('|');
  // Read again when a key is made or a team relay joined: a relay that requires sign-in refused the read before (plan 0.3).
  const access = useAccessVersion();

  useEffect(() => {
    const wanted = key ? key.split('|') : [];
    if (wanted.length === 0) return undefined;
    const ingest = new MissionLabelIngest();
    // The ingest passes each event once, and this starts empty whenever the watch changes.
    const off = ingest.subscribe((label) => setLabels((held) => [...held, label].slice(-MAX_HELD)));
    const offAnswered = ingest.onAnswered(() => setAnswered(true));
    ingest.start(wanted);
    return () => {
      off();
      offAnswered();
      ingest.stop();
      setLabels([]);
      setAnswered(false);
    };
  }, [key, access]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(tick);
  }, []);

  return useMemo(() => ({ claims: (coordinate: string) => claimsOn(labels, coordinate, now), answered }), [labels, now, answered]);
}
