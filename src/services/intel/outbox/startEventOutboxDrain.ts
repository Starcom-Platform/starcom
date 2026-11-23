/**
 * Sends the notes kept when no relay took them (EventOutbox, work package W1).
 *
 * The triggers are the findings outbox's (startOutboxDrain): once at startup, for what an earlier visit kept; when
 * the connection returns; and while anything waits, again after five minutes, then twice as long each time
 * nothing goes, up to six hours. Unlike findings, nothing here is signed again, so a locked key or a missing
 * signer holds nothing back.
 *
 * Nothing goes unseen: a report, or a mission, says its note waits, and can cancel it; the job rail counts what waits, holds it
 * and cancels it; and a drain that sends anything says so.
 */
import { eventOutbox, type EventOutbox, type ResendFn } from './EventOutbox';
import { resendSigned } from '../../nostr/sendSigned';
import { createRelayPool } from '../../nostr/relayPool';
import { hudInfo } from '../../../utils/hudNotifications';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'EventOutboxDrain' });

const FIRST_RETRY_MS = 5 * 60_000;
const LONGEST_RETRY_MS = 6 * 60 * 60_000;

/**
 * Each drain sends over one pool of its own, closed when the drain ends: a pool never closes a connection for being
 * idle, so one left open by every retry would hold a socket to each relay for as long as the tab is open.
 */
const resendOverOnePool = async (send: (resend: ResendFn) => Promise<void>): Promise<void> => {
  const pool = createRelayPool();
  try {
    await send((event, relays) => resendSigned(event, relays, pool));
  } finally {
    pool.destroy();
  }
};

export function startEventOutboxDrain(outbox: EventOutbox = eventOutbox, resend?: ResendFn): () => void {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let wait = FIRST_RETRY_MS;

  const tryAgainLater = () => {
    if (disposed || timer) return;
    timer = setTimeout(() => { timer = null; void attempt('retry'); }, wait);
  };

  const attempt = async (trigger: string) => {
    if (disposed) return;
    // Offline: the online event tries again.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
      let summary = { attempted: 0, sent: 0, stillPending: 0, abandoned: 0 };
      // Nothing waiting opens no connection.
      if ((await outbox.pending()).length > 0) {
        if (resend) summary = await outbox.drain(resend);
        else await resendOverOnePool(async (overPool) => { summary = await outbox.drain(overPool); });
      }
      const { attempted, sent, stillPending } = summary;
      if (sent > 0 || stillPending === 0) wait = FIRST_RETRY_MS;
      if (stillPending > 0) {
        tryAgainLater();
        wait = Math.min(wait * 2, LONGEST_RETRY_MS);
      }
      if (attempted > 0) log.info(`Drained on ${trigger}: ${sent} sent, ${stillPending} still waiting`);
      if (sent > 0) {
        hudInfo(
          `Sent ${sent} waiting note${sent === 1 ? '' : 's'}`,
          stillPending > 0 ? `${stillPending} still waiting for a relay.` : 'Nothing is left waiting.',
        );
      }
    } catch (err) {
      log.warn('Drain failed:', err instanceof Error ? err.message : String(err));
    }
  };

  // A Mission Package kept when no relay took it went: its mission is dispatched (W1c). Loaded only then.
  const stopRecording = outbox.whenSent(async (record, took) => {
    if (!record.after || !('dispatched' in record.after)) return;
    const { missionService } = await import('../MissionService');
    await missionService.recordKeptDispatch(record.after.dispatched.mission, record.event, took, record.relays.length);
  });

  void attempt('startup');

  const onOnline = () => { void attempt('reconnect'); };
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);

  // A note kept after startup is tried again later too.
  const stopHearing = outbox.onChange(() => {
    void outbox.pending().then((waiting) => { if (waiting.length > 0) tryAgainLater(); }).catch(() => {});
  });

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    stopHearing();
    stopRecording();
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
  };
}
