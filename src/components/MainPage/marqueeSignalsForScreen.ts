import type { PrimaryMarqueeSignal } from './usePrimaryMarqueeData';

/**
 * Which readouts the strip under the header carries on each screen (decision D-F,
 * step 3.4).
 *
 * It carried all fourteen everywhere: someone reading Cases was told the Solana link
 * was up, the chain's block height, the route mode and the auth posture, none of it
 * about the case in front of them. A strip that reports things the screen has nothing
 * to do with teaches its readers to stop reading it.
 *
 * What is left out is not lost: the strip opens a status panel that holds every
 * readout, on every screen (SystemStatusPanel).
 */
const SCREEN_SIGNALS: Record<string, readonly string[]> = {
  // The globe draws what the ingest brings in, so the ingest is its own business.
  cybercommand: [
    'timestamp',
    'nostr-relays',
    'nostr-ingest-counters',
    'nostr-throughput-window',
    'geoint-quality-ratio',
  ],
  // The intel screens work the reports those counters count.
  inteldashboard: ['timestamp', 'intel-workflow-counters', 'intel-workflow-archive'],
  intelanalyzer: ['timestamp', 'intel-workflow-counters', 'intel-workflow-archive'],
  intelweb: ['timestamp', 'intel-workflow-counters', 'intel-workflow-archive'],
};

/**
 * The readouts this screen carries, in the order they were given. A screen this does
 * not name carries none: a guess would put a number in front of someone with no way
 * to tell whether it was about their screen.
 */
export function signalsForScreen(
  currentApp: string | null | undefined,
  signals: readonly PrimaryMarqueeSignal[],
): PrimaryMarqueeSignal[] {
  const wanted = currentApp ? SCREEN_SIGNALS[currentApp] : undefined;
  if (!wanted) return [];
  const ids = new Set(wanted);
  return signals.filter((signal) => ids.has(signal.id));
}
