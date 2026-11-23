/**
 * Intel Reports' feed line (decision D-LS, LS6): its state was only the relay chip ("2 OF 6 CONNECTED"), so the
 * first layer a visitor sees had no line in the loading status, the key or a card.
 *
 * A relay counts as answered once it has sent an event or the end of what it holds (`lastAnsweredAt`, BD11):
 * connecting is not an answer. The read is in when every relay has sent all it holds or its read has ended
 * (`storedRead`, plan H3), or when the read's own wait has run out since this saw it begin; it failed only if none
 * answered by then. Its time is the latest answer.
 *
 * In once every relay had ANSWERED, it was in at each relay's first note, with the rest still arriving: whenReady
 * let a clip's camera move then, and Mecha Jono's videos turned the planet while the reports came in (H3).
 */
import { useEffect, useRef, useState } from 'react';
import { nostrStarcomIntelIngest } from '../../../services/intel/NostrStarcomIntelIngest';
import type { FeedProvenance } from '../../../features/globe/capture/shareCardProvenance';

/** As long as a complete read waits for its relays (readComplete's READ_WAIT_MS). */
export const INTEL_READ_WAIT_MS = 30_000;

export function useIntelReportsFeed(shown: boolean): FeedProvenance | null {
  const [relays, setRelays] = useState(() => nostrStarcomIntelIngest.getRelayStatus());
  const [now, setNow] = useState(() => Date.now());
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!shown) return undefined;
    const update = () => setRelays([...nostrStarcomIntelIngest.getRelayStatus()]);
    update();
    return nostrStarcomIntelIngest.onChange(update);
  }, [shown]);

  if (shown && startedAt.current === null) startedAt.current = Date.now();
  const total = relays.length;
  const answered = relays.filter((r) => typeof r.lastAnsweredAt === 'number');
  const ended = relays.filter((r) => r.storedRead === 'ended');
  const waitedOut = startedAt.current !== null && now - startedAt.current >= INTEL_READ_WAIT_MS;
  const reading = shown && (ended.length < total || total === 0) && !waitedOut;

  // The wait is counted while it reads, and only then.
  useEffect(() => {
    if (!reading) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [reading]);

  if (!shown) return null;
  const latest = answered.reduce<number | null>((at, r) => (at === null || (r.lastAnsweredAt as number) > at ? r.lastAnsweredAt as number : at), null);
  return {
    name: `Intel Reports from the relays (${answered.length} of ${total} answered)`,
    shortName: 'Intel Reports',
    layer: 'IntelReports',
    lastUpdated: latest === null ? null : new Date(latest).toISOString(),
    loading: reading,
    error: !reading && answered.length === 0 ? `no relay answered in ${INTEL_READ_WAIT_MS / 1000} s` : null,
    progress: { done: ended.length, total },
  };
}
