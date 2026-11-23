import { drainFindingsOutbox, canDrainFindingsOutbox } from './FindingsPublisherService';
import { publishOutbox } from '../outbox/PublishOutbox';
import { createLogger } from '@utils/logger';
import { hudInfo } from '../../../utils/hudNotifications';
import { subscribeKeyLock } from '../../identity/keyLock';

const log = createLogger({ prefix: 'OutboxDrain' });

/**
 * Runs the findings outbox.
 *
 * The outbox was built, tested, and never drained — a finding whose broadcast
 * reached no relay was durably queued and then sat there forever. The queue is
 * only half a retry mechanism without something that retries.
 *
 * Three triggers:
 *   - once at startup, for anything queued in a previous session
 *   - on regaining connectivity, which is the moment a previously-failed
 *     publish is most likely to succeed
 *   - while anything is waiting, again after five minutes, then twice as long
 *     each time nothing goes, up to six hours (plan item 9.4). The first two
 *     alone never retried a relay set that was down while the browser stayed
 *     online, until the next reload. A drain that sends something starts the
 *     wait over. Nothing is timed while the queue is empty.
 *
 * Nothing drains unseen (plan item 0.2): what is waiting is listed, and can be
 * cancelled, in the analyzer's rail (FindingsOutboxStatus), and a drain that
 * sends anything says so.
 */
const FIRST_RETRY_MS = 5 * 60_000;
const LONGEST_RETRY_MS = 6 * 60 * 60_000;

export function startFindingsOutboxDrain(): () => void {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let wait = FIRST_RETRY_MS;

  // One timer at a time: a later reason to try again waits for the one already set.
  const tryAgainLater = () => {
    if (disposed || timer) return;
    timer = setTimeout(() => { timer = null; void attempt('retry'); }, wait);
  };

  const attempt = async (trigger: string) => {
    if (disposed) return;
    // Offline, or no one to sign: the online event, or the next start, tries again.
    if (!canDrainFindingsOutbox()) return;
    try {
      const outcome = await drainFindingsOutbox();
      if (outcome.drained) {
        const { sent, stillPending } = outcome.summary;
        if (sent > 0 || stillPending === 0) wait = FIRST_RETRY_MS;
        if (stillPending > 0) {
          tryAgainLater();
          wait = Math.min(wait * 2, LONGEST_RETRY_MS);
        }
      }
      if (outcome.drained && outcome.summary.attempted > 0) {
        log.info(`Drained on ${trigger}: ${outcome.summary.sent} sent, ${outcome.summary.stillPending} still pending`);
      }
      if (outcome.drained && outcome.summary.sent > 0) {
        const { sent, stillPending } = outcome.summary;
        hudInfo(
          `Sent ${sent} waiting finding${sent === 1 ? '' : 's'}`,
          stillPending > 0 ? `${stillPending} still waiting for a relay.` : 'Nothing is left waiting.'
        );
      }
    } catch (err) {
      // Never let a drain failure escape into app startup.
      log.warn('Drain failed:', err instanceof Error ? err.message : String(err));
    }
  };

  void attempt('startup');

  const onOnline = () => { void attempt('reconnect'); };
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);

  // A locked key (D-KL) held the drain back; once the person unlocks it, what waited goes.
  const stopUnlock = subscribeKeyLock(() => { void attempt('unlock'); });

  // A finding queued after startup is tried again later too.
  const stopHearing = publishOutbox.onChange(() => {
    void publishOutbox.pending().then((waiting) => { if (waiting.length > 0) tryAgainLater(); }).catch(() => {});
  });

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    stopHearing();
    stopUnlock();
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
  };
}
