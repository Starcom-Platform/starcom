import { normalizeEntityName } from '../entity/normalizeEntityName';
import type { AttentionItem } from './AttentionItem';
import type { OpenCase } from './contradictionProducer';

export const FOREIGN_CLAIM_PRODUCER = 'foreign-claim-intersecting-open-case';

/** A claim published by another instance, as CorrelationContext surfaces it. */
export interface ForeignClaim {
  entityRef: string;
  authorPubkey: string;
  /** DERIVED weight — see deriveAttestationWeight. Never a number the author asserted. */
  weight: number;
  /** Whether the foreign evidence is genuinely independent of ours, or the same evidence counted twice. */
  independence: string;
  corroborationValue: number;
}

export interface ForeignClaimProducerInput {
  claims: ForeignClaim[];
  openCases: OpenCase[];
  /**
   * Entity names a source record mentions — CorrelationContext.entitiesForSource.
   *
   * Required, because a case links record IDS while a foreign claim names an
   * ENTITY, and nothing joins those two without the events in between. Passing
   * the resolver rather than a prebuilt map keeps the index's ownership in the
   * context that already maintains it.
   */
  entitiesForSource: (sourceId: string) => string[];
}

/**
 * Foreign claims about entities an open case is actually about.
 *
 * Same discipline as the contradiction producer: the filter is the feature.
 * Every federated claim is *interesting*; almost none are anyone's business
 * today, and a queue that lists them all is a relay firehose with a badge.
 */
export function produceForeignClaimItems(
  input: ForeignClaimProducerInput,
  now: () => Date = () => new Date(),
): AttentionItem[] {
  const { claims, openCases, entitiesForSource } = input;

  // normalized entity name -> cases concerned with it.
  const casesByEntity = new Map<string, OpenCase[]>();
  for (const c of openCases) {
    for (const sourceId of c.linkedSourceIds) {
      for (const raw of entitiesForSource(sourceId)) {
        const key = normalizeEntityName(raw);
        const at = casesByEntity.get(key);
        if (at && !at.includes(c)) at.push(c);
        else if (!at) casesByEntity.set(key, [c]);
      }
    }
  }

  const at = now().toISOString();
  const items: AttentionItem[] = [];

  for (const claim of claims) {
    for (const c of casesByEntity.get(normalizeEntityName(claim.entityRef)) ?? []) {
      items.push({
        // Author included: two instances claiming the same thing are two
        // separate pieces of news, and collapsing them would hide exactly the
        // independence that makes federation worth anything.
        id: `foreign:${c.id}:${claim.authorPubkey}:${normalizeEntityName(claim.entityRef)}`,
        subject: claim.entityRef,
        subjectKind: 'unknown',
        reason: 'foreign-claim-intersects-case',
        producedBy: FOREIGN_CLAIM_PRODUCER,
        caseId: c.id,
        firstSeen: at,
        lastSeen: at,
        /**
         * Severity is the claim's CORROBORATION VALUE, not its weight.
         *
         * A strong claim resting on evidence we already hold tells us nothing
         * new — it is our own conclusion arriving back with a stranger's name
         * on it, and ranking by weight would put that at the top. What
         * deserves attention is independence: evidence we did not have.
         */
        severity: claim.corroborationValue,
        state: 'new',
        explanation:
          `Another instance (${claim.authorPubkey.slice(0, 12)}…) published a claim about ` +
          `${claim.entityRef}, named in case "${c.title}". Independence: ${claim.independence}.`,
        // A verified signature proves the claim is authentic, not that the
        // evidence behind it is real — the publisher's own corpus could be a
        // demo feed and we have no way to tell. 'real' would be a claim about
        // someone else's data that we are in no position to make.
        evidenceProvenance: 'unknown',
      });
    }
  }

  return items;
}
