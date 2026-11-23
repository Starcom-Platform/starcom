/**
 * Asks you took on from another node's Mission Package (plan item 2.6).
 *
 * The package is gone once the relays stop sending it, and the receiver reads
 * only the last day's, so the queue is where the work is found again. Each
 * ask stays until you let it go from the package or retire it here.
 */
import type { TakenAsk } from '../received/takenAsks';
import type { AttentionItem } from './AttentionItem';
import { formatUtcDateTime } from '../../../utils/utcTime';

export const TAKEN_ASK_PRODUCER = 'taken-ask';

export function produceTakenAskItems(input: {
  asks: TakenAsk[];
  /** What to call the key that signed the package: a name someone gave it, or the key. */
  callSigner: (pubkey: string) => string;
}): AttentionItem[] {
  return input.asks.map((taken) => {
    const takenMs = Date.parse(taken.takenAt);
    const when = Number.isFinite(takenMs) ? `, on ${formatUtcDateTime(takenMs, { year: true })}` : '';
    return {
      // The ask alone: one concern however often the queue recomputes.
      id: `taken-ask:${taken.signer}:${taken.packageId}:${taken.askId}`,
      subject: taken.ask,
      // Neither is measured: an ask is work, not an entity, and has no evidence of its own.
      subjectKind: 'unknown',
      evidenceProvenance: 'unknown',
      reason: 'ask-you-took-on',
      producedBy: TAKEN_ASK_PRODUCER,
      caseId: '',
      firstSeen: taken.takenAt,
      lastSeen: taken.takenAt,
      severity: 0.5,
      state: 'new',
      explanation: `You took this on from "${taken.packageName}", a package signed by ${input.callSigner(taken.signer)}${when}.`
        + (taken.handsBack ? ` It hands back ${taken.handsBack}.` : ''),
    };
  });
}
