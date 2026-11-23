import { explainAttestationWeight } from '../findings/deriveAttestationWeight';
import type { PublishedFinding } from '../findings/PublishedFindingsLedger';
import type { AttentionItem } from './AttentionItem';

export const DECAYED_FINDING_PRODUCER = 'published-finding-needing-recheck';

/**
 * Weight below which a standing claim wants revisiting.
 *
 * 0.35 is roughly where a well-corroborated finding lands after about a year
 * under the reference 180-day half-life. Chosen so the queue stays quiet for
 * months and then asks once, rather than nagging from the first week — a
 * recheck prompt that arrives too early is indistinguishable from noise and
 * gets dismissed, which then suppresses the one that mattered.
 */
export const RECHECK_WEIGHT_THRESHOLD = 0.35;

export interface DecayedFindingProducerInput {
  /** Claims this instance is still asserting — publishedFindingsLedger.live(). */
  published: PublishedFinding[];
  threshold?: number;
}

/**
 * Our own published claims that have decayed past usefulness.
 *
 * The only producer here whose subject is US. The other two watch the world;
 * this one watches what we told the world and have not revisited since.
 *
 * It exists because publishing is not a terminal action under the attestation
 * model. A claim keeps being served by every relay holding it, its derived
 * weight falls quietly, and nobody downstream is in a position to notice —
 * consumers see a low weight and simply discount it, which looks identical to
 * a claim that was always weak. Only the publisher can tell the difference
 * between "this decayed" and "this was never strong", and only the publisher
 * can recheck or withdraw it.
 */
export function produceDecayedFindingItems(
  input: DecayedFindingProducerInput,
  now: () => Date = () => new Date(),
): AttentionItem[] {
  const threshold = input.threshold ?? RECHECK_WEIGHT_THRESHOLD;
  const stamp = now();
  const at = stamp.toISOString();
  const items: AttentionItem[] = [];

  for (const record of input.published) {
    if (record.retractedAt) continue;

    const w = explainAttestationWeight(record.content, { now: stamp });
    if (w.weight >= threshold) continue;

    items.push({
      // The slot alone. A decayed claim is one concern per slot however many
      // times it has been republished, and including a timestamp or the weight
      // would resurface it as new on every pass as it decays further.
      id: `decayed:${record.slot}`,
      subject: record.content.claim.subjectRef,
      subjectKind: record.content.claim.subjectKind,
      reason: 'published-finding-decayed',
      producedBy: DECAYED_FINDING_PRODUCER,
      // Not tied to a case: this concerns something WE published, which
      // outlives any particular investigation.
      caseId: '',
      firstSeen: at,
      lastSeen: at,
      /**
       * Severity RISES as weight falls, and is capped below 1.
       *
       * The obligation grows the longer a weak claim stands unexamined. Capped
       * so a very old claim can never outrank a live contradiction — decay is
       * a debt worth paying, but it is not an emergency, and letting it reach
       * the top of the queue would bury the things that are.
       */
      severity: Math.min(0.6, (threshold - w.weight) / threshold * 0.6),
      state: 'new',
      explanation:
        `You published this ${Math.round(w.ageDays)} days ago; its derived weight has fallen to ` +
        `${w.weight.toFixed(2)} (recency ${w.recency.toFixed(2)}). It is still standing on every relay that holds it.`,
      // Known-real by construction: publicationPolicy refuses to broadcast a
      // finding whose evidence is not explicitly real, so nothing else can
      // reach the ledger. That gate did not exist when this producer was
      // written — the comment here originally asserted the guarantee before
      // anything enforced it, which is exactly the kind of claim I.B.3 is
      // about. It is true now because it is checked.
      evidenceProvenance: 'real',
    });
  }

  return items;
}
